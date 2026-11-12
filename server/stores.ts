import { z } from 'zod';
import { DEFAULT_DESK, ROW_IDS, type Desk } from '../shared/rates';
import { DEFAULT_THEME, THEME_IDS, type StoreTheme } from '../shared/themes';
import { isValidStoreName } from '../shared/storeName';
import { scoped, type Store } from './store';

/** One document per store in the top-level `stores` collection; everything else a store owns sits under stores/<id>/. */
export interface StoreRecord {
  id: string;
  name: string;
  ownerEmail: string;
  passwordHash: string;
  createdAt: string;
}

export interface Profile {
  name: string;
  tagline: string;
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  /** Printed under the rates, e.g. "GST extra". */
  taxNote: string;
  /** Shown before a buyer books, e.g. "Pay within 24 hours". */
  payTerms: string;
  pickup: string;
  /** Rates visible without signing in (bookings and alerts always need sign-in). */
  ratesPublic: boolean;
}

export const DEFAULT_PROFILE = (name: string): Profile => ({ name, tagline: '', city: '', address: '', phone: '', whatsapp: '', taxNote: '', payTerms: '', pickup: '', ratesPublic: false });

const txt = (n: number) => z.string().trim().max(n);
export const profileSchema = z.object({
  name: txt(60).min(2), tagline: txt(80), city: txt(60), address: txt(200),
  phone: txt(20).regex(/^[0-9 +-]*$/, 'digits, spaces, + and - only'), whatsapp: z.string().trim().regex(/^(\d{10,15})?$/, 'country code and number, digits only'),
  taxNote: txt(120), payTerms: txt(160), pickup: txt(120), ratesPublic: z.boolean()
});

const money = z.number().int().min(0).max(1_000_000);
export const deskSchema = z.object({
  margins: z.object(Object.fromEntries(ROW_IDS.map((id) => [id, z.object({ buy: money, sell: money })])) as Record<(typeof ROW_IDS)[number], z.ZodObject<{ buy: typeof money; sell: typeof money }>>),
  round: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(50), z.literal(100)]),
  rows: z.array(z.enum(ROW_IDS)).min(1).max(ROW_IDS.length).refine((r) => new Set(r).size === r.length, 'each row once'),
  bookingsOpen: z.boolean(),
  fixed: z.object(Object.fromEntries(ROW_IDS.map((id) => [id, z.number().int().min(1).max(100_000_000).optional()]))),
  coinPremium: z.number().min(0).max(100_000)
});

export const themeSchema = z.object({ id: z.enum(THEME_IDS), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });

export interface Settings { desk: Desk; theme: StoreTheme; profile: Profile }

/**
 * Store settings with a short in-memory cache: the rate stream reads a store's desk on every tick, so it must not wait on the database.
 * An owner's change clears this instance's copy at once; other live-rate instances pick it up within `ttlMs`.
 */
export class StoreCache {
  private cache = new Map<string, { at: number; v: Settings; loading?: Promise<Settings> }>();
  constructor(private store: Store, private ttlMs = 10_000, private now: () => number = Date.now) {}

  async record(id: string): Promise<StoreRecord | null> {
    if (!isValidStoreName(id)) return null;
    return this.store.get<StoreRecord>('stores', id);
  }

  private async load(id: string, name: string): Promise<Settings> {
    const [desk, theme, profile] = await this.store.getMany(scoped(id, 'settings'), ['desk', 'theme', 'profile']);
    const v: Settings = {
      desk: { ...DEFAULT_DESK, ...(desk as Desk | null), margins: { ...DEFAULT_DESK.margins, ...((desk as Desk | null)?.margins ?? {}) }, fixed: { ...((desk as Desk | null)?.fixed ?? {}) } },
      theme: (theme as StoreTheme | null) ?? { id: DEFAULT_THEME },
      profile: { ...DEFAULT_PROFILE(name), ...(profile as Profile | null) }
    };
    this.cache.set(id, { at: this.now(), v });
    return v;
  }

  async get(id: string, name = id): Promise<Settings> {
    const c = this.cache.get(id);
    if (c && this.now() - c.at < this.ttlMs) return c.v;
    if (c?.loading) return c.loading;
    const loading = this.load(id, name);
    if (c) c.loading = loading;
    try { return await loading; } finally { const e = this.cache.get(id); if (e) delete e.loading; }
  }

  /** The cached copy at once (for the stream), refreshing it in the background when it is old. */
  peek(id: string): Settings | null {
    const c = this.cache.get(id);
    if (c && this.now() - c.at >= this.ttlMs && !c.loading) void this.get(id).catch(() => {});
    return c?.v ?? null;
  }

  async save<K extends keyof Settings>(id: string, key: K, value: Settings[K]) {
    await this.store.set(scoped(id, 'settings'), key, value as any);
    this.cache.delete(id);
  }
}
