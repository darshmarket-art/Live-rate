import crypto from 'crypto';
import express, { Router } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { THEMES, checkAccent, tokensFor } from '../../shared/themes';
import { ROWS, baseFor, storeBase } from '../../shared/rates';
import type { Auth } from '../auth';
import type { FeedHub } from '../feed/hub';
import { MAX_BANNERS, bannerSchema, publicBanner, type Banner } from '../banners';
import type { Blobs } from '../blobs';
import { HttpError, audit, handler, newId, parse } from '../http';
import { scoped, type Store } from '../store';
import { deskSchema, profileSchema, themeSchema, type StoreCache } from '../stores';
import { storeOf } from '../tenancy';
import type { Booking, BookingStatus } from './buyer';

const NEXT: Record<BookingStatus, BookingStatus[]> = { requested: ['confirmed', 'cancelled'], confirmed: ['collected', 'cancelled'], cancelled: [], collected: [] };

/** The store owner's console: the rate desk, the look, the store details, banners, bookings and the shop screen's key. */
export function adminRoutes(store: Store, cache: StoreCache, blobs: Blobs, auth: Auth, hub: FeedHub) {
  const r = Router();
  r.use(auth.requireOwner);

  r.get('/settings', handler(async (_req, res) => {
    const st = storeOf(res);
    const s = await cache.get(st.id, st.name);
    res.json({ status: 'success', ...s, themes: Object.values(THEMES).sort((a, b) => Number(Boolean(b.duo)) - Number(Boolean(a.duo))).map(({ id, name, note, dark, tokens, display, duo }) => ({ id, name, note, dark, tokens, display, duo: Boolean(duo) })) });
  }));

  /** The feed before this store's margins (owners only: buyers see the store's own rates, never its margin). */
  r.get('/feed', handler(async (_req, res) => {
    const t = hub.latest();
    const st = storeOf(res);
    const { cur } = t ? storeBase(t, (await cache.get(st.id, st.name)).desk) : { cur: null }; // the store's saved MCX contract
    res.json({ status: 'success', feed: t ? { status: hub.currentStatus(), at: t.at, sample: Boolean(t.sample), source: t.source, base: Object.fromEntries(ROWS.map((row) => [row.id, Math.round(baseFor(row, cur!))])), contracts: { g: Object.keys(t.mkt?.mcx?.g ?? {}), s: Object.keys(t.mkt?.mcx?.s ?? {}) } } : null });
  }));

  r.put('/desk', handler(async (req, res) => {
    const st = storeOf(res);
    const desk = parse(deskSchema, req.body);
    const fixed = Object.fromEntries(Object.entries(desk.fixed).filter(([, v]) => v !== undefined));
    await cache.save(st.id, 'desk', { ...desk, fixed });
    await audit(store, st.id, req, 'DESK_SAVED', `margins ${JSON.stringify(desk.margins)}, round ${desk.round}, bookings ${desk.bookingsOpen ? 'open' : 'closed'}, fixed ${JSON.stringify(fixed)}`);
    res.json({ status: 'success', desk: { ...desk, fixed } });
  }));

  r.put('/theme', handler(async (req, res) => {
    const st = storeOf(res);
    const theme = parse(themeSchema, req.body);
    if (theme.accent) {
      const why = checkAccent(theme.id, theme.accent);
      if (why) throw new HttpError(400, why);
    }
    await cache.save(st.id, 'theme', theme);
    await audit(store, st.id, req, 'THEME_SAVED', `${theme.id}${theme.accent ? ` accent ${theme.accent}` : ''}`);
    res.json({ status: 'success', theme, tokens: tokensFor(theme) });
  }));

  r.put('/profile', handler(async (req, res) => {
    const st = storeOf(res);
    const profile = parse(profileSchema, req.body);
    await cache.save(st.id, 'profile', profile);
    await audit(store, st.id, req, 'PROFILE_SAVED', profile.name);
    res.json({ status: 'success', profile });
  }));

  // ---- banners ----
  const banners = async (id: string) => (await store.list<Banner>(scoped(id, 'banners'))).sort((a, b) => a.order - b.order);
  const view = (b: Banner) => ({ ...b, photoUrl: publicBanner(b).photo });

  r.get('/banners', handler(async (_req, res) => {
    res.json({ status: 'success', banners: (await banners(storeOf(res).id)).map(view) });
  }));

  r.post('/banners', handler(async (req, res) => {
    const st = storeOf(res);
    const b = parse(bannerSchema, req.body);
    const list = await banners(st.id);
    if (list.length >= MAX_BANNERS) throw new HttpError(409, `A store can keep ${MAX_BANNERS} banners. Remove one first.`);
    const banner: Banner = { ...b, id: newId('bn'), order: (list.at(-1)?.order ?? -1) + 1, createdAt: new Date().toISOString() };
    await store.set(scoped(st.id, 'banners'), banner.id, JSON.parse(JSON.stringify(banner)));
    await audit(store, st.id, req, 'BANNER_ADDED', banner.title);
    res.status(201).json({ status: 'success', banner: view(banner) });
  }));

  const mine = async (storeId: string, id: string) => {
    const b = await store.get<Banner>(scoped(storeId, 'banners'), id);
    if (!b) throw new HttpError(404, 'No such banner.');
    return b;
  };

  r.put('/banners/:id', handler(async (req, res) => {
    const st = storeOf(res);
    const cur = await mine(st.id, req.params.id);
    const b = parse(bannerSchema, req.body);
    const next: Banner = { ...cur, ...b, link: b.link, startsOn: b.startsOn, endsOn: b.endsOn };
    await store.set(scoped(st.id, 'banners'), cur.id, JSON.parse(JSON.stringify(next)));
    res.json({ status: 'success', banner: view(next) });
  }));

  r.put('/banners/:id/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: 12 * 1024 * 1024 }), handler(async (req, res) => {
    const st = storeOf(res);
    const cur = await mine(st.id, req.params.id);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(415, 'Send the photo as a JPEG, PNG or WebP image.');
    let jpg: Buffer;
    try {
      jpg = await sharp(req.body, { failOn: 'error' }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#000000' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    } catch {
      throw new HttpError(415, 'That file is not a valid JPEG, PNG or WebP image.');
    }
    const name = `stores/${st.id}/banners/${cur.id}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    await blobs.put(name, jpg, 'image/jpeg');
    if (cur.photo) await blobs.delete(cur.photo).catch(() => {});
    const next = { ...cur, photo: name };
    await store.set(scoped(st.id, 'banners'), cur.id, JSON.parse(JSON.stringify(next)));
    res.json({ status: 'success', banner: view(next) });
  }));

  r.post('/banners/order', handler(async (req, res) => {
    const st = storeOf(res);
    const { ids } = parse(z.object({ ids: z.array(z.string().max(80)).max(MAX_BANNERS) }), req.body);
    const list = await banners(st.id);
    if (ids.length !== list.length || !list.every((b) => ids.includes(b.id))) throw new HttpError(400, 'Send every banner once.');
    await Promise.all(list.map((b) => store.update(scoped(st.id, 'banners'), b.id, { order: ids.indexOf(b.id) })));
    res.json({ status: 'success', banners: (await banners(st.id)).map(view) });
  }));

  r.delete('/banners/:id', handler(async (req, res) => {
    const st = storeOf(res);
    const cur = await mine(st.id, req.params.id);
    await store.delete(scoped(st.id, 'banners'), cur.id);
    if (cur.photo) await blobs.delete(cur.photo).catch(() => {});
    await audit(store, st.id, req, 'BANNER_REMOVED', cur.title);
    res.json({ status: 'success' });
  }));

  // ---- bookings ----
  r.get('/bookings', handler(async (_req, res) => {
    const st = storeOf(res);
    const all = await store.list<Booking>(scoped(st.id, 'bookings'), { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 200 });
    res.json({ status: 'success', bookings: all });
  }));

  r.patch('/bookings/:ref', handler(async (req, res) => {
    const st = storeOf(res);
    const { status, note } = parse(z.object({ status: z.enum(['confirmed', 'cancelled', 'collected']), note: z.string().trim().max(200).optional() }), req.body);
    const updated = await store.transact(async (tx) => {
      const b = await tx.get<Booking>(scoped(st.id, 'bookings'), req.params.ref);
      if (!b) throw new HttpError(404, 'No such booking.');
      if (!NEXT[b.status].includes(status)) throw new HttpError(409, `A ${b.status} booking cannot become ${status}.`);
      const next = { ...b, status, updatedAt: new Date().toISOString(), ...(note ? { note } : {}) };
      tx.set(scoped(st.id, 'bookings'), b.ref, next);
      return next;
    });
    await audit(store, st.id, req, 'BOOKING_STATUS', `${updated.ref} ${status}`);
    res.json({ status: 'success', booking: updated });
  }));

  // ---- shop screen ----
  const screenKey = async (id: string, rotate = false) => {
    const cur = await store.get<{ key: string }>(scoped(id, 'settings'), 'screen');
    if (cur && !rotate) return cur.key;
    const key = crypto.randomBytes(18).toString('base64url');
    await store.set(scoped(id, 'settings'), 'screen', { key });
    return key;
  };
  r.get('/screen', handler(async (_req, res) => res.json({ status: 'success', key: await screenKey(storeOf(res).id) })));
  r.post('/screen/rotate', handler(async (req, res) => {
    const st = storeOf(res);
    const key = await screenKey(st.id, true);
    await audit(store, st.id, req, 'SCREEN_KEY_ROTATED', 'old shop screens stop at once');
    res.json({ status: 'success', key });
  }));

  return r;
}
