import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http';
import { storeOf } from './tenancy';

export interface Session { sub: string; store: string; role: 'buyer' | 'owner' }

declare module 'express-serve-static-core' {
  interface Locals { session?: Session }
}

const BUYER_TTL = '90d';
const OWNER_TTL = '30d';

export function createAuth(secret: string) {
  const sign = (s: Session) => jwt.sign(s, secret, { expiresIn: s.role === 'buyer' ? BUYER_TTL : OWNER_TTL, algorithm: 'HS256' });
  const read = (token: string | undefined): Session | null => {
    if (!token) return null;
    try {
      const v = jwt.verify(token, secret, { algorithms: ['HS256'] }) as Session;
      return v && (v.role === 'buyer' || v.role === 'owner') ? { sub: v.sub, store: v.store, role: v.role } : null;
    } catch {
      return null;
    }
  };
  const tokenOf = (req: Request) => {
    const h = req.header('authorization');
    if (h?.startsWith('Bearer ')) return h.slice(7);
    // EventSource cannot send headers: the rate stream alone accepts ?token=
    return typeof req.query.token === 'string' && req.path.endsWith('/stream') ? req.query.token : undefined;
  };
  /** The session, if any, for this store only (a token from another store counts as none). */
  const optional = (req: Request, res: Response, next: NextFunction) => {
    const s = read(tokenOf(req));
    if (s && res.locals.store && s.store === res.locals.store.id) res.locals.session = s;
    next();
  };
  const need = (role: Session['role']) => (req: Request, res: Response, next: NextFunction) => {
    optional(req, res, () => {
      const s = res.locals.session;
      if (!s) return next(new HttpError(401, role === 'owner' ? 'Sign in as the store owner.' : 'Sign in with your WhatsApp number.'));
      if (s.role !== role) return next(new HttpError(403, role === 'owner' ? 'Only the store owner can do this.' : 'Sign in with your WhatsApp number.'));
      storeOf(res);
      next();
    });
  };
  return { sign, read, optional, requireBuyer: need('buyer'), requireOwner: need('owner') };
}
export type Auth = ReturnType<typeof createAuth>;

export const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
