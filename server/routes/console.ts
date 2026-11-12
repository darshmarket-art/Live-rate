import bcrypt from 'bcryptjs';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { isValidStoreName } from '../../shared/storeName';
import { sameSecret } from '../auth';
import { FEED, MANUAL } from '../feed/ingest';
import { HttpError, handler, parse } from '../http';
import { scoped, type Store } from '../store';
import { DEFAULT_PROFILE, type StoreRecord } from '../stores';

/** Antarixs operators only (X-Master-Key): open a store, and type the rate by hand while the licensed feed is down. */
export function consoleRoutes(store: Store, masterKey?: string) {
  const r = Router();
  r.use((req: Request, _res: Response, next: NextFunction) => {
    const key = req.header('x-master-key') ?? '';
    if (!masterKey || !key || !sameSecret(key, masterKey)) return next(new HttpError(403, 'Operators only.'));
    next();
  });

  r.post('/stores', handler(async (req, res) => {
    const b = parse(z.object({ id: z.string().trim().toLowerCase(), name: z.string().trim().min(2).max(60), ownerEmail: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(200) }), req.body);
    if (!isValidStoreName(b.id)) throw new HttpError(400, 'Store id: 3 to 30 lowercase letters, digits or inner hyphens, and not a reserved word.');
    const rec: StoreRecord = { id: b.id, name: b.name, ownerEmail: b.ownerEmail, passwordHash: await bcrypt.hash(b.password, 10), createdAt: new Date().toISOString() };
    if (!(await store.create('stores', b.id, rec as any))) throw new HttpError(409, 'That store id is taken.');
    await store.set(scoped(b.id, 'settings'), 'profile', DEFAULT_PROFILE(b.name) as any);
    res.status(201).json({ status: 'success', store: { id: rec.id, name: rec.name, ownerEmail: rec.ownerEmail } });
  }));

  r.put('/feed/manual', handler(async (req, res) => {
    const b = parse(z.object({ on: z.boolean(), g: z.number().positive().optional(), s: z.number().positive().optional() }), req.body);
    if (b.on && (!b.g || !b.s)) throw new HttpError(400, 'Give both rates per gram: g (24K gold) and s (silver 999).');
    await store.set(FEED, MANUAL, { ...b, at: Date.now() });
    res.json({ status: 'success', manual: b });
  }));

  r.get('/feed', handler(async (_req, res) => {
    res.json({ status: 'success', latest: await store.get(FEED, 'latest'), manual: await store.get(FEED, MANUAL) });
  }));

  return r;
}
