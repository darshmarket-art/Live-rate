import http from 'http';
import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkAlerts } from '../server/alerts';
import { MemoryBlobs } from '../server/blobs';
import { loadConfig } from '../server/config';
import { FeedHub } from '../server/feed/hub';
import { createLiveApp } from '../server/liveApp';
import { errorHandler } from '../server/http';
import { MemoryStore } from '../server/store';
import { StoreCache } from '../server/stores';
import type { Messenger } from '../server/whatsapp';
import type { Tick } from '../shared/rates';

const MASTER = 'test-master-key-test-master-key';
const tick = (g = 12800, s = 152, extra: Partial<Tick> = {}): Tick => ({ at: Date.now(), g, s, open: { g: 12750, s: 150 }, source: 'feed', ...extra });

function build() {
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'j'.repeat(40), MASTER_KEY: MASTER, OTP_STATIC_CODE: '123456', STORE: 'memory', FEED_PROVIDER: 'none' } as any);
  const store = new MemoryStore();
  const hub = new FeedHub();
  const sent: string[] = [];
  const messenger: Messenger = { sendCode: async () => {}, sendAlert: async (_p, _s, what, rate) => void sent.push(`${what} ${rate}`) };
  const { app } = createLiveApp({ config, store, blobs: new MemoryBlobs(), hub, messenger });
  app.use(errorHandler);
  return { app, store, hub, sent, messenger };
}

const S = { 'X-Store': 'aurum' };
async function withStore(app: any) {
  const made = await request(app).post('/api/console/stores').set('X-Master-Key', MASTER).send({ id: 'aurum', name: 'Aurum Jewels', ownerEmail: 'owner@aurum.test', password: 'a-long-password' });
  expect(made.status).toBe(201);
  const owner = (await request(app).post('/api/auth/owner/login').set(S).send({ email: 'owner@aurum.test', password: 'a-long-password' })).body.token;
  return { owner: { ...S, Authorization: `Bearer ${owner}` } };
}
async function buyer(app: any, phone = '9820000001') {
  await request(app).post('/api/auth/otp/request').set(S).send({ phone });
  const first = await request(app).post('/api/auth/otp/verify').set(S).send({ phone, code: '123456' });
  expect(first.body.status).toBe('needs-name');
  const v = await request(app).post('/api/auth/otp/verify').set(S).send({ phone, code: '123456', name: 'Ananya' });
  expect(v.body.status).toBe('success');
  return { ...S, Authorization: `Bearer ${v.body.token}` };
}

describe('stores and sign-in', () => {
  it('only an operator opens a store; an unknown store is 404', async () => {
    const { app } = build();
    expect((await request(app).post('/api/console/stores').send({ id: 'x-store', name: 'X', ownerEmail: 'a@b.co', password: 'a-long-password' })).status).toBe(403);
    expect((await request(app).get('/api/store').set('X-Store', 'nobody')).status).toBe(404);
    await withStore(app);
    expect((await request(app).post('/api/console/stores').set('X-Master-Key', MASTER).send({ id: 'aurum', name: 'Again', ownerEmail: 'a@b.co', password: 'a-long-password' })).status).toBe(409);
    expect((await request(app).post('/api/console/stores').set('X-Master-Key', MASTER).send({ id: 'rates', name: 'Reserved', ownerEmail: 'a@b.co', password: 'a-long-password' })).status).toBe(400);
  });

  it('the store answers on <store>.rates.<domain> too, and a host cannot be overridden by X-Store', async () => {
    const { app } = build();
    await withStore(app);
    expect((await request(app).get('/api/store').set('Host', 'aurum.rates.antarixs.com')).body.store.id).toBe('aurum');
    expect((await request(app).get('/api/store').set('Host', 'other.rates.antarixs.com').set('X-Store', 'aurum')).status).toBe(404);
  });

  it('a wrong code counts; five wrong codes lock it; a token from another store does not work here', async () => {
    const { app } = build();
    await withStore(app);
    await request(app).post('/api/auth/otp/request').set(S).send({ phone: '+91 98200 00002' });
    for (let i = 0; i < 5; i++) expect((await request(app).post('/api/auth/otp/verify').set(S).send({ phone: '9820000002', code: '000000' })).status).toBe(401);
    expect((await request(app).post('/api/auth/otp/verify').set(S).send({ phone: '9820000002', code: '123456' })).status).toBe(429);
    await request(app).post('/api/console/stores').set('X-Master-Key', MASTER).send({ id: 'other', name: 'Other', ownerEmail: 'o@o.co', password: 'a-long-password' });
    const b = await buyer(app);
    expect((await request(app).get('/api/rates').set({ ...b, 'X-Store': 'other' })).status).toBe(401);
  });
});

