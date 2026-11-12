import { indiaDay, type Tick } from '../../shared/rates';
import { logger } from '../logger';
import type { Store } from '../store';
import type { FeedHub } from './hub';
import type { FeedProvider, Reading } from './provider';

/** Where the feed is kept: one document for the latest tick, and closing prices per minute, hour and day for the charts. */
export const FEED = 'feed';
export const LATEST = 'latest';
export const MANUAL = 'manual';
export const HISTORY = { minute: 'feedMinute', hour: 'feedHour', day: 'feedDay' } as const;

const ist = (t: number) => new Date(t + 5.5 * 3600_000).toISOString();
export const periodKey = (t: number, p: keyof typeof HISTORY) => {
  const s = ist(t);
  return p === 'minute' ? s.slice(0, 16) : p === 'hour' ? s.slice(0, 13) : s.slice(0, 10);
};

export interface IngestOptions {
  intervalMs: number;
  spikeFraction: number;
  /** How often the latest tick is written down (so a restarted live-rate starts from it). */
  snapshotMs?: number;
  now?: () => number;
}

/**
 * rate-ingest's loop: read the provider once per tick for every store, guard against a bad reading, keep the day's opening, publish the
 * tick, and write it down every few seconds. The only place the provider is called and the only holder of its key.
 */
export class Ingest {
  latest: Tick | null = null;
  private held: Reading | null = null;
  private timer?: NodeJS.Timeout;
  private lastSnapshot = 0;
  private lastWritten: Record<string, string> = {};
  private prevTick: Tick | null = null;
  private manual: { on: boolean; g?: number; s?: number } = { on: false };
  private manualCheckedAt = 0;
  failures = 0;

  constructor(private provider: FeedProvider | null, private store: Store, private hub: FeedHub, private o: IngestOptions) {}

  private now() { return (this.o.now ?? Date.now)(); }

  /** Picks up from the last saved tick (its day's opening and the spike guard's reference). */
  async boot() {
    const saved = await this.store.get<Tick>(FEED, LATEST);
    if (saved) this.latest = saved;
  }

  /** A reading that jumps more than spikeFraction from the last tick is held; it goes out only if the next reading agrees with it. */
  accept(r: Reading): Reading | null {
    const ref = this.latest;
    if (!ref) return r;
    const far = (a: number, b: number) => Math.abs(a - b) / b > this.o.spikeFraction;
    if (!far(r.g, ref.g) && !far(r.s, ref.s)) { this.held = null; return r; }
    if (this.held && !far(r.g, this.held.g) && !far(r.s, this.held.s)) { this.held = null; return r; }
    logger.warn('feed spike held back', { g: r.g, s: r.s, lastG: ref.g, lastS: ref.s });
    this.held = r;
    return null;
  }

  async step(): Promise<Tick | null> {
    const now = this.now();
    if (now - this.manualCheckedAt > 10_000) {
      this.manualCheckedAt = now;
      this.manual = (await this.store.get<{ on: boolean; g?: number; s?: number }>(FEED, MANUAL).catch(() => null)) ?? { on: false };
    }
    let reading: Reading | null = null;
    let source: Tick['source'];
    if (this.manual.on && this.manual.g && this.manual.s) {
      reading = { g: this.manual.g, s: this.manual.s };
      source = 'manual';
    } else {
      if (!this.provider) return null;
      try {
        reading = this.accept(await this.provider.read());
        this.failures = 0;
      } catch (e: any) {
        this.failures++;
        if (this.failures === 1 || this.failures % 30 === 0) logger.error('feed read failed', { error: String(e?.message ?? e), failures: this.failures });
        return null;
      }
      source = this.provider.kind === 'sample' ? 'sample' : 'feed';
    }
    if (!reading) return null;
    const sameDay = this.latest && indiaDay(this.latest.at) === indiaDay(now);
    const tick: Tick = {
      at: now,
      g: Math.round(reading.g * 100) / 100,
      s: Math.round(reading.s * 1000) / 1000,
      ...(reading.usdOz ? { usdOz: reading.usdOz } : {}),
      ...(reading.fx ? { fx: reading.fx } : {}),
      open: sameDay ? this.latest!.open : { g: reading.g, s: reading.s },
      source,
      ...(source === 'sample' ? { sample: true } : {})
    };
    this.latest = tick;
    this.hub.publish(tick);
    await this.persist(tick).catch((e) => logger.error('feed snapshot failed', { error: String(e?.message ?? e) }));
    return tick;
  }

  /** feed/latest every snapshotMs, and one closing price per minute, hour and day. */
  async persist(tick: Tick) {
    const writes: Promise<unknown>[] = [];
    if (tick.at - this.lastSnapshot >= (this.o.snapshotMs ?? 5000)) {
      this.lastSnapshot = tick.at;
      writes.push(this.store.set(FEED, LATEST, tick));
    }
    const prev = this.prevTick;
    for (const p of Object.keys(HISTORY) as Array<keyof typeof HISTORY>) {
      const key = periodKey(tick.at, p);
      // written when the period changes hands, so each document holds the period's last price (the previous tick's)
      if (prev && this.lastWritten[p] && this.lastWritten[p] !== key) writes.push(this.store.set(HISTORY[p], this.lastWritten[p], { id: this.lastWritten[p], at: prev.at, g: prev.g, s: prev.s }));
      this.lastWritten[p] = key;
    }
    this.prevTick = tick;
    await Promise.all(writes);
  }

  start() {
    const loop = async () => {
      const t0 = this.now();
      await this.step().catch((e) => logger.error('feed step failed', { error: String(e?.message ?? e) }));
      this.timer = setTimeout(loop, Math.max(50, this.o.intervalMs - (this.now() - t0)));
    };
    void loop();
    return this;
  }
  stop() { if (this.timer) clearTimeout(this.timer); }
}
