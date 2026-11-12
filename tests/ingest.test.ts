import { describe, expect, it } from 'vitest';
import { FeedHub } from '../server/feed/hub';
import { FEED, HISTORY, Ingest, LATEST, MANUAL } from '../server/feed/ingest';
import type { FeedProvider, Reading } from '../server/feed/provider';
import { MemoryStore } from '../server/store';
import type { Tick } from '../shared/rates';

const scripted = (readings: Array<Reading | Error>): FeedProvider => ({ kind: 'http', read: async () => { const r = readings.shift(); if (!r || r instanceof Error) throw r ?? new Error('done'); return r; } });

function rig(readings: Array<Reading | Error>, start = Date.UTC(2026, 10, 12, 6, 0, 0)) {
  let now = start;
  const store = new MemoryStore();
  const hub = new FeedHub(30_000, () => now);
  const seen: Tick[] = [];
  hub.subscribe((t) => t && seen.push(t));
  const ingest = new Ingest(scripted(readings), store, hub, { intervalMs: 1000, spikeFraction: 0.03, snapshotMs: 5000, now: () => now });
  return { store, hub, ingest, seen, step: async (ms = 1000) => { now += ms; return ingest.step(); }, at: () => now };
}

describe('rate-ingest', () => {
  it('publishes each reading once, keeping the day’s opening', async () => {
    const r = rig([{ g: 12800, s: 152 }, { g: 12810, s: 152.1 }]);
    await r.step(); await r.step();
    expect(r.seen.map((t) => t.g)).toEqual([12800, 12810]);
    expect(r.seen[1].open).toEqual({ g: 12800, s: 152 });
    expect(r.seen[1].source).toBe('feed');
  });

  it('holds back a spike, and lets it through only when the next reading agrees', async () => {
    const r = rig([{ g: 12800, s: 152 }, { g: 14000, s: 152 }, { g: 12805, s: 152 }, { g: 14000, s: 152 }, { g: 14010, s: 152 }]);
    for (let i = 0; i < 5; i++) await r.step();
    expect(r.seen.map((t) => t.g)).toEqual([12800, 12805, 14010]);
  });

  it('a failed read publishes nothing: the board goes "paused" on its own after 30 s', async () => {
    const r = rig([{ g: 12800, s: 152 }, new Error('provider down'), new Error('provider down')]);
    await r.step(); await r.step(); await r.step(31_000);
    expect(r.seen).toHaveLength(1);
    expect(r.hub.currentStatus()).toBe('paused');
    expect(r.ingest.failures).toBe(2);
  });

  it('a new India day starts a new opening', async () => {
    const r = rig([{ g: 12800, s: 152 }, { g: 12900, s: 153 }], Date.UTC(2026, 10, 12, 18, 29, 0)); // 23:59 IST
    await r.step(); await r.step(120_000); // 00:01 IST next day
    expect(r.seen[1].open).toEqual({ g: 12900, s: 153 });
  });

  it('writes the latest tick every 5 s and one closing price per minute', async () => {
    const r = rig(Array.from({ length: 70 }, (_, i) => ({ g: 12800 + i, s: 152 })), Date.UTC(2026, 10, 12, 6, 0, 0));
    for (let i = 0; i < 70; i++) await r.step();
    const latest = await r.store.get<Tick>(FEED, LATEST);
    expect(latest!.g).toBeGreaterThanOrEqual(12800 + 65);
    const minutes = await r.store.list(HISTORY.minute);
    expect(minutes.length).toBe(1);
    expect(minutes[0].g).toBe(12800 + 58); // the last tick of the first minute (ticks at :01 … :59 → readings 0 … 58)
  });

  it('a rate typed by Antarixs replaces the feed while it is on', async () => {
    const r = rig([{ g: 12800, s: 152 }]);
    await r.store.set(FEED, MANUAL, { on: true, g: 12700, s: 150 });
    const t = await r.step(11_000);
    expect(t).toMatchObject({ g: 12700, s: 150, source: 'manual' });
  });
});
