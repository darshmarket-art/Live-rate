import crypto from 'crypto';
import type { BookProduct } from '../shared/rates';

/** A rate held for one buyer for a short time. Signed, so the buyer's app can carry it back and the server needs to keep nothing. */
export interface Quote { store: string; phone: string; product: BookProduct; grams: number; perGram: number; amount: number; exp: number }

export const HOLD_MS = 30_000;

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signQuote(q: Quote, secret: string): string {
  const body = b64(JSON.stringify(q));
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** The quote, or why it cannot be used. */
export function readQuote(token: string, secret: string, now = Date.now()): { quote: Quote } | { error: string } {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return { error: 'That rate is not valid. Ask for a new one.' };
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { error: 'That rate is not valid. Ask for a new one.' };
  let q: Quote;
  try { q = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return { error: 'That rate is not valid. Ask for a new one.' }; }
  if (q.exp < now) return { error: 'The held rate has ended. Here is the new rate.' };
  return { quote: q };
}
