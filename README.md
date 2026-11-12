# Antarixs Live Rate

Live gold and silver rates for every Antarixs store, from one licensed feed. Each store adds its own margins, chooses its look,
runs advertising banners, takes bookings at a held rate, sends rate alerts and shows everything on a shop TV.
Same store design as `[store].antarixs.com` (Maison: Cormorant Garamond over Jost, square corners, hairlines).

* **Buyer app** (`/`): live board ("You buy" / "You sell", change since opening), banners above it, a chart per metal (1D/1W/1M/1Y),
  booking at a rate held for 30 seconds, rate alerts, updates, the store's details. Sign-in with WhatsApp number and code.
* **Owner console** (`/owner`): rate desk (margin per row, rounding, rows shown, a rate held by hand, coin premium, bookings on/off),
  bookings (confirm, decline, collected), banners (photo, dates, app and/or shop screen, order), **theme** (six looks: Noir, Ivory,
  Midnight, Garnet, Emerald, Heritage, plus the store's own accent colour, refused when it would be hard to read), store details and
  the shop screen link.
* **Shop screen** (`/screen?key=…`): large live rates beside full-height banners, for the TV in the shop.
* **Operator console** (`/api/console/*`, `X-Master-Key`): open a store; hold the rate by hand while the feed is down.

How the feed reaches every store, and how to deploy: [docs/DEPLOY.md](docs/DEPLOY.md).

## Run it locally

```sh
npm install
cp .env.example .env       # ROLE=both, sample feed, OTP code 123456
npm run seed               # store "aurum-demo", owner owner@aurum-demo.test / DemoOwner@2026
npm run dev                # http://localhost:3200/?store=aurum-demo  (owner: /owner)
```

The sample feed is a random walk and every screen says "Sample feed, not market rates". Bookings on it work only outside production.

```sh
npm run lint   # tsc
npm test       # vitest: rate maths, themes, the ingest loop, the API end to end
npm run build  # client to dist/, server to dist-server/
```

## Layout

| Path | What |
|---|---|
| `shared/rates.ts` | the rate model: rows, derivation from 24K and silver, margins, rounding, fixed rates, stale rule |
| `shared/themes.ts` | the owner's themes and the accent contrast rule |
| `server/feed/` | provider adapter (HTTP JSON, sample), the ingest loop, the in-process hub, live-rate's stream client |
| `server/routes/` | auth (OTP, owner), rates and stream, buyer (quotes, bookings, alerts), admin, screen, console |
| `src/` | the React app: buyer screens, `owner/`, `tv/` |
