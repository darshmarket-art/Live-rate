import { z } from 'zod';

export const BANNER_ACTIONS = ['book', 'whatsapp', 'call', 'link', 'none'] as const;

/** One advertising banner: above the rates in the app, beside them on the shop screen, or both. */
export interface Banner {
  id: string;
  eyebrow: string;
  title: string;
  line: string;
  action: (typeof BANNER_ACTIONS)[number];
  link?: string;
  /** YYYY-MM-DD, India time, inclusive. */
  startsOn?: string;
  endsOn?: string;
  app: boolean;
  screen: boolean;
  on: boolean;
  order: number;
  /** Blob name of the photo, stores/<id>/banners/<file>. */
  photo?: string;
  createdAt: string;
}

export const MAX_BANNERS = 12;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date as YYYY-MM-DD');
export const bannerSchema = z.object({
  eyebrow: z.string().trim().max(40).default(''),
  title: z.string().trim().min(2).max(70),
  line: z.string().trim().max(120).default(''),
  action: z.enum(BANNER_ACTIONS).default('none'),
  link: z.string().trim().url().max(500).refine((u) => /^https:\/\//.test(u), 'an https:// address').optional(),
  startsOn: day.optional(),
  endsOn: day.optional(),
  app: z.boolean().default(true),
  screen: z.boolean().default(true),
  on: z.boolean().default(true)
}).refine((b) => !(b.startsOn && b.endsOn) || b.startsOn <= b.endsOn, { message: 'The end date is before the start date.', path: ['endsOn'] })
  .refine((b) => b.action !== 'link' || Boolean(b.link), { message: 'Give the address the banner opens.', path: ['link'] });

const today = (now: number) => new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Banners a buyer (or the shop screen) sees today, in the owner's order. */
export function liveBanners(list: Banner[], where: 'app' | 'screen', now = Date.now()) {
  const d = today(now);
  return list
    .filter((b) => b.on && b[where] && b.photo && (!b.startsOn || b.startsOn <= d) && (!b.endsOn || b.endsOn >= d))
    .sort((a, b) => a.order - b.order);
}

/** What a viewer gets: no owner-only fields; the photo as an address on this store. */
export const publicBanner = (b: Banner) => ({ id: b.id, eyebrow: b.eyebrow, title: b.title, line: b.line, action: b.action, link: b.link, photo: b.photo ? `/media/${b.photo.split('/').slice(2).join('/')}` : null });
