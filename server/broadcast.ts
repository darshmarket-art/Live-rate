import type { Response } from 'express';
import { boardFor, type Board, type FeedStatus, type Tick } from '../shared/rates';
import type { FeedHub } from './feed/hub';
import type { StoreCache } from './stores';

export const PAUSED_BOARD = (at = 0): Board => ({ status: 'paused', at, sample: false, source: 'feed', rows: [] });

/** One store's board from the latest tick, or the paused board when there is none. */
export function currentBoard(tick: Tick | null, status: FeedStatus, desk: Parameters<typeof boardFor>[1]): Board {
  if (!tick) return PAUSED_BOARD();
  return { ...boardFor(tick, desk), status };
}

/**
 * Every open rate stream on this instance, grouped by store. On each tick a store's board is computed once and written to all of that
 * store's buyers and screens, so a thousand phones cost one board per store per tick.
 */
export class Broadcaster {
  private clients = new Map<string, Set<Response>>();
  private beat?: NodeJS.Timeout;

  constructor(private hub: FeedHub, private cache: StoreCache) {
    hub.subscribe((tick, status) => this.send(tick, status));
    // comments keep proxies and the load balancer from closing a quiet stream
    this.beat = setInterval(() => { for (const set of this.clients.values()) for (const res of set) res.write(': keep-alive\n\n'); }, 20_000);
    this.beat.unref?.();
  }

  count() { let n = 0; for (const s of this.clients.values()) n += s.size; return n; }

  private send(tick: Tick | null, status: FeedStatus) {
    for (const [storeId, set] of this.clients) {
      const s = this.cache.peek(storeId);
      if (!s || !set.size) continue;
      const data = `data: ${JSON.stringify(currentBoard(tick, status, s.desk))}\n\n`;
      for (const res of set) res.write(data);
    }
  }

  /** Opens a stream for one store and sends the current board at once. */
  async open(storeId: string, res: Response) {
    const s = await this.cache.get(storeId);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify(currentBoard(this.hub.latest(), this.hub.currentStatus(), s.desk))}\n\n`);
    let set = this.clients.get(storeId);
    if (!set) this.clients.set(storeId, (set = new Set()));
    set.add(res);
    res.on('close', () => { set!.delete(res); if (!set!.size) this.clients.delete(storeId); });
  }

  stop() { if (this.beat) clearInterval(this.beat); }
}
