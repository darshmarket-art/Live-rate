import fs from 'fs';
import path from 'path';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { THEMES, tokensFor } from '../shared/themes';
import { createAuth } from './auth';
import type { Blobs } from './blobs';
import { Broadcaster } from './broadcast';
import type { Config } from './config';
import type { FeedHub } from './feed/hub';
import { errorHandler, notFoundApi, requestLogger } from './http';
import { renderIndex } from './html';
import { logger } from './logger';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { buyerRoutes } from './routes/buyer';
import { consoleRoutes } from './routes/console';
import { rateRoutes } from './routes/rates';
import { screenRoutes } from './routes/screen';
import type { Store } from './store';
import { StoreCache } from './stores';
import { resolveStore, storeIdOf, storeOf } from './tenancy';
import type { Messenger } from './whatsapp';

export interface LiveDeps { config: Config; store: Store; blobs: Blobs; hub: FeedHub; messenger: Messenger }

/** live-rate: every store's API, the buyer app, the owner console and the shop screen. Holds no provider key and calls no provider. */
export function createLiveApp(d: LiveDeps) {
  const { config, store, blobs, hub, messenger } = d;
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", ...(config.production ? [] : ['ws:'])],
        scriptSrc: ["'self'", ...(config.production ? [] : ["'unsafe-inline'", "'unsafe-eval'"])]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  // the rate stream must not be buffered by compression
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestLogger);

  const cache = new StoreCache(store);
  const auth = createAuth(config.jwtSecret);
  const broadcaster = new Broadcaster(hub, cache);

  app.get('/health', (_req, res) => res.json({ status: 'ok', feed: hub.currentStatus(), streams: broadcaster.count() }));

  app.use('/api/console', consoleRoutes(store, config.masterKey));

  const api = express.Router();
  api.use(resolveStore(cache, config.baseDomain));
  api.use('/auth', authRoutes(config, store, auth, messenger));
  api.use('/screen', screenRoutes(store, cache, hub, broadcaster));
  api.use('/admin', adminRoutes(store, cache, blobs, auth, hub));
  api.use(rateRoutes(store, cache, hub, broadcaster, auth));
  api.use(buyerRoutes(store, cache, hub, auth, config.quoteSecret, (storeId, b) => logger.info('booking requested', { store: storeId, ref: b.ref, product: b.product, grams: b.grams, amount: b.amount }), !config.production));
  app.use('/api', api);
  app.use('/api', notFoundApi);

  // banner photos: public on purpose (they are adverts), cached for good (a new photo gets a new name)
  app.get('/media/banners/:file', resolveStore(cache, config.baseDomain), async (req, res, next) => {
    try {
      if (!/^[\w-]+\.jpg$/.test(req.params.file)) return void res.status(404).end();
      const blob = await blobs.get(`stores/${storeOf(res).id}/banners/${req.params.file}`);
      if (!blob) return void res.status(404).end();
      res.set({ 'Content-Type': blob.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' }).send(blob.data);
    } catch (e) {
      next(e);
    }
  });

  /** The app's page, already in the store's colours. */
  const page = async (req: express.Request, html: string) => {
    const id = storeIdOf(req, config.baseDomain);
    const rec = id ? await cache.record(id).catch(() => null) : null;
    if (!rec) return html;
    const s = await cache.get(rec.id, rec.name);
    return renderIndex(html, { name: s.profile.name, tokens: tokensFor(s.theme), display: THEMES[s.theme.id]?.display, duo: THEMES[s.theme.id]?.duo });
  };

  return { app, cache, broadcaster, page, attachClient: (fn: (app: Express) => Promise<void>) => fn(app) };
}

/** Production: the built client from dist/, every unknown path answered with the app page. */
export function serveBuiltClient(app: Express, page: (req: express.Request, html: string) => Promise<string>) {
  const dist = path.resolve(process.cwd(), 'dist');
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
  app.get('*', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-cache').type('html').send(await page(req, index)); } catch (e) { next(e); }
  });
  app.use(errorHandler);
}
