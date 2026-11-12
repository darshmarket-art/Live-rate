// A demo store for local development: npm run seed (STORE=file by default, the same data file the dev server uses).
// Store "aurum-demo" · owner owner@aurum-demo.test / DemoOwner@2026 · buyers sign in with OTP_STATIC_CODE.
import bcrypt from 'bcryptjs';
import { createStore, scoped } from '../server/store';
import { DEFAULT_DESK } from '../shared/rates';

const store = createStore(process.env.STORE || 'file');
const ID = 'aurum-demo';
await store.set('stores', ID, { id: ID, name: 'Aurum Demo Jewels', ownerEmail: 'owner@aurum-demo.test', passwordHash: await bcrypt.hash('DemoOwner@2026', 10), createdAt: new Date().toISOString() });
await store.set(scoped(ID, 'settings'), 'profile', { name: 'Aurum', tagline: 'Bullion and fine jewellery', city: 'Mumbai', address: '[Demo address]', phone: '+91 22 0000 0000', whatsapp: '919900011111', taxNote: 'GST extra', payTerms: 'Pay within 24 hours', pickup: 'From the store, Mon to Sat', ratesPublic: false });
await store.set(scoped(ID, 'settings'), 'desk', { ...DEFAULT_DESK, bookingsOpen: true, coinPremium: 35, margins: { g24: { buy: 450, sell: 900 }, g22: { buy: 400, sell: 1600 }, g18: { buy: 350, sell: 1800 }, ag: { buy: 800, sell: 1500 } } });
await store.set(scoped(ID, 'settings'), 'theme', { id: 'noir' });
console.log(`Seeded ${ID}. Open http://localhost:${process.env.PORT || 3200}/?store=${ID} (owner: /owner).`);
