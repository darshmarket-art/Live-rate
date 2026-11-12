import { checkAlerts } from './server/alerts';
import { createBlobs } from './server/blobs';
import { loadConfig } from './server/config';
import { FeedClient } from './server/feed/client';
import { FeedHub } from './server/feed/hub';
import { Ingest } from './server/feed/ingest';
import { createProvider } from './server/feed/provider';
import { errorHandler } from './server/http';
import { createIngestApp } from './server/ingestApp';
import { createLiveApp, serveBuiltClient } from './server/liveApp';
import { logger } from './server/logger';
import { createStore } from './server/store';
import { StoreCache } from './server/stores';
import { createMessenger } from './server/whatsapp';

const config = loadConfig();
const store = createStore(config.storeKind, config.dataFile);
const hub = new FeedHub(config.staleMs).watch();
const messenger = createMessenger(config);

async function startIngest() {
  const ingest = new Ingest(createProvider(config.feed), store, hub, { intervalMs: config.feed.intervalMs, spikeFraction: config.feed.spikeFraction });
  await ingest.boot();
  ingest.start();
  // alerts are checked here, in the one ingest instance, so each fires once
  const cache = new StoreCache(store);
  setInterval(() => void checkAlerts(store, cache, hub.latest(), messenger).catch((e) => logger.error('alert check failed', { error: String(e?.message ?? e) })), 60_000).unref();
  logger.info('rate-ingest started', { provider: config.feed.provider, intervalMs: config.feed.intervalMs });
  return ingest;
}

async function main() {
  if (config.role === 'ingest') {
    const ingest = await startIngest();
    createIngestApp(hub, ingest, config.ingestToken).listen(config.port, () => logger.info('rate-ingest listening', { port: config.port }));
    return;
  }
  if (config.role === 'both') await startIngest();
  else await new FeedClient(hub, store, config.ingestUrl, config.ingestToken).start();

  const { app, page } = createLiveApp({ config, store, blobs: createBlobs(config.bucket, config.storeKind), hub, messenger });
  if (config.production) serveBuiltClient(app, page);
  else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      try {
        const fs = await import('fs');
        const html = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync('index.html', 'utf8'));
        res.type('html').send(await page(req, html));
      } catch (e) { next(e); }
    });
    app.use(errorHandler);
  }
  app.listen(config.port, () => logger.info('live-rate listening', { port: config.port, role: config.role, feed: config.role === 'both' ? config.feed.provider : config.ingestUrl ? 'stream from rate-ingest' : 'snapshot only (INGEST_URL not set)' }));
}

main().catch((e) => { logger.error('startup failed', { error: String(e?.stack ?? e) }); process.exit(1); });
