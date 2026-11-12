import { Router, type NextFunction, type Request, type Response } from 'express';
import { THEMES, tokensFor } from '../../shared/themes';
import { sameSecret } from '../auth';
import { liveBanners, publicBanner, type Banner } from '../banners';
import { currentBoard, type Broadcaster } from '../broadcast';
import type { FeedHub } from '../feed/hub';
import { HttpError, handler } from '../http';
import { scoped, type Store } from '../store';
import type { StoreCache } from '../stores';
import { storeOf } from '../tenancy';

/** The shop TV: no sign-in on the screen itself, a long key the owner copies from the console (and can change to cut old screens off). */
export function screenRoutes(store: Store, cache: StoreCache, hub: FeedHub, broadcaster: Broadcaster) {
  const r = Router();
  const keyed = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const st = storeOf(res);
      const doc = await store.get<{ key: string }>(scoped(st.id, 'settings'), 'screen');
      const key = String(req.query.key ?? '');
      if (!doc || !key || !sameSecret(key, doc.key)) throw new HttpError(403, 'This screen link is not valid any more. Copy the new one from the owner console.');
      next();
    } catch (e) {
      next(e);
    }
  };
  r.get('/', keyed, handler(async (_req, res) => {
    const st = storeOf(res);
    const s = await cache.get(st.id, st.name);
    const banners = liveBanners(await store.list<Banner>(scoped(st.id, 'banners')), 'screen').map(publicBanner);
    res.json({
      status: 'success',
      store: { name: s.profile.name, city: s.profile.city, address: s.profile.address, phone: s.profile.phone, taxNote: s.profile.taxNote },
      theme: { id: s.theme.id, dark: THEMES[s.theme.id]?.dark ?? true, display: THEMES[s.theme.id]?.display, tokens: tokensFor(s.theme) },
      banners,
      board: currentBoard(hub.latest(), hub.currentStatus(), s.desk)
    });
  }));
  r.get('/stream', keyed, handler(async (_req, res) => broadcaster.open(storeOf(res).id, res)));
  return r;
}
