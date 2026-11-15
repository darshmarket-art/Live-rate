import type { FeedConfig } from '../config';

/** One reading from a provider: rupees per gram of fine metal (from MCX when given), and the market prices behind it. */
export interface Reading { g: number; s: number; comexG?: number; comexS?: number; fx?: number; mcx?: { g?: Record<string, number>; s?: Record<string, number> } }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/**
 * The next `n` MCX contracts of a metal that have not expired: gold trades Feb, Apr, Jun, Aug, Oct and Dec, silver Mar, May, Jul, Sep and
 * Dec, each expiring on the 5th (taken as the end of that day, India time). Names as MCX prints them: "GOLD DEC 2026".
 */
export function mcxContracts(metal: 'g' | 's', now = Date.now(), n = 3): string[] {
  const months = metal === 'g' ? [2, 4, 6, 8, 10, 12] : [3, 5, 7, 9, 12];
  const ist = new Date(now + 5.5 * 3600_000);
  let y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1;
  if (ist.getUTCDate() > 5) m++;
  const out: string[] = [];
  while (out.length < n) {
    if (m > 12) { m = 1; y++; }
    if (months.includes(m)) out.push(`${metal === 'g' ? 'GOLD' : 'SILVER'} ${MONTHS[m - 1]} ${y}`);
    m++;
  }
  return out;
}

/** "GOLD DEC 2026=data.gold.dec, GOLD FEB 2027=data.gold.feb" into [name, path] pairs, nearest first as written. */
export const contractPaths = (list?: string) => (list ?? '').split(',').map((x) => x.split('=').map((p) => p.trim())).filter((p): p is [string, string] => p.length === 2 && Boolean(p[0] && p[1]));

export interface FeedProvider {
  readonly kind: 'http' | 'sample';
  read(): Promise<Reading>;
}

export const GRAMS_PER_TROY_OZ = 31.1034768;

/** `a.b.0.c` into a parsed JSON value. */
export function pick(obj: unknown, dotted?: string): unknown {
  if (!dotted) return undefined;
  return dotted.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), obj);
}

const asNumber = (v: unknown, what: string): number => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`The feed gave no usable ${what} (${JSON.stringify(v)?.slice(0, 40)}).`);
  return n;
};

/**
 * The licensed provider over HTTP: one GET returning JSON. Which fields hold gold, silver and the exchange rate, and in what units, is set
 * by FEED_* variables (docs/DEPLOY.md), so a provider change is a configuration change, not a code change.
 */
export class HttpJsonProvider implements FeedProvider {
  readonly kind = 'http' as const;
  constructor(private c: FeedConfig, private fetchFn: typeof fetch = fetch) {
    if (!c.url || !(c.goldPath || c.mcxGold) || !(c.silverPath || c.mcxSilver)) throw new Error('FEED_PROVIDER=http needs FEED_URL and gold and silver (FEED_MCX_GOLD / FEED_MCX_SILVER, or FEED_GOLD_PATH / FEED_SILVER_PATH).');
  }
  async read(): Promise<Reading> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await this.fetchFn(this.c.url!, { headers: { Accept: 'application/json', ...(this.c.key ? { [this.c.keyHeader || 'x-api-key']: this.c.key } : {}) }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`The feed answered ${res.status}.`);
      return toReading(await res.json(), this.c);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Converts a provider's JSON into rupees per gram using the configured paths and units. */
export function toReading(json: unknown, c: Pick<FeedConfig, 'goldPath' | 'goldUnit' | 'silverPath' | 'silverUnit' | 'fxPath' | 'usdOzPath' | 'comexSilverPath' | 'mcxGold' | 'mcxSilver'>): Reading {
  const opt = (path: string | undefined, what: string) => (path ? asNumber(pick(json, path), what) : undefined);
  const fx = opt(c.fxPath, 'USD-INR rate');
  const book = (list?: string) => {
    const pairs = contractPaths(list);
    return pairs.length ? Object.fromEntries(pairs.map(([name, path]) => [name, asNumber(pick(json, path), name)])) : undefined;
  };
  const mcxG = book(c.mcxGold), mcxS = book(c.mcxSilver);
  const perGram = (raw: number, unit: string, what: string) => {
    if (unit === 'g') return raw;
    if (unit === '10g') return raw / 10;
    if (unit === 'kg') return raw / 1000;
    if (unit === 'oz_usd') {
      if (!fx) throw new Error(`${what} is in USD per ounce, so FEED_FX_PATH is needed too.`);
      return (raw * fx) / GRAMS_PER_TROY_OZ;
    }
    throw new Error(`Unknown unit ${unit}.`);
  };
  // the base follows the nearest MCX contract (per 10 g / per kg) when the provider gives MCX, else the configured gold and silver rates;
  // each store's board then follows its own chosen contract (shared/rates.ts boardFor)
  const near = (b?: Record<string, number>) => (b ? Object.values(b)[0] : undefined);
  const g = mcxG ? near(mcxG)! / 10 : perGram(asNumber(pick(json, c.goldPath), 'gold rate'), c.goldUnit, 'Gold');
  const s = mcxS ? near(mcxS)! / 1000 : perGram(asNumber(pick(json, c.silverPath), 'silver rate'), c.silverUnit, 'Silver');
  const comexG = opt(c.usdOzPath, 'COMEX gold') ?? (c.goldUnit === 'oz_usd' && c.goldPath ? asNumber(pick(json, c.goldPath), 'COMEX gold') : undefined);
  const comexS = opt(c.comexSilverPath, 'COMEX silver') ?? (c.silverUnit === 'oz_usd' && c.silverPath ? asNumber(pick(json, c.silverPath), 'COMEX silver') : undefined);
  return { g, s, comexG, comexS, fx, ...(mcxG || mcxS ? { mcx: { ...(mcxG ? { g: mcxG } : {}), ...(mcxS ? { s: mcxS } : {}) } } : {}) };
}

/** Development only: a gentle random walk. Every screen that shows it says "Sample feed, not market rates". */
export class SampleProvider implements FeedProvider {
  readonly kind = 'sample' as const;
  private cg = 4010;
  private cs = 48.2;
  private fx = 88.62;
  async read(): Promise<Reading> {
    const walk = (v: number, step: number) => Math.max(step, v + (Math.random() - 0.49) * step);
    this.cg = walk(this.cg, 1.5);
    this.cs = walk(this.cs, 0.03);
    this.fx = walk(this.fx, 0.004);
    // MCX sits above COMEX × USD-INR by import duty and premium (roughly 10% on gold, 12% on silver); later contracts carry a little more
    const g0 = (this.cg * this.fx * 10 * 1.1) / GRAMS_PER_TROY_OZ;
    const s0 = (this.cs * this.fx * 1000 * 1.12) / GRAMS_PER_TROY_OZ;
    const g = Object.fromEntries(mcxContracts('g').map((name, i) => [name, Math.round(g0 * (1 + 0.006 * i))]));
    const s = Object.fromEntries(mcxContracts('s').map((name, i) => [name, Math.round(s0 * (1 + 0.009 * i))]));
    return { g: Object.values(g)[0] / 10, s: Object.values(s)[0] / 1000, comexG: Math.round(this.cg * 10) / 10, comexS: Math.round(this.cs * 1000) / 1000, fx: Math.round(this.fx * 10000) / 10000, mcx: { g, s } };
  }
}

export function createProvider(c: FeedConfig): FeedProvider | null {
  if (c.provider === 'http') return new HttpJsonProvider(c);
  if (c.provider === 'sample') return new SampleProvider();
  return null;
}
