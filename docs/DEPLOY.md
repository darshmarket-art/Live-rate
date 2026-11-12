# Deploying Antarixs Live Rate on Google Cloud

Two Cloud Run services from one image, in the same project as the Catalogue (`gen-lang-client-0273003651`, `asia-south1`), behind the
load balancer that already serves `*.antarixs.com`.

```
licensed rate API ──(one call per tick)──▶ rate-ingest (1 instance, holds the API key)
                                              │ stream (SSE, IAM + token)        │ every 5 s / minute
                                              ▼                                  ▼
                       live-rate (autoscaled, every store) ◀── on restart ── Firestore feed/latest, feedMinute/Hour/Day
                                              │ store margins added in memory
                                              ▼
                     [store].rates.antarixs.com: buyer apps · owner console · shop screens (SSE)
```

* **rate-ingest** (`ROLE=ingest`): the only caller of the provider and the only holder of its key. Reads once per tick, holds back a
  reading that jumps more than `FEED_SPIKE_FRACTION` (default 3%) until the next one agrees, works out 22K and 18K from 24K
  (× 0.916, × 0.750), keeps the day's opening (India time), streams every tick to live-rate, writes `feed/latest` every 5 s and one
  closing price per minute, hour and day, and checks every store's rate alerts once a minute (one instance, so each alert fires once).
* **live-rate** (`ROLE=live`): every store's API, buyer app, owner console and shop screen. Keeps one stream from rate-ingest per
  instance, starts from `feed/latest`, adds each store's margins in memory and streams boards to buyers. No provider key.
* If no tick arrives for 30 s every board says "Rates paused" and booking stops. Nothing made-up is ever shown: the sample feed
  (`FEED_PROVIDER=sample`) is refused in production unless `ALLOW_SAMPLE_FEED=true` (test deployments only), and every screen labels it.

## 1. APIs, Artifact Registry, bucket

```sh
export P=gen-lang-client-0273003651 R=asia-south1
gcloud config set project $P
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com
gcloud artifacts repositories create live-rate --repository-format=docker --location=$R
gcloud storage buckets create gs://antarixs-live-rate-media --location=$R --uniform-bucket-level-access
```

Firestore: the services use the project's default database. To keep Live Rate's data apart from the Catalogue's, create a named
database and point both services at it (`FIRESTORE_DATABASE` support is a one-line change in `server/store.ts`; ask before splitting).

## 2. Service accounts

```sh
gcloud iam service-accounts create rate-ingest --display-name="Live Rate ingest"
gcloud iam service-accounts create live-rate --display-name="Live Rate app"
for sa in rate-ingest live-rate; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$sa@$P.iam.gserviceaccount.com --role=roles/datastore.user
done
gcloud storage buckets add-iam-policy-binding gs://antarixs-live-rate-media --member=serviceAccount:live-rate@$P.iam.gserviceaccount.com --role=roles/storage.objectAdmin
# after the first deploy of rate-ingest: only live-rate may call it
gcloud run services add-iam-policy-binding rate-ingest --region=$R --member=serviceAccount:live-rate@$P.iam.gserviceaccount.com --role=roles/run.invoker
```

Cloud Build's service account needs `roles/run.admin`, `roles/iam.serviceAccountUser` and `roles/secretmanager.secretAccessor`.

## 3. Secrets

```sh
new() { printf '%s' "$2" | gcloud secrets create $1 --data-file=- ; }
new live-rate-jwt "$(openssl rand -hex 32)"
new live-rate-quote "$(openssl rand -hex 32)"
new live-rate-ingest-token "$(openssl rand -hex 24)"
new live-rate-master "$(openssl rand -hex 24)"      # the operator key for creating stores (keep it out of chat and email)
new live-rate-feed-key "<the provider's API key>"
# whatsapp-token and whatsapp-phone-id: reuse the Catalogue's if the same WhatsApp number signs buyers in
```

WhatsApp templates: `WHATSAPP_OTP_TEMPLATE` (authentication, default `otp`) and, for rate alerts, `WHATSAPP_ALERT_TEMPLATE`
(utility, body `{{1}}: {{2}} is now {{3}}.` = store, what, rate). Without the alert template, alerts still show in the app's Updates.

## 4. The feed

Set these on the Cloud Build trigger (substitutions) once the provider is chosen. Paths are dotted paths into the provider's JSON.

