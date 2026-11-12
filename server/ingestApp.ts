import express from 'express';
import { sameSecret } from './auth';
import type { FeedHub } from './feed/hub';
import type { Ingest } from './feed/ingest';
import { errorHandler } from './http';

/**
 * rate-ingest's own small API: health, and the internal stream every live-rate instance keeps open. On Cloud Run the service takes no
 * public traffic (only the live-rate service account may call it); X-Feed-Token is a second lock for anywhere else.
 */
export function createIngestApp(hub: FeedHub, ingest: Ingest, token?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok', feed: hub.currentStatus(), at: hub.latest()?.at ?? null, failures: ingest.failures }));
  app.get('/internal/stream', (req, res) => {
    if (token && !sameSecret(String(req.header('x-feed-token') ?? ''), token)) return void res.status(403).json({ status: 'error', message: 'Forbidden.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    const latest = hub.latest();
    if (latest) res.write(`data: ${JSON.stringify(latest)}\n\n`);
    const off = hub.subscribe((tick) => { if (tick) res.write(`data: ${JSON.stringify(tick)}\n\n`); });
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
    req.on('close', () => { off(); clearInterval(beat); });
  });
  app.use(errorHandler);
  return app;
}
