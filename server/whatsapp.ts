import type { Config } from './config';
import { HttpError } from './http';
import { logger } from './logger';

type Wa = NonNullable<Config['whatsapp']>;

/** Meta WhatsApp Cloud API: one approved template message. Throws on any non-2xx answer. */
export async function sendTemplate(c: Wa, to: string, template: string, components: unknown[], fetchFn: typeof fetch = fetch) {
  const res = await fetchFn(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: template, language: { code: c.language }, components } }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) throw new Error(`WhatsApp answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Renflair WhatsApp OTP gateway, as in the Catalogue: GET {base}/V1.php?API=&PHONE=&OTP=&COUNTRY=; the gateway writes the message.
 * The key is in the query string (their design), so the URL is never logged and the key is scrubbed from errors.
 */
export async function sendRenflair(c: { apiKey: string; baseUrl: string }, phone: string, code: string, fetchFn: typeof fetch = fetch) {
  const q = new URLSearchParams({ API: c.apiKey, PHONE: phone.slice(-10), OTP: code, COUNTRY: phone.slice(0, -10) || '91' });
  const res = await fetchFn(`${c.baseUrl}/V1.php?${q}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  const text = await res.text().catch(() => '');
  let body: any = {};
  try { body = JSON.parse(text); } catch { /* not JSON: judged on the status alone */ }
  const status = String(body?.status ?? '').toLowerCase();
  if (res.ok && body?.success !== false && body?.error == null && !['false', 'failed', 'fail', 'error'].includes(status)) return;
  throw new Error(`Renflair answered ${res.status}: ${String(body?.message ?? body?.msg ?? body?.error ?? text).slice(0, 200)}`.replaceAll(c.apiKey, '[key]'));
}

export interface Messenger {
  /** The sign-in code (an authentication template with a copy-code button). */
  sendCode(phone: string, code: string): Promise<void>;
  /** A rate alert (the WHATSAPP_ALERT_TEMPLATE, body: store, what, rate). Without that template it is only logged. */
  sendAlert(phone: string, store: string, what: string, rate: string): Promise<void>;
}

export function createMessenger(config: Config): Messenger {
  const wa = config.whatsapp;
  return {
    async sendCode(phone, code) {
      if (config.renflair) {
        await sendRenflair(config.renflair, phone, code).catch((e) => {
          logger.error('sign-in code send failed', { phone: `…${phone.slice(-4)}`, error: String(e?.message ?? e) });
          throw new HttpError(503, 'Could not send the code on WhatsApp. Try again shortly.');
        });
        return;
      }
      if (!wa) {
        // never write a real code to the logs: without WhatsApp a production deployment cannot sign buyers in, and says so
        if (config.production) throw new HttpError(503, 'Sign-in by WhatsApp is not set up for this store yet.');
        logger.info('[dev] sign-in code', { phone: `…${phone.slice(-4)}`, code: config.otpStaticCode ? 'the static code' : code });
        return;
      }
      await sendTemplate(wa, phone, wa.template, [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }
      ]);
    },
    async sendAlert(phone, store, what, rate) {
      if (!wa?.alertTemplate) {
        logger.info('rate alert (no WhatsApp alert template set)', { phone: `…${phone.slice(-4)}`, what, rate });
        return;
      }
      await sendTemplate(wa, phone, wa.alertTemplate, [{ type: 'body', parameters: [store, what, rate].map((text) => ({ type: 'text', text })) }]);
    }
  };
}
