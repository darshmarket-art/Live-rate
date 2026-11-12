import type { FeedConfig } from '../config';

/** One reading from a provider, in rupees per gram of fine metal. */
export interface Reading { g: number; s: number; usdOz?: number; fx?: number }

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
    if (!c.url || !c.goldPath || !c.silverPath) throw new Error('FEED_PROVIDER=http needs FEED_URL, FEED_GOLD_PATH and FEED_SILVER_PATH.');
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
export function toReading(json: unknown, c: Pick<FeedConfig, 'goldPath' | 'goldUnit' | 'silverPath' | 'silverUnit' | 'fxPath' | 'usdOzPath'>): Reading {
  const fx = c.fxPath ? asNumber(pick(json, c.fxPath), 'USD-INR rate') : undefined;
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
  const g = perGram(asNumber(pick(json, c.goldPath), 'gold rate'), c.goldUnit, 'Gold');
  const s = perGram(asNumber(pick(json, c.silverPath), 'silver rate'), c.silverUnit, 'Silver');
  const usdOz = c.usdOzPath ? asNumber(pick(json, c.usdOzPath), 'spot gold') : c.goldUnit === 'oz_usd' ? asNumber(pick(json, c.goldPath), 'spot gold') : undefined;
  return { g, s, usdOz, fx };
}

/** Development only: a gentle random walk. Every screen that shows it says "Sample feed, not market rates". */
export class SampleProvider implements FeedProvider {
  readonly kind = 'sample' as const;
  private g = 12800;
  private s = 152;
  private usd = 3990;
  async read(): Promise<Reading> {
    this.g = Math.max(1000, this.g + (Math.random() - 0.48) * 6);
    this.s = Math.max(10, this.s + (Math.random() - 0.48) * 0.25);
    this.usd = this.usd + (Math.random() - 0.48) * 2;
    return { g: this.g, s: this.s, usdOz: Math.round(this.usd * 10) / 10, fx: 88.62 };
  }
}

export function createProvider(c: FeedConfig): FeedProvider | null {
  if (c.provider === 'http') return new HttpJsonProvider(c);
  if (c.provider === 'sample') return new SampleProvider();
  return null;
}
