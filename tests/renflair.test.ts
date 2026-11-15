import { describe, expect, it } from 'vitest';
import { sendRenflair } from '../server/whatsapp';

const c = { apiKey: 'SECRETKEY', baseUrl: 'https://gw.test' };

describe('Renflair sign-in codes', () => {
  it('sends the national number, country and our code', async () => {
    let url = '';
    await sendRenflair(c, '919876543210', '123456', (async (u: string) => { url = u; return new Response('{"status":"success"}'); }) as any);
    const q = new URL(url).searchParams;
    expect([q.get('PHONE'), q.get('COUNTRY'), q.get('OTP'), q.get('API')]).toEqual(['9876543210', '91', '123456', 'SECRETKEY']);
  });

  it('fails on a refusal without leaking the key', async () => {
    const err = await sendRenflair(c, '919876543210', '123456', (async () => new Response('{"status":"failed","message":"bad key SECRETKEY"}')) as any).catch((e) => e);
    expect(String(err)).toContain('[key]');
    expect(String(err)).not.toContain('SECRETKEY');
  });
});
