import { describe, expect, it } from 'vitest';
import { DEFAULT_DESK, boardFor, nextQuote, perGram, roundTo, statusOf, type Desk, type Tick } from '../shared/rates';
import { checkAccent, contrast, THEMES, THEME_IDS, tokensFor } from '../shared/themes';
import { GRAMS_PER_TROY_OZ, mcxContracts, toReading } from '../server/feed/provider';

const tick = (g = 12800, s = 152, extra: Partial<Tick> = {}): Tick => ({ at: Date.now(), g, s, open: { g: 12750, s: 150 }, source: 'feed', ...extra });
const desk = (d: Partial<Desk> = {}): Desk => ({ ...DEFAULT_DESK, margins: { g24: { buy: 450, sell: 900 }, g22: { buy: 400, sell: 1600 }, g18: { buy: 350, sell: 1800 }, ag: { buy: 800, sell: 1500 } }, ...d });

describe('a store board from one tick', () => {
  it('prices each row per its unit with the store margins, rounded', () => {
    const b = boardFor(tick(), desk());
    const r = Object.fromEntries(b.rows.map((x) => [x.id, x]));
    expect(r.g24).toMatchObject({ buy: 128450, sell: 127100 }); // 12800 × 10 + 450, − 900
    expect(r.g22.buy).toBe(roundTo(12800 * 0.916 * 10 + 400, 10));
    expect(r.g18.sell).toBe(roundTo(12800 * 0.75 * 10 - 1800, 10));
    expect(r.ag).toMatchObject({ buy: 152800, sell: 150500 }); // per kg
    expect(r.g24.change).toBe(500); // since the day's opening, same margin
    expect(b.status).toBe('live');
  });
  it('a fixed rate wins over the feed, keeps the sell margin below it and shows no change', () => {
    const r = boardFor(tick(), desk({ fixed: { g24: 130000 } })).rows.find((x) => x.id === 'g24')!;
    expect(r).toMatchObject({ buy: 130000, sell: 130000 - 450 - 900, change: 0, fixed: true });
  });
  it('shows only the rows the store chose, in its order', () => {
    expect(boardFor(tick(), desk({ rows: ['ag', 'g24'] })).rows.map((x) => x.id)).toEqual(['ag', 'g24']);
  });
  it('a tick older than 30 s is paused', () => {
    expect(statusOf(tick(12800, 152, { at: Date.now() - 31_000 }))).toBe('paused');
    expect(statusOf(null)).toBe('paused');
  });
  it('coins cost the bar rate per gram plus the coin premium', () => {
    const d = desk({ coinPremium: 35 });
    const b = boardFor(tick(), d);
    expect(perGram('bar', b, d)).toBe(12845);
    expect(perGram('coin', b, d)).toBe(12880);
    expect(perGram('silver', b, d)).toBe(152.8);
  });
});

