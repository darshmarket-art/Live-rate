import type { Tick } from '../../shared/rates';
import { logger } from '../logger';
import type { Store } from '../store';
import type { FeedHub } from './hub';
import { FEED, LATEST } from './ingest';

/** On Cloud Run: an ID token for calling rate-ingest, which only accepts the live-rate service account. */
async function idToken(audience: string): Promise<string | null> {
  if (!process.env.K_SERVICE) return null;
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, { headers: { 'Metadata-Flavor': 'Google' } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Splits a text/event-stream body into `data:` payloads. */
export function sseParser(onData: (data: string) => void) {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) onData(data);
    }
  };
}

/**
 * live-rate's side of the feed: one stream from rate-ingest per instance, however many buyers are connected. It starts from the saved
 * snapshot, reconnects on its own, and while the stream is down it reads the snapshot every 5 seconds so a short outage only slows ticks.
 */
export class FeedClient {
  private stopped = false;
  private connected = false;
  private poll?: NodeJS.Timeout;

  constructor(private hub: FeedHub, private store: Store, private ingestUrl?: string, private token?: string) {}

  async start() {
    await this.readSnapshot();
    this.poll = setInterval(() => { if (!this.connected) void this.readSnapshot(); }, 5000);
    this.poll.unref?.();
    if (this.ingestUrl) void this.connectLoop();
    return this;
  }
  stop() { this.stopped = true; if (this.poll) clearInterval(this.poll); }

  private async readSnapshot() {
    const t = await this.store.get<Tick>(FEED, LATEST).catch(() => null);
    if (t) this.hub.publish(t);
  }

  private async connectLoop() {
    let wait = 1000;
    while (!this.stopped) {
      try {
        const url = `${this.ingestUrl}/internal/stream`;
        const bearer = await idToken(this.ingestUrl!);
        const res = await fetch(url, { headers: { Accept: 'text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(this.token ? { 'X-Feed-Token': this.token } : {}) } });
        if (!res.ok || !res.body) throw new Error(`ingest answered ${res.status}`);
        this.connected = true;
        wait = 1000;
        logger.info('feed stream connected');
        const parse = sseParser((d) => { try { this.hub.publish(JSON.parse(d) as Tick); } catch { /* a malformed event is skipped */ } });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.stopped) break;
          parse(dec.decode(value, { stream: true }));
        }
      } catch (e: any) {
        logger.warn('feed stream lost', { error: String(e?.message ?? e) });
      }
      this.connected = false;
      if (this.stopped) break;
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 30_000);
    }
  }
}
