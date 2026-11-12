/**
 * The rate model shared by the feed, the server and the app.
 *
 * The feed gives two base prices in rupees per gram: fine gold (24K, 999) and fine silver (999). Everything a store shows is derived from
 * those two numbers here, so every store, every phone and every shop screen agree to the rupee.
 */

/** One reading of the feed. `g` and `s` are INR per gram (24K gold, silver 999). */
export interface Tick {
  /** When the provider priced it (ms since epoch). */
  at: number;
  g: number;
  s: number;
  /** International reference, when the provider gives it. */
  usdOz?: number;
  fx?: number;
  /** The first reading of the day (India time), for "change since opening". */
  open: { g: number; s: number };
  /** True only for the development sample feed: every screen then says the rates are not market rates. */
  sample?: boolean;
  /** Where the rate came from: the licensed feed, or typed by Antarixs while it is down. */
  source: 'feed' | 'manual' | 'sample';
}

export const ROW_IDS = ['g24', 'g22', 'g18', 'ag'] as const;
export type RowId = (typeof ROW_IDS)[number];

export interface RowDef {
  id: RowId;
  name: string;
  /** What the row is priced in, as shown: 10 g for gold, 1 kg for silver. */
  unit: string;
  grams: number;
  /** Purity relative to the feed's fine metal (the trade convention: 22K = 24K × 0.916, 18K = 24K × 0.750). */
  factor: number;
  metal: 'g' | 's';
}

export const ROWS: RowDef[] = [
  { id: 'g24', name: 'Gold 24K · 999', unit: '10 g', grams: 10, factor: 1, metal: 'g' },
  { id: 'g22', name: 'Gold 22K · 916', unit: '10 g', grams: 10, factor: 0.916, metal: 'g' },
  { id: 'g18', name: 'Gold 18K · 750', unit: '10 g', grams: 10, factor: 0.75, metal: 'g' },
  { id: 'ag', name: 'Silver · 999', unit: '1 kg', grams: 1000, factor: 1, metal: 's' }
];
export const rowDef = (id: RowId) => ROWS.find((r) => r.id === id)!;

/** A store's own pricing on top of the feed: rupees added for buyers buying, taken off for buyers selling, per row unit. */
export interface Margin { buy: number; sell: number }
export interface Desk {
  margins: Record<RowId, Margin>;
  /** Round shown rates to the nearest this many rupees. */
  round: number;
  /** Rows the store shows, in this order. */
  rows: RowId[];
  bookingsOpen: boolean;
  /** A rate the owner holds by hand (per row unit, the buy side; sell keeps its margin below it). Wins over the feed while set. */
  fixed: Partial<Record<RowId, number>>;
  /** Extra rupees per gram on 24K coins over the 24K bar rate. */
  coinPremium: number;
}

export const DEFAULT_DESK: Desk = {
  margins: { g24: { buy: 0, sell: 0 }, g22: { buy: 0, sell: 0 }, g18: { buy: 0, sell: 0 }, ag: { buy: 0, sell: 0 } },
  round: 10,
  rows: ['g24', 'g22', 'g18', 'ag'],
  bookingsOpen: false,
  fixed: {},
  coinPremium: 0
};

export const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : Math.round(n));

/** The fine-metal price per row unit, before the store's margin. */
export const baseFor = (row: RowDef, t: Pick<Tick, 'g' | 's'>) => (row.metal === 'g' ? t.g : t.s) * row.factor * row.grams;

export interface BoardRow {
  id: RowId;
  name: string;
  unit: string;
  /** What a buyer pays (the store sells), per row unit. */
  buy: number;
  /** What a buyer gets (the store buys back), per row unit. */
  sell: number;
  /** Change of the buy rate since the day's opening. */
  change: number;
  changePct: number;
  fixed: boolean;
}

export type FeedStatus = 'live' | 'paused';

export interface Board {
  status: FeedStatus;
  at: number;
  sample: boolean;
  source: Tick['source'];
  rows: BoardRow[];
  spot?: { usdOz?: number; fx?: number };
}

/** Stale after this long without a tick: every board says "Rates paused" and booking stops. */
export const STALE_MS = 30_000;

export function statusOf(tick: Tick | null, now = Date.now(), staleMs = STALE_MS): FeedStatus {
  return tick && now - tick.at <= staleMs ? 'live' : 'paused';
}

/** One store's board from one tick. Pure: every live-rate instance computes the same rows. */
export function boardFor(tick: Tick, desk: Desk, now = Date.now()): Board {
  const rows = desk.rows.map((id) => {
    const def = rowDef(id);
    const m = desk.margins[id] ?? { buy: 0, sell: 0 };
    const hand = desk.fixed[id];
    const base = baseFor(def, tick);
    const open = baseFor(def, tick.open);
    const buy = roundTo(hand ?? base + m.buy, desk.round);
    const sell = roundTo((hand !== undefined ? hand - m.buy : base) - m.sell, desk.round);
    const openBuy = roundTo(open + m.buy, desk.round);
    const change = hand !== undefined ? 0 : buy - openBuy;
    return { id, name: def.name, unit: def.unit, buy, sell, change, changePct: openBuy ? Math.round((change / openBuy) * 10000) / 100 : 0, fixed: hand !== undefined };
  });
  return { status: statusOf(tick, now), at: tick.at, sample: Boolean(tick.sample), source: tick.source, rows, spot: tick.usdOz || tick.fx ? { usdOz: tick.usdOz, fx: tick.fx } : undefined };
}

/** What a buyer pays per gram for a booking product. */
export const BOOK_PRODUCTS = ['bar', 'coin', 'silver'] as const;
export type BookProduct = (typeof BOOK_PRODUCTS)[number];
export const PRODUCT_NAMES: Record<BookProduct, string> = { bar: '24K bar', coin: '24K coin', silver: 'Silver 999' };
export function perGram(product: BookProduct, board: Board, desk: Desk): number | null {
  const row = board.rows.find((r) => r.id === (product === 'silver' ? 'ag' : 'g24'));
  if (!row) return null;
  const g = rowDef(row.id).grams;
  const v = row.buy / g + (product === 'coin' ? desk.coinPremium : 0);
  return Math.round(v * 100) / 100;
}
/** The largest booking a buyer can ask for in one go (the owner confirms every booking anyway). */
export const MAX_GRAMS: Record<BookProduct, number> = { bar: 1000, coin: 500, silver: 30000 };

/** Indian digit grouping: 1,28,450. */
export const inr = (n: number, digits = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The start of the India day (UTC+05:30) that holds `t`, for the daily open. */
export const indiaDay = (t: number) => {
  const ist = t + 5.5 * 3600_000;
  return new Date(ist).toISOString().slice(0, 10);
};
