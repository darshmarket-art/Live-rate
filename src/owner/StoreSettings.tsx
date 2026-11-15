import React, { useEffect, useState } from 'react';
import { api, type Profile } from '../api';
import { useStore } from '../context';
import { Title } from './Owner';

/** The store's details buyers see, the shop screen's link, and signing out. */
export const StoreSettings: React.FC = () => {
  const { store, reload, signOut } = useStore();
  const [p, setP] = useState<Profile | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.settings().then((s) => setP(s.profile)).catch((e) => setError(e.message));
    api.screenKey().then((r) => setKey(r.key)).catch(() => {});
  }, []);
  if (!p) return <p className="empty">{error ?? 'Loading…'}</p>;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });
  const f = (k: Exclude<keyof Profile, 'ratesPublic'>, label: string, ph = '', max = 120) => (
    <label className="field"><span>{label}</span><input className="inp" value={p[k]} maxLength={max} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const screenUrl = key ? `${location.origin}/screen?key=${encodeURIComponent(key)}${location.hostname.includes('.rates.') ? '' : `&store=${encodeURIComponent(store.id)}`}` : '';
  return (
    <div className="col grow">
      <Title ey="Your store" title="Details" />
      <form className="col" style={{ gap: 14, padding: '6px 20px 0' }} onSubmit={async (e) => { e.preventDefault(); setError(null); setMsg(null); try { await api.saveProfile(p); await reload(); setMsg('Saved.'); } catch (x: any) { setError(x.message); } }}>
        {f('name', 'Store name', '', 60)}
        {f('tagline', 'A line under the name', 'e.g. Bullion and fine jewellery since 1962', 80)}
        {f('city', 'City', '', 60)}
        {f('address', 'Address', '', 200)}
        {f('phone', 'Phone', '+91 …', 20)}
        {f('whatsapp', 'WhatsApp (country code and number, digits only)', '919876543210', 15)}
        {f('notice', 'Notice (scrolls above the rates and on the shop screen; empty to hide)', 'e.g. No making charges on coins till 20 Nov · Open 10 am to 9 pm', 300)}
        {f('taxNote', 'Note under the rates', 'e.g. GST extra')}
        {f('payTerms', 'Payment terms (shown before booking)', 'e.g. Pay within 24 hours', 160)}
        {f('pickup', 'Collection', 'e.g. From the store, Mon to Sat 11 to 7')}
        <div className="row sb" style={{ gap: 12 }}>
          <span className="col"><span>Rates without signing in</span><span className="mut" style={{ fontSize: 12 }}>Booking and alerts always need sign-in</span></span>
          <button type="button" className="sw" aria-pressed={p.ratesPublic} aria-label="Rates without signing in" onClick={() => set('ratesPublic', !p.ratesPublic)}><i /></button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <button type="submit" className="btn fill w">Save details</button>
      </form>

      <section className="col card" style={{ margin: '24px 20px 0', gap: 10 }}>
        <span className="ser" style={{ fontSize: 22 }}>Shop screen</span>
        <p className="mut" style={{ fontSize: 13 }}>Open this link on the TV in your shop (full screen). It shows your rates and banners and needs no sign-in, so keep it private. Make a new link to stop old screens.</p>
        {key && <input className="inp" readOnly value={screenUrl} aria-label="Shop screen link" onFocus={(e) => e.target.select()} style={{ fontSize: 12 }} />}
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn s" style={{ flex: 1 }} onClick={async () => { try { await navigator.clipboard.writeText(screenUrl); setMsg('Screen link copied.'); } catch { setMsg('Select the link and copy it.'); } }}>Copy link</button>
          <a className="btn s" style={{ flex: 1 }} href={screenUrl} target="_blank" rel="noopener noreferrer">Open</a>
          <button type="button" className="btn s" style={{ flex: 1 }} onClick={async () => { if (confirm('Make a new link? Screens using the old one stop at once.')) setKey((await api.rotateScreenKey()).key); }}>New link</button>
        </div>
      </section>
      <div style={{ padding: 20 }}><button type="button" className="btn w" onClick={signOut}>Sign out</button></div>
    </div>
  );
};
