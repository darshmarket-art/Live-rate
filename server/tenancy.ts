import type { NextFunction, Request, Response } from 'express';
import { isValidStoreName } from '../shared/storeName';
import { HttpError } from './http';
import type { StoreCache, StoreRecord } from './stores';

/** The host the client asked for: lowercased, port and trailing dot removed. */
export const hostOf = (req: Request) => (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

/**
 * Which store a request is for. <store>.rates.<baseDomain> wins and cannot be overridden; otherwise the X-Store header or ?store=
 * (localhost, the installed app, the shop screen, tests).
 */
export function storeIdOf(req: Request, baseDomain: string): string | null {
  const host = hostOf(req);
  const suffix = `.rates.${baseDomain}`;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    return isValidStoreName(sub) ? sub : null;
  }
  const named = String(req.header('x-store') ?? req.query.store ?? '').toLowerCase();
  return isValidStoreName(named) ? named : null;
}

declare module 'express-serve-static-core' {
  interface Locals { store?: StoreRecord }
}

/** Puts the store on res.locals.store, or answers 404 for an address that names no store. */
export const resolveStore = (cache: StoreCache, baseDomain: string) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = storeIdOf(req, baseDomain);
    const rec = id ? await cache.record(id) : null;
    if (!rec) throw new HttpError(404, 'No store at this address.');
    res.locals.store = rec;
    next();
  } catch (e) {
    next(e);
  }
};

export const storeOf = (res: Response): StoreRecord => {
  if (!res.locals.store) throw new HttpError(404, 'No store at this address.');
  return res.locals.store;
};