describe('reading a provider', () => {
  const c = { goldPath: 'data.gold', goldUnit: 'g' as const, silverPath: 'data.silver', silverUnit: 'kg' as const };
  it('takes the configured fields and units', () => {
    expect(toReading({ data: { gold: '12,800.5', silver: 152000 } }, c)).toMatchObject({ g: 12800.5, s: 152 });
    expect(toReading({ g: 128000, s: 152 }, { goldPath: 'g', goldUnit: '10g', silverPath: 's', silverUnit: 'g' })).toMatchObject({ g: 12800, s: 152 });
  });
  it('converts USD per troy ounce with the exchange rate', () => {
    const r = toReading({ x: 4000, y: 50, fx: 88 }, { goldPath: 'x', goldUnit: 'oz_usd', silverPath: 'y', silverUnit: 'oz_usd', fxPath: 'fx' });
    expect(r.g).toBeCloseTo((4000 * 88) / GRAMS_PER_TROY_OZ, 6);
    expect(r.comexG).toBe(4000);
    expect(r.comexS).toBe(50);
  });
  it('reads MCX futures per contract and bases the feed on the nearest (gold per 10 g, silver per kg)', () => {
    const json = { g: { dec: '1,25,000', feb: 125800 }, s: { dec: 152000 }, cx: { g: 4000, s: 48 }, fx: 88 };
    const r = toReading(json, { ...c, mcxGold: 'GOLD DEC 2026=g.dec, GOLD FEB 2027=g.feb', mcxSilver: 'SILVER DEC 2026=s.dec', usdOzPath: 'cx.g', comexSilverPath: 'cx.s', fxPath: 'fx' });
    expect(r).toMatchObject({ g: 12500, s: 152, comexG: 4000, comexS: 48, fx: 88, mcx: { g: { 'GOLD DEC 2026': 125000, 'GOLD FEB 2027': 125800 }, s: { 'SILVER DEC 2026': 152000 } } });
  });
  it('lists the MCX contracts still trading', () => {
    const ist = (iso: string) => Date.parse(`${iso}T12:00:00+05:30`);
    expect(mcxContracts('g', ist('2026-11-16'))).toEqual(['GOLD DEC 2026', 'GOLD FEB 2027', 'GOLD APR 2027']);
    expect(mcxContracts('s', ist('2026-11-16'))).toEqual(['SILVER DEC 2026', 'SILVER MAR 2027', 'SILVER MAY 2027']);
    expect(mcxContracts('g', ist('2026-12-05'))[0]).toBe('GOLD DEC 2026'); // trades through its expiry day
    expect(mcxContracts('g', ist('2026-12-06'))[0]).toBe('GOLD FEB 2027');
  });
  it('prices a store from the MCX contract its owner follows, else the nearest', () => {
    const q = (v: number, o = v) => ({ v, o, h: v, l: v });
    const t = tick(12500, 152, { mkt: { mcx: { g: { 'GOLD DEC 2026': q(125000, 124000), 'GOLD FEB 2027': q(126000) }, s: { 'SILVER DEC 2026': q(152000) } } } });
    const near = boardFor(t, { ...DEFAULT_DESK, round: 1 });
    expect(near.rows.find((r) => r.id === 'g24')!.buy).toBe(125000);
    expect(near.rows.find((r) => r.id === 'g24')!.change).toBe(1000);
    expect(near.mcx?.g?.name).toBe('GOLD DEC 2026');
    const feb = boardFor(t, { ...DEFAULT_DESK, round: 1, mcx: { g: 'GOLD FEB 2027' } });
    expect(feb.rows.find((r) => r.id === 'g24')!.buy).toBe(126000);
    expect(feb.mcx?.g?.name).toBe('GOLD FEB 2027');
    expect(boardFor(t, { ...DEFAULT_DESK, mcx: { g: 'GOLD JUN 2030' } }).mcx?.g?.name).toBe('GOLD DEC 2026'); // gone from the feed: nearest
  });
  it('keeps the day high and low of each market', () => {
    let q = nextQuote(100);
    q = nextQuote(104, q); q = nextQuote(98, q); q = nextQuote(101, q);
    expect(q).toEqual({ v: 101, o: 100, h: 104, l: 98 });
  });
  it('refuses a missing or zero rate rather than inventing one', () => {
    expect(() => toReading({ data: { gold: 0, silver: 1 } }, c)).toThrow(/gold/);
    expect(() => toReading({ data: {} }, c)).toThrow();
    expect(() => toReading({ x: 1, y: 1 }, { goldPath: 'x', goldUnit: 'oz_usd', silverPath: 'y', silverUnit: 'g' })).toThrow(/FEED_FX_PATH/);
  });
});

describe('themes', () => {
  it('every preset reads: text 4.5:1 on the ground, accent 3:1, text on the accent 4.5:1, up and down 3:1', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id].tokens;
      expect(contrast(t.ink, t.bg), `${id} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.mut, t.bg), `${id} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.bg), `${id} accent`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.onAccent, t.accent), `${id} on accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onBtn, t.btn), `${id} button`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.up, t.bg), `${id} up`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.dn, t.bg), `${id} down`).toBeGreaterThanOrEqual(3);
    }
  });
  it('an owner accent too close to the ground is refused; a good one gets readable text on it', () => {
    expect(checkAccent('noir', '#2a2a2a')).toMatch(/too close/);
    expect(checkAccent('ivory', '#f0e8d0')).toMatch(/darker/);
    expect(checkAccent('noir', 'red')).toMatch(/#RRGGBB/);
    expect(checkAccent('noir', '#e8c27a')).toBeNull();
    expect(tokensFor({ id: 'ivory', accent: '#1a3a6a' }).onAccent).toBe('#ffffff');
    expect(tokensFor({ id: 'noir', accent: '#e8c27a' }).onAccent).toBe('#0d0c0a');
  });
});