| Substitution | Example | Meaning |
|---|---|---|
| `_FEED_URL` | `https://api.provider.example/v1/rates?symbols=XAU,XAG,USDINR` | one GET that returns all rates |
| `_FEED_KEY_HEADER` | `x-api-key` | header carrying `live-rate-feed-key` |
| `_FEED_GOLD_PATH` / `_FEED_GOLD_UNIT` | `data.gold24` / `g` | 24K 999 gold; unit `g`, `10g` or `oz_usd` |
| `_FEED_SILVER_PATH` / `_FEED_SILVER_UNIT` | `data.silver` / `kg` | silver 999; unit `g`, `kg` or `oz_usd` |
| `_FEED_FX_PATH` | `data.usdinr` | needed when a unit is `oz_usd` |
| `_FEED_INTERVAL_MS` | `1000` | as often as the licence allows |

An `oz_usd` source is converted at the exchange rate only: Indian import duty and GST are not added, so for an international source the
store margins (or a domestic INR source) must cover them.

While the provider is down, an operator can hold a rate by hand (every board then says "Rate set by hand"):

```sh
curl -X PUT https://<any-store>.rates.antarixs.com/api/console/feed/manual -H "X-Master-Key: $MASTER" -H 'Content-Type: application/json' -d '{"on":true,"g":12800,"s":152}'
curl -X PUT .../api/console/feed/manual -H "X-Master-Key: $MASTER" -H 'Content-Type: application/json' -d '{"on":false}'
```

## 5. Addresses: `[store].rates.antarixs.com`

On the existing load balancer (`docs/load-balancer-runbook.md` in the Catalogue repo):

```sh
# a second wildcard certificate (the *.antarixs.com one covers one level only)
gcloud certificate-manager dns-authorizations create rates-dnsauth --domain=rates.antarixs.com
gcloud certificate-manager dns-authorizations describe rates-dnsauth   # add the CNAME it shows in DNS, then:
gcloud certificate-manager certificates create rates-wildcard --domains="*.rates.antarixs.com" --dns-authorizations=rates-dnsauth
gcloud certificate-manager maps entries create rates-wild --map=antarixs-certmap --certificates=rates-wildcard --hostname="*.rates.antarixs.com"

# live-rate behind the same URL map
gcloud compute network-endpoint-groups create live-rate-neg --region=$R --network-endpoint-type=serverless --cloud-run-service=live-rate
gcloud compute backend-services create live-rate-backend --global --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTPS
gcloud compute backend-services add-backend live-rate-backend --global --network-endpoint-group=live-rate-neg --network-endpoint-group-region=$R
gcloud compute backend-services update live-rate-backend --global --timeout=3600   # rate streams stay open
gcloud compute url-maps add-path-matcher antarixs-urlmap --path-matcher-name=rates --default-service=live-rate-backend --new-hosts="*.rates.antarixs.com"
```

DNS: one record, `*.rates` → the load balancer's IP (the same `antarixs-lb-ip`). In the Catalogue repo, reserve `rates` as a store name
so no Catalogue store can take `rates.antarixs.com`.

## 6. Deploy

Connect this repo to Cloud Build (a trigger on pushes to `main`, using `cloudbuild.yaml`, with the `_FEED_*` substitutions). The build
runs typecheck and tests, builds one image and deploys `rate-ingest` then `live-rate`.

## 7. First store

```sh
curl -X POST https://bhakti.rates.antarixs.com/api/console/stores -H "X-Master-Key: $MASTER" -H 'Content-Type: application/json' \
  -d '{"id":"bhakti","name":"Bhakti Jewels","ownerEmail":"owner@example.com","password":"<at least 10 characters>"}'
```

The owner signs in at `https://bhakti.rates.antarixs.com/owner`, sets margins (Rates), opens bookings, adds banners, picks a theme and
copies the shop screen link (Store). Use the same id as the store's Catalogue name.

## Checks after a deploy

* `rate-ingest` logs `rate-ingest started` and no `feed read failed`; its `/health` (through `gcloud run services proxy`) says `live`.
* `live-rate` logs `feed stream connected`; `https://<store>.rates.antarixs.com/health` says `"feed":"live"`.
* Stop rate-ingest for a minute: boards say "Rates paused" within 30 s and come back on their own.
