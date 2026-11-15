import crypto from 'crypto';

/**
 * Everything the two services read from the environment. One image runs either role:
 *   ROLE=ingest  rate-ingest: the only caller of the licensed feed; streams ticks to live-rate, saves snapshots and history, checks alerts.
 *   ROLE=live    live-rate: every store's API, app and shop screen; one stream from ingest, margins added in memory.
 *   ROLE=both    both in one process (local development and tests).
 */
export type Role = 'ingest' | 'live' | 'both';

export interface FeedConfig {
  /** 'http' (the licensed provider), 'sample' (development only: a random walk, marked as sample everywhere), 'none'. */
  provider: 'http' | 'sample' | 'none';
  intervalMs: number;
  url?: string;
  keyHeader?: string;
  key?: string;
  /** Dotted paths into the provider's JSON, and the unit each is in. */
  goldPath?: string;
  goldUnit: 'g' | '10g' | 'oz_usd';
  silverPath?: string;
  silverUnit: 'g' | 'kg' | 'oz_usd';
  fxPath?: string;
  usdOzPath?: string;
  /** COMEX silver (USD/oz). */
  comexSilverPath?: string;
  /** MCX futures as "CONTRACT=path" lists, nearest first: gold INR per 10 g, silver INR per kg. With them, rates follow MCX. */
  mcxGold?: string;
  mcxSilver?: string;
  /** A tick that moves more than this fraction from the last is held back until the next one agrees. */
  spikeFraction: number;
}

export interface Config {
  role: Role;
  port: number;
  production: boolean;
  storeKind: string;
  dataFile: string;
  /** antarixs.com: stores answer at <store>.rates.<baseDomain>. */
  baseDomain: string;
  jwtSecret: string;
  /** Signs held booking quotes. */
  quoteSecret: string;
  /** The operator console's key (creating stores). */
  masterKey?: string;
  /** live-rate -> ingest. On Cloud Run the call carries an ID token too (ingest runs without public access). */
  ingestUrl?: string;
  ingestToken?: string;
  bucket?: string;
  otpStaticCode?: string;
  /** Renflair WhatsApp OTP gateway (the Catalogue's sender): sign-in codes only. Wins over Meta for codes when set. */
  renflair?: { apiKey: string; baseUrl: string };
  whatsapp?: { token: string; phoneNumberId: string; template: string; language: string; apiVersion: string; alertTemplate?: string };
  feed: FeedConfig;
  staleMs: number;
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const role = (['ingest', 'live', 'both'].includes(env.ROLE ?? '') ? env.ROLE : 'both') as Role;
  const secret = (name: string) => {
    const v = env[name];
    if (v && v.length >= 32) return v;
    if (production) throw new Error(`${name} must be set (32+ characters) in production.`);
    return v || crypto.randomBytes(32).toString('hex');
  };
  const provider = (['http', 'sample', 'none'].includes(env.FEED_PROVIDER ?? '') ? env.FEED_PROVIDER : production ? 'none' : 'sample') as FeedConfig['provider'];
  if (production && provider === 'sample' && env.ALLOW_SAMPLE_FEED !== 'true') throw new Error('FEED_PROVIDER=sample is for development: it shows made-up rates. Set ALLOW_SAMPLE_FEED=true only on a test deployment.');
  if (production && env.OTP_STATIC_CODE) throw new Error('OTP_STATIC_CODE must not be set in production.');
  const wa = env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
    ? { token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, template: env.WHATSAPP_OTP_TEMPLATE || 'otp', language: env.WHATSAPP_LANGUAGE || 'en', apiVersion: env.WHATSAPP_API_VERSION || 'v21.0', alertTemplate: env.WHATSAPP_ALERT_TEMPLATE || undefined }
    : undefined;
  return {
    role,
    port: num(env.PORT, 8080),
    production,
    storeKind: env.STORE || (production ? 'firestore' : 'file'),
    dataFile: env.DATA_FILE || 'data/local-db.json',
    baseDomain: (env.BASE_DOMAIN || 'antarixs.com').toLowerCase(),
    jwtSecret: secret('JWT_SECRET'),
    quoteSecret: env.QUOTE_SECRET && env.QUOTE_SECRET.length >= 32 ? env.QUOTE_SECRET : secret('JWT_SECRET') + ':quote',
    masterKey: env.MASTER_KEY && env.MASTER_KEY.length >= 24 ? env.MASTER_KEY : undefined,
    ingestUrl: env.INGEST_URL?.replace(/\/$/, ''),
    ingestToken: env.INGEST_TOKEN || undefined,
    bucket: env.BUCKET || undefined,
    otpStaticCode: env.OTP_STATIC_CODE || undefined,
    renflair: env.RENFLAIR_API_KEY?.trim() ? { apiKey: env.RENFLAIR_API_KEY.trim(), baseUrl: (env.RENFLAIR_BASE_URL?.trim() || 'https://whatsapp.renflair.in').replace(/\/+$/, '') } : undefined,
    whatsapp: wa,
    staleMs: num(env.STALE_MS, 30_000),
    feed: {
      provider,
      intervalMs: Math.max(250, num(env.FEED_INTERVAL_MS, 1000)),
      url: env.FEED_URL,
      keyHeader: env.FEED_KEY_HEADER || 'x-api-key',
      key: env.FEED_KEY,
      goldPath: env.FEED_GOLD_PATH,
      goldUnit: (['g', '10g', 'oz_usd'].includes(env.FEED_GOLD_UNIT ?? '') ? env.FEED_GOLD_UNIT : 'g') as FeedConfig['goldUnit'],
      silverPath: env.FEED_SILVER_PATH,
      silverUnit: (['g', 'kg', 'oz_usd'].includes(env.FEED_SILVER_UNIT ?? '') ? env.FEED_SILVER_UNIT : 'kg') as FeedConfig['silverUnit'],
      fxPath: env.FEED_FX_PATH,
      usdOzPath: env.FEED_USD_OZ_PATH,
      comexSilverPath: env.FEED_COMEX_SILVER_PATH,
      mcxGold: env.FEED_MCX_GOLD,
      mcxSilver: env.FEED_MCX_SILVER,
      spikeFraction: num(env.FEED_SPIKE_FRACTION, 0.03)
    }
  };
}
