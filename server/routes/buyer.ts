import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { BOOK_PRODUCTS, MAX_GRAMS, ROW_IDS, boardFor, perGram, statusOf, type BookProduct } from '../../shared/rates';
import { MAX_ACTIVE_ALERTS, type Alert } from '../alerts';
import type { Auth } from '../auth';
import type { FeedHub } from '../feed/hub';
import { HttpError, handler, newId, parse } from '../http';
import { HOLD_MS, readQuote, signQuote } from '../quotes';
import { scoped, type Store } from '../store';
import type { StoreCache } from '../stores';
import { storeOf } from '../tenancy';
import type { Buyer } from './auth';

export type BookingStatus = 'requested' | 'confirmed' | 'cancelled' | 'collected';
export interface Booking { ref: string; phone: string; name: string; product: BookProduct; grams: number; perGram: number; amount: number; status: BookingStatus; createdAt: string; updatedAt?: string; note?: string }

const ref = () => `RB-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;

/** A signed-in buyer: booking at a held rate, rate alerts and the notifications they produce. */
export function buyerRoutes(store: Store, cache: StoreCache, hub: FeedHub, auth: Auth, quoteSecret: string, onBooking: (storeId: string, b: Booking) => void = () => {}, sampleBookable = false) {
  const r = Router();
  r.use(auth.requireBuyer);

  /** The live rate for this product and weight, held for HOLD_MS. */
  const quote = async (storeId: string, storeName: string, phone: string, product: BookProduct, grams: number) => {
    const { desk } = await cache.get(storeId, storeName);
    if (!desk.bookingsOpen) throw new HttpError(409, 'The store is not taking bookings right now. Rates still update.');
    const tick = hub.latest();
    if (!tick || statusOf(tick) !== 'live') throw new HttpError(409, 'Rates are paused, so booking is paused too. Try again in a moment.');
    if (tick.sample && !sampleBookable) throw new HttpError(409, 'This is a sample feed, not market rates, so it cannot be booked.');
    const pg = perGram(product, boardFor(tick, desk), desk);
    if (!pg) throw new HttpError(409, 'The store does not show this rate.');
    const q = { store: storeId, phone, product, grams, perGram: pg, amount: Math.round(pg * grams), exp: Date.now() + HOLD_MS };
    return { ...q, token: signQuote(q, quoteSecret) };
  };

  r.post('/quotes', handler(async (req, res) => {
    const st = storeOf(res);
    const b = parse(z.object({ product: z.enum(BOOK_PRODUCTS), grams: z.number().positive() }), req.body);
    if (b.grams > MAX_GRAMS[b.product]) throw new HttpError(400, `Book up to ${MAX_GRAMS[b.product]} g at a time; call the store for more.`);
    res.json({ status: 'success', quote: await quote(st.id, st.name, res.locals.session!.sub, b.product, b.grams) });
  }));

  r.post('/bookings', handler(async (req, res) => {
    const st = storeOf(res);
    const { token } = parse(z.object({ token: z.string().max(2000) }), req.body);
    const read = readQuote(token, quoteSecret);
    const me = res.locals.session!.sub;
    if ('error' in read) {
      // the hold ran out: answer with a fresh rate so the buyer can book again in one tap
      const parsed = (() => { try { return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()); } catch { return null; } })();
      if (parsed && read.error.startsWith('The held rate')) throw new HttpError(409, read.error, 'QUOTE_EXPIRED', { quote: await quote(st.id, st.name, me, parsed.product, parsed.grams).catch(() => null) });
      throw new HttpError(400, read.error);
    }
    const q = read.quote;
    if (q.store !== st.id || q.phone !== me) throw new HttpError(400, 'That rate is not valid. Ask for a new one.');
    const { desk } = await cache.get(st.id, st.name);
    if (!desk.bookingsOpen) throw new HttpError(409, 'The store stopped taking bookings a moment ago.');
    const buyer = await store.get<Buyer>(scoped(st.id, 'buyers'), me);
    const booking: Booking = { ref: ref(), phone: me, name: buyer?.name ?? '', product: q.product, grams: q.grams, perGram: q.perGram, amount: q.amount, status: 'requested', createdAt: new Date().toISOString(), ...(hub.latest()?.sample ? { note: 'Booked on the sample feed (development).' } : {}) };
    // a held rate books once: a second tap with the same quote is refused
    const used = await store.create(scoped(st.id, 'quotesUsed'), crypto.createHash('sha256').update(token).digest('hex').slice(0, 40), { at: Date.now() });
    if (!used) throw new HttpError(409, 'This rate was already booked.');
    await store.set(scoped(st.id, 'bookings'), booking.ref, booking as any);
    onBooking(st.id, booking);
    res.status(201).json({ status: 'success', booking });
  }));

  r.get('/bookings/mine', handler(async (_req, res) => {
    const st = storeOf(res);
    const mine = await store.list<Booking>(scoped(st.id, 'bookings'), { where: [{ field: 'phone', op: '==', value: res.locals.session!.sub }] });
    res.json({ status: 'success', bookings: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) });
  }));

  r.get('/alerts', handler(async (_req, res) => {
    const st = storeOf(res);
    const mine = await store.list<Alert>(scoped(st.id, 'alerts'), { where: [{ field: 'phone', op: '==', value: res.locals.session!.sub }] });
    res.json({ status: 'success', alerts: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }));

  r.post('/alerts', handler(async (req, res) => {
    const st = storeOf(res);
    const b = parse(z.object({ row: z.enum(ROW_IDS), above: z.boolean(), mark: z.number().int().positive().max(100_000_000) }), req.body);
    const me = res.locals.session!.sub;
    const mine = await store.list<Alert>(scoped(st.id, 'alerts'), { where: [{ field: 'phone', op: '==', value: me }] });
    if (mine.filter((a) => a.active).length >= MAX_ACTIVE_ALERTS) throw new HttpError(409, `You can keep ${MAX_ACTIVE_ALERTS} alerts on at a time. Pause or remove one first.`);
    const alert: Alert = { id: newId('al'), phone: me, row: b.row, above: b.above, mark: b.mark, active: true, createdAt: new Date().toISOString() };
    await store.set(scoped(st.id, 'alerts'), alert.id, alert as any);
    res.status(201).json({ status: 'success', alert });
  }));

  const own = async (storeId: string, id: string, phone: string) => {
    const a = await store.get<Alert>(scoped(storeId, 'alerts'), id);
    if (!a || a.phone !== phone) throw new HttpError(404, 'No such alert.');
    return a;
  };
  r.patch('/alerts/:id', handler(async (req, res) => {
    const st = storeOf(res);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    const a = await own(st.id, req.params.id, res.locals.session!.sub);
    if (active && !a.active) {
      const mine = await store.list<Alert>(scoped(st.id, 'alerts'), { where: [{ field: 'phone', op: '==', value: a.phone }] });
      if (mine.filter((x) => x.active).length >= MAX_ACTIVE_ALERTS) throw new HttpError(409, `You can keep ${MAX_ACTIVE_ALERTS} alerts on at a time.`);
    }
    const next = { ...a, active, ...(active ? { triggeredAt: undefined, triggeredRate: undefined } : {}) };
    await store.set(scoped(st.id, 'alerts'), a.id, JSON.parse(JSON.stringify(next)));
    res.json({ status: 'success', alert: next });
  }));
  r.delete('/alerts/:id', handler(async (req, res) => {
    const st = storeOf(res);
    await own(st.id, req.params.id, res.locals.session!.sub);
    await store.delete(scoped(st.id, 'alerts'), req.params.id);
    res.json({ status: 'success' });
  }));

  r.get('/notifications', handler(async (_req, res) => {
    const st = storeOf(res);
    const mine = await store.list<{ at: string }>(scoped(st.id, 'notifications'), { where: [{ field: 'phone', op: '==', value: res.locals.session!.sub }] });
    res.json({ status: 'success', notifications: mine.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20) });
  }));

  return r;
}
