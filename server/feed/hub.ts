import { STALE_MS, statusOf, type FeedStatus, type Tick } from '../../shared/rates';

export type Listener = (tick: Tick | null, status: FeedStatus) => void;

/**
 * The latest tick inside one process, and everyone waiting for the next. rate-ingest publishes what it reads; live-rate publishes what
 * arrives on its stream from ingest. When no tick comes for STALE_MS the hub tells its listeners once that the feed is paused.
 */
export class FeedHub {
  private tick: Tick | null = null;
  private listeners = new Set<Listener>();
  private status: FeedStatus = 'paused';
  private timer?: NodeJS.Timeout;

  constructor(private staleMs = STALE_MS, private now: () => number = Date.now) {}

  latest() { return this.tick; }
  currentStatus() { return statusOf(this.tick, this.now(), this.staleMs); }

  publish(tick: Tick) {
    if (this.tick && tick.at < this.tick.at) return; // an older tick arriving late changes nothing
    this.tick = tick;
    this.status = this.currentStatus();
    for (const l of this.listeners) l(tick, this.status);
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  /** Checks once a second whether the feed has gone quiet (or come back) and says so. */
  watch() {
    this.timer ??= setInterval(() => {
      const s = this.currentStatus();
      if (s !== this.status) {
        this.status = s;
        for (const l of this.listeners) l(this.tick, s);
      }
    }, 1000);
    this.timer.unref?.();
    return this;
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}
