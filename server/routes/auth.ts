import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Auth } from '../auth';
import type { Config } from '../config';
import { HttpError, handler, parse } from '../http';
import { scoped, type Store } from '../store';
import { storeOf } from '../tenancy';
import type { Messenger } from '../whatsapp';

const CODE_TTL_MS = 5 * 60_000;
const MAX_TRIES = 5;
const RESEND_MS = 30_000;

/** A 10-digit Indian mobile, however it was typed: "+91 98765 43210", "09876543210" and "919876543210" all become 919876543210. */
export const fullPhone = (raw: string): string | null => {
  let d = raw.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
};

const hash = (store: string, phone: string, code: string) => crypto.createHash('sha256').update(`${store}:${phone}:${code}`).digest('hex');

export interface Buyer { phone: string; name: string; createdAt: string; lastSeen?: string }

/** Buyers sign in with their WhatsApp number and a 6-digit code; the owner with email and password. */
export function authRoutes(config: Config, store: Store, auth: Auth, messenger: Messenger) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { status: 'error', message: 'Too many tries. Wait a few minutes and try again.' } });

  r.post('/otp/request', limiter, handler(async (req, res) => {
    const st = storeOf(res);
    const { phone: raw } = parse(z.object({ phone: z.string().max(24) }), req.body);
    const phone = fullPhone(raw);
    if (!phone) throw new HttpError(400, 'Enter a 10-digit mobile number.');
    const prev = await store.get<{ sentAt: number }>(scoped(st.id, 'otps'), phone);
    if (prev && Date.now() - prev.sentAt < RESEND_MS) throw new HttpError(429, 'A code was sent a moment ago. Wait 30 seconds to ask again.');
    const code = config.otpStaticCode ?? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await store.set(scoped(st.id, 'otps'), phone, { hash: hash(st.id, phone, code), sentAt: Date.now(), expiresAt: Date.now() + CODE_TTL_MS, tries: 0 });
    await messenger.sendCode(phone, code);
    res.json({ status: 'success', channel: config.whatsapp ? 'whatsapp' : 'dev', ...(config.otpStaticCode && !config.production ? { devCode: config.otpStaticCode } : {}) });
  }));

  r.post('/otp/verify', limiter, handler(async (req, res) => {
    const st = storeOf(res);
    const body = parse(z.object({ phone: z.string().max(24), code: z.string().regex(/^\d{6}$/, 'six digits'), name: z.string().trim().min(2).max(80).optional() }), req.body);
    const phone = fullPhone(body.phone);
    if (!phone) throw new HttpError(400, 'Enter a 10-digit mobile number.');
    const otp = await store.get<{ hash: string; expiresAt: number; tries: number }>(scoped(st.id, 'otps'), phone);
    if (!otp || otp.expiresAt < Date.now()) throw new HttpError(401, 'That code has expired. Ask for a new one.');
    if (otp.tries >= MAX_TRIES) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.');
    if (otp.hash !== hash(st.id, phone, body.code)) {
      await store.update(scoped(st.id, 'otps'), phone, { tries: otp.tries + 1 });
      throw new HttpError(401, 'That code is not right. Check it and try again.');
    }
    const buyer = await store.get<Buyer>(scoped(st.id, 'buyers'), phone);
    if (!buyer && !body.name) return void res.json({ status: 'needs-name' });
    await store.delete(scoped(st.id, 'otps'), phone);
    const now = new Date().toISOString();
    const me: Buyer = buyer ? { ...buyer, lastSeen: now } : { phone, name: body.name!, createdAt: now, lastSeen: now };
    await store.set(scoped(st.id, 'buyers'), phone, me as any);
    res.json({ status: 'success', token: auth.sign({ sub: phone, store: st.id, role: 'buyer' }), user: { phone, name: me.name }, isNew: !buyer });
  }));

  r.post('/owner/login', limiter, handler(async (req, res) => {
    const st = storeOf(res);
    const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }), req.body);
    const ok = email === st.ownerEmail.toLowerCase() && (await bcrypt.compare(password, st.passwordHash));
    if (!ok) throw new HttpError(401, 'That email and password do not match this store.');
    res.json({ status: 'success', token: auth.sign({ sub: email, store: st.id, role: 'owner' }), user: { email, name: st.name } });
  }));

  r.get('/me', auth.optional, handler(async (_req, res) => {
    const s = res.locals.session;
    if (!s) return void res.json({ status: 'success', user: null });
    if (s.role === 'owner') return void res.json({ status: 'success', user: { role: 'owner', email: s.sub } });
    const b = await store.get<Buyer>(scoped(s.store, 'buyers'), s.sub);
    res.json({ status: 'success', user: b ? { role: 'buyer', phone: b.phone, name: b.name } : null });
  }));

  return r;
}