describe('rates', () => {
  it('rates are for signed-in buyers unless the owner makes them public; margins apply', async () => {
    const { app, hub } = build();
    const { owner } = await withStore(app);
    hub.publish(tick());
    expect((await request(app).get('/api/rates').set(S)).status).toBe(401);
    const b = await buyer(app);
    const empty = await request(app).get('/api/rates').set(b);
    expect(empty.body.board.rows[0]).toMatchObject({ id: 'g24', buy: 128000, sell: 128000 });
    const settings = (await request(app).get('/api/admin/settings').set(owner)).body;
    const margins = { ...settings.desk.margins, g24: { buy: 450, sell: 900 } };
    expect((await request(app).put('/api/admin/desk').set(owner).send({ ...settings.desk, margins })).status).toBe(200);
    expect((await request(app).get('/api/rates').set(b)).body.board.rows[0]).toMatchObject({ buy: 128450, sell: 127100 });
    expect((await request(app).put('/api/admin/profile').set(owner).send({ ...settings.profile, ratesPublic: true })).status).toBe(200);
    expect((await request(app).get('/api/rates').set(S)).status).toBe(200);
    // buyers never see the feed before margins
    expect((await request(app).get('/api/admin/feed').set(b)).status).toBe(403);
    expect((await request(app).get('/api/admin/feed').set(owner)).body.feed.base.g24).toBe(128000);
  });

  it('the stream sends the board at once and again on every tick', async () => {
    const { app, hub } = build();
    const { owner } = await withStore(app);
    hub.publish(tick());
    const server = http.createServer(app).listen(0);
    const port = (server.address() as any).port;
    const token = owner.Authorization.slice(7);
    const res = await fetch(`http://localhost:${port}/api/rates/stream?store=aurum&token=${token}`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    const until = async (n: number) => { while ((text.match(/^data:/gm) ?? []).length < n) text += dec.decode((await reader.read()).value); };
    await until(1);
    hub.publish(tick(12900));
    await until(2);
    const boards = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)));
    expect(boards.map((b) => b.rows[0].buy)).toEqual([128000, 129000]);
    await reader.cancel();
    server.close();
  });
});

describe('booking at a held rate', () => {
  async function ready() {
    const r = build();
    const { owner } = await withStore(r.app);
    const settings = (await request(r.app).get('/api/admin/settings').set(owner)).body;
    await request(r.app).put('/api/admin/desk').set(owner).send({ ...settings.desk, bookingsOpen: true, coinPremium: 30 });
    r.hub.publish(tick());
    return { ...r, owner, b: await buyer(r.app) };
  }

  it('quotes, books once, and the owner moves it along', async () => {
    const { app, b, owner } = await ready();
    const q = (await request(app).post('/api/quotes').set(b).send({ product: 'coin', grams: 8 })).body.quote;
    expect(q).toMatchObject({ perGram: 12830, amount: 102640 });
    const booked = await request(app).post('/api/bookings').set(b).send({ token: q.token });
    expect(booked.status).toBe(201);
    expect((await request(app).post('/api/bookings').set(b).send({ token: q.token })).status).toBe(409);
    const ref = booked.body.booking.ref;
    expect((await request(app).patch(`/api/admin/bookings/${ref}`).set(owner).send({ status: 'collected' })).status).toBe(409);
    expect((await request(app).patch(`/api/admin/bookings/${ref}`).set(owner).send({ status: 'confirmed' })).body.booking.status).toBe('confirmed');
    expect((await request(app).get('/api/bookings/mine').set(b)).body.bookings[0].status).toBe('confirmed');
  });

  it('a changed, foreign or expired quote is refused (the expired one with a fresh rate)', async () => {
    const { app, b } = await ready();
    const q = (await request(app).post('/api/quotes').set(b).send({ product: 'bar', grams: 10 })).body.quote;
    const [body, sig] = q.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), perGram: 1 })).toString('base64url');
    expect((await request(app).post('/api/bookings').set(b).send({ token: `${forged}.${sig}` })).status).toBe(400);
    const other = await buyer(app, '9820000009');
    expect((await request(app).post('/api/bookings').set(other).send({ token: q.token })).status).toBe(400);
    const stale = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), exp: Date.now() - 1 })).toString('base64url');
    const { signQuote } = await import('../server/quotes');
    const expired = await request(app).post('/api/bookings').set(b).send({ token: signQuote(JSON.parse(Buffer.from(stale, 'base64url').toString()), 'j'.repeat(40) + ':quote') });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('QUOTE_EXPIRED');
    expect(expired.body.quote.perGram).toBe(12800);
  });

  it('no booking while bookings are closed, while the feed is paused, or above the limit', async () => {
    const { app, b, owner, hub } = await ready();
    expect((await request(app).post('/api/quotes').set(b).send({ product: 'bar', grams: 5000 })).status).toBe(400);
    hub.publish(tick(12800, 152, { at: Date.now() - 60_000 + 1 }));
    const settings = (await request(app).get('/api/admin/settings').set(owner)).body;
    await request(app).put('/api/admin/desk').set(owner).send({ ...settings.desk, bookingsOpen: false });
    expect((await request(app).post('/api/quotes').set(b).send({ product: 'bar', grams: 10 })).body.message).toMatch(/not taking bookings/);
  });
});

