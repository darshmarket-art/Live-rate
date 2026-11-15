import type { Board, BookProduct, Desk, RowId } from '../shared/rates';
import type { StoreTheme, ThemeTokens, ThemeId } from '../shared/themes';

/** The store this app is for: from <store>.rates.<domain>, else ?store= (kept for the installed app and localhost). */
export const storeParam = (() => {
  const host = location.hostname.split('.');
  if (host.length > 3 && host[1] === 'rates') return null; // the host says it
  const q = new URLSearchParams(location.search).get('store');
  try {
    if (q) localStorage.setItem('lr_store', q);
    return q || localStorage.getItem('lr_store');
  } catch {
    return q;
  }
})();

const KEY = 'lr_session';
export const session = {
  get(): { token: string; role: 'buyer' | 'owner' } | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v: { token: string; role: 'buyer' | 'owner' } | null) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* private mode: signed in for this visit only */ } }
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public body?: any) { super(message); }
}

export const withStore = (path: string) => (storeParam ? `${path}${path.includes('?') ? '&' : '?'}store=${encodeURIComponent(storeParam)}` : path);

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session.get();
  const res = await fetch(withStore(path), {
    ...init,
    headers: { ...(init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...init.headers }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s) session.set(null);
    throw new ApiError(res.status, json.message || 'Something went wrong. Try again.', json.code, json);
  }
  return json;
}
const post = <T = any>(path: string, body?: unknown, method = 'POST') => call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface Banner { id: string; eyebrow: string; title: string; line: string; action: 'book' | 'whatsapp' | 'call' | 'link' | 'none'; link?: string; photo: string | null }
export interface StoreInfo { id: string; name: string; tagline: string; city: string; address: string; phone: string; whatsapp: string; taxNote: string; payTerms: string; pickup: string; notice: string; ratesPublic: boolean; bookingsOpen: boolean; coinPremium: number }
export interface ThemeView { id: ThemeId; accent: string | null; dark: boolean; display?: string; duo?: boolean; tokens: ThemeTokens }
export interface Quote { product: BookProduct; grams: number; perGram: number; amount: number; exp: number; token: string }
export interface Booking { ref: string; phone: string; name: string; product: BookProduct; grams: number; perGram: number; amount: number; status: 'requested' | 'confirmed' | 'cancelled' | 'collected'; createdAt: string; note?: string }
export interface Alert { id: string; row: RowId; above: boolean; mark: number; active: boolean; createdAt: string; triggeredAt?: string; triggeredRate?: number }
export interface Profile { name: string; tagline: string; city: string; address: string; phone: string; whatsapp: string; taxNote: string; payTerms: string; pickup: string; notice: string; ratesPublic: boolean }
export interface OwnerBanner extends Omit<Banner, 'photo'> { startsOn?: string; endsOn?: string; app: boolean; screen: boolean; on: boolean; order: number; photoUrl: string | null }
export interface ThemeChoice { id: ThemeId; name: string; note: string; dark: boolean; tokens: ThemeTokens; display: string; duo?: boolean }

export const api = {
  store: () => call<{ store: StoreInfo; theme: ThemeView; banners: Banner[] }>('/api/store'),
  me: async () => {
    const r = await call<{ user: { role: 'buyer' | 'owner'; name?: string; phone?: string; email?: string } | null; token?: string }>('/api/auth/me');
    if (r.token) session.set({ token: r.token, role: 'buyer' });
    return r;
  },
  rates: () => call<{ board: Board }>('/api/rates'),
  history: (row: RowId, range: string) => call<{ points: Array<{ at: number; v: number }> }>(`/api/rates/history?row=${row}&range=${range}`),
  requestCode: (phone: string) => post<{ devCode?: string; channel: string }>('/api/auth/otp/request', { phone }),
  verifyCode: (phone: string, code: string, name?: string) => post<{ status: string; token?: string; user?: { name: string } }>('/api/auth/otp/verify', { phone, code, ...(name ? { name } : {}) }),
  ownerLogin: (email: string, password: string) => post<{ token: string }>('/api/auth/owner/login', { email, password }),
  quote: (product: BookProduct, grams: number) => post<{ quote: Quote }>('/api/quotes', { product, grams }),
  book: (token: string) => post<{ booking: Booking }>('/api/bookings', { token }),
  myBookings: () => call<{ bookings: Booking[] }>('/api/bookings/mine'),
  alerts: () => call<{ alerts: Alert[] }>('/api/alerts'),
  addAlert: (row: RowId, above: boolean, mark: number) => post<{ alert: Alert }>('/api/alerts', { row, above, mark }),
  setAlert: (id: string, active: boolean) => post<{ alert: Alert }>(`/api/alerts/${id}`, { active }, 'PATCH'),
  removeAlert: (id: string) => post(`/api/alerts/${id}`, undefined, 'DELETE'),
  notifications: () => call<{ notifications: Array<{ id: string; text: string; at: string }> }>('/api/notifications'),
  // owner
  settings: () => call<{ desk: Desk; theme: StoreTheme; profile: Profile; themes: ThemeChoice[] }>('/api/admin/settings'),
  feed: () => call<{ feed: { status: 'live' | 'paused'; at: number; sample: boolean; source: string; base: Record<RowId, number>; contracts?: { g: string[]; s: string[] } } | null }>('/api/admin/feed'),
  saveDesk: (d: Desk) => post<{ desk: Desk }>('/api/admin/desk', d, 'PUT'),
  saveTheme: (t: StoreTheme) => post<{ theme: StoreTheme; tokens: ThemeTokens }>('/api/admin/theme', t, 'PUT'),
  saveProfile: (p: Profile) => post<{ profile: Profile }>('/api/admin/profile', p, 'PUT'),
  banners: () => call<{ banners: OwnerBanner[] }>('/api/admin/banners'),
  addBanner: (b: Partial<OwnerBanner>) => post<{ banner: OwnerBanner }>('/api/admin/banners', b),
  saveBanner: (id: string, b: Partial<OwnerBanner>) => post<{ banner: OwnerBanner }>(`/api/admin/banners/${id}`, b, 'PUT'),
  bannerPhoto: (id: string, file: File) => call<{ banner: OwnerBanner }>(`/api/admin/banners/${id}/photo`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } }),
  orderBanners: (ids: string[]) => post<{ banners: OwnerBanner[] }>('/api/admin/banners/order', { ids }),
  removeBanner: (id: string) => post(`/api/admin/banners/${id}`, undefined, 'DELETE'),
  bookings: () => call<{ bookings: Booking[] }>('/api/admin/bookings'),
  setBooking: (ref: string, status: Booking['status']) => post<{ booking: Booking }>(`/api/admin/bookings/${ref}`, { status }, 'PATCH'),
  screenKey: () => call<{ key: string }>('/api/admin/screen'),
  rotateScreenKey: () => post<{ key: string }>('/api/admin/screen/rotate'),
  screen: (key: string) => call<{ store: { name: string; city: string; address: string; phone: string; taxNote: string; notice: string }; theme: ThemeView; banners: Banner[]; board: Board }>(`/api/screen?key=${encodeURIComponent(key)}`)
};
