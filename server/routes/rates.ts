import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ROW_IDS, baseFor, rowDef, type Tick } from '../../shared/rates';
import { tokensFor, THEMES } from '../../shared/themes';
import type { Auth } from '../auth';
import { liveBanners, publicBanner, type Banner } from '../banners';
import { currentBoard, type Broadcaster } from '../broadcast';
import { HISTORY } from '../feed/ingest';
import type { FeedHub } from '../feed/hub';
import { HttpError, handler, parse } from '../http';
import { scoped, type Store } from '../store';
import type { StoreCache } from '../stores';
import { storeOf } from '../tenancy';

const RANGES = { '1D': { ms: 86_400_000, from: 'minute' }, '1W': { ms: 7 * 86_400_000, from: 'hour' }, '1M': { ms: 30 * 86_400_000, from: 'hour' }, '1Y': { ms: 365 * 86_400_000, from: 'day' } } as const;
const MAX_POINTS = 120;

/** Evenly thins a series to at most `n` points, keeping the first and the last. */
export const thin = <T>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]));

/** What every buyer of a store reads: the store's look and banners, its rates, the live stream and the chart history. */
export function rateRoutes(store: Store, cache: StoreCache, hub: FeedHub, broadcaster: Broadcaster, auth: Auth) {
  const r = Router();

  r.get('/store', handler(async (_req, res) => {
    const st = storeOf(res);
    const s = await cache.get(st.id, st.name);
    const banners = await store.list<Banner>(scoped(st.id, 'banners'));
    const p = s.profile;
    res.json({
      status: 'success',
      store: { id: st.id, name: p.name, tagline: p.tagline, city: p.city, address: p.address, phone: p.phone, whatsapp: p.whatsapp, taxNote: p.taxNote, payTerms: p.payTerms, pickup: p.pickup, ratesPublic: p.ratesPublic, bookingsOpen: s.desk.bookingsOpen, coinPremium: s.desk.coinPremium },
      theme: { id: s.theme.id, accent: s.theme.accent ?? null, dark: THEMES[s.theme.id]?.dark ?? true, display: THEMES[s.theme.id]?.display, tokens: tokensFor(s.theme) },
      banners: liveBanners(banners, 'app').map(publicBanner)
    });
  }));

  /** Rates are for signed-in buyers unless the owner made them public. */
  const canSee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const st = storeOf(res);
      const s = await cache.get(st.id, st.name);
      if (!s.profile.ratesPublic && !res.locals.session) throw new HttpError(401, 'Sign in with your WhatsApp number to see the rates.');
      next();
    } catch (e) {
      next(e);
    }
  };
  const gate = [auth.optional, canSee];

  r.get('/rates', ...gate, handler(async (_req, res) => {
    const st = storeOf(res);
    const s = await cache.get(st.id, st.name);
    res.json({ status: 'success', board: currentBoard(hub.latest(), hub.currentStatus(), s.desk) });
  }));

  r.get('/rates/stream', ...gate, handler(async (_req, res) => {
    await broadcaster.open(storeOf(res).id, res);
  }));

  r.get('/rates/history', ...gate, handler(async (req, res) => {
    const st = storeOf(res);
    const q = parse(z.object({ row: z.enum(ROW_IDS), range: z.enum(['1D', '1W', '1M', '1Y']).default('1D') }), req.query);
    const { desk } = await cache.get(st.id, st.name);
    const def = rowDef(q.row);
    const m = desk.margins[q.row] ?? { buy: 0, sell: 0 };
    const spec = RANGES[q.range];
    const since = Date.now() - spec.ms;
    const docs = await store.list<{ at: number; g: number; s: number }>(HISTORY[spec.from], { where: [{ field: 'at', op: '>', value: since }], orderBy: { field: 'at', direction: 'asc' } });
    const live = hub.latest();
    const series = [...docs, ...(live ? [live as Pick<Tick, 'at' | 'g' | 's'>] : [])].map((d) => ({ at: d.at, v: Math.round(baseFor(def, d) + m.buy) }));
    res.json({ status: 'success', row: q.row, range: q.range, points: thin(series, MAX_POINTS) });
  }));

  return r;
}