describe('owner: theme, banners, screen', () => {
  it('saves a theme; refuses an unreadable accent; buyers get the tokens and the page is painted with them', async () => {
    const { app } = build();
    const { owner } = await withStore(app);
    expect((await request(app).put('/api/admin/theme').set(owner).send({ id: 'emerald', accent: '#1a1a1a' })).status).toBe(400);
    expect((await request(app).put('/api/admin/theme').set(owner).send({ id: 'nope' })).status).toBe(400);
    expect((await request(app).put('/api/admin/theme').set(owner).send({ id: 'ivory', accent: '#1a3a6a' })).status).toBe(200);
    const s = (await request(app).get('/api/store').set(S)).body;
    expect(s.theme).toMatchObject({ id: 'ivory', accent: '#1a3a6a', dark: false });
    expect(s.theme.tokens).toMatchObject({ bg: '#faf7f1', accent: '#1a3a6a', onAccent: '#ffffff' });
  });

  it('a banner shows once it has a photo, on the screens it is set for, within its dates', async () => {
    const { app } = build();
    const { owner } = await withStore(app);
    const add = await request(app).post('/api/admin/banners').set(owner).send({ eyebrow: 'In the vault', title: '24K coins and bars', action: 'book', app: true, screen: false });
    expect(add.status).toBe(201);
    const id = add.body.banner.id;
    expect((await request(app).get('/api/store').set(S)).body.banners).toHaveLength(0);
    const jpg = await sharp({ create: { width: 2400, height: 1000, channels: 3, background: '#887766' } }).jpeg().toBuffer();
    expect((await request(app).put(`/api/admin/banners/${id}/photo`).set(owner).set('Content-Type', 'image/png').send(Buffer.from('nope'))).status).toBe(415);
    const up = await request(app).put(`/api/admin/banners/${id}/photo`).set(owner).set('Content-Type', 'image/jpeg').send(jpg);
    expect(up.status).toBe(200);
    const shown = (await request(app).get('/api/store').set(S)).body.banners;
    expect(shown).toHaveLength(1);
    const img = await request(app).get(shown[0].photo).set(S);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(img.body).metadata()).width).toBe(1800);
    await request(app).put(`/api/admin/banners/${id}`).set(owner).send({ title: '24K coins and bars', action: 'book', endsOn: '2020-01-01' });
    expect((await request(app).get('/api/store').set(S)).body.banners).toHaveLength(0);
    expect((await request(app).post('/api/admin/banners').set(owner).send({ title: 'Link', action: 'link', link: 'http://insecure.example' })).status).toBe(400);
  });

  it('the shop screen opens with its key only, and a new key cuts the old one off', async () => {
    const { app, hub } = build();
    const { owner } = await withStore(app);
    hub.publish(tick());
    const key = (await request(app).get('/api/admin/screen').set(owner)).body.key;
    expect((await request(app).get(`/api/screen?key=${key}`).set(S)).body.board.rows).toHaveLength(4);
    expect((await request(app).get('/api/screen?key=wrong').set(S)).status).toBe(403);
    await request(app).post('/api/admin/screen/rotate').set(owner);
    expect((await request(app).get(`/api/screen?key=${key}`).set(S)).status).toBe(403);
  });
});

describe('rate alerts', () => {
  it('fire once when the store’s own rate crosses the mark, and are switched off', async () => {
    const { app, store, hub, sent, messenger } = build();
    await withStore(app);
    const b = await buyer(app);
    hub.publish(tick());
    expect((await request(app).post('/api/alerts').set(b).send({ row: 'g24', above: false, mark: 127500 })).status).toBe(201);
    const cache = new StoreCache(store);
    expect(await checkAlerts(store, cache, hub.latest(), messenger)).toBe(0);
    hub.publish(tick(12700));
    expect(await checkAlerts(store, cache, hub.latest(), messenger)).toBe(1);
    expect(await checkAlerts(store, cache, hub.latest(), messenger)).toBe(0);
    expect(sent).toEqual(['Gold 24K · 999 per 10 g ₹1,27,000']);
    const alerts = (await request(app).get('/api/alerts').set(b)).body.alerts;
    expect(alerts[0]).toMatchObject({ active: false, triggeredRate: 127000 });
    expect((await request(app).get('/api/notifications').set(b)).body.notifications).toHaveLength(1);
    // never on the sample feed
    hub.publish(tick(12600, 152, { sample: true }));
    await request(app).patch(`/api/alerts/${alerts[0].id}`).set(b).send({ active: true });
    expect(await checkAlerts(store, cache, hub.latest(), messenger)).toBe(0);
  });
});
