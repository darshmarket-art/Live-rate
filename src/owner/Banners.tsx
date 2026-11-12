import React, { useEffect, useState } from 'react';
import { api, withStore, type OwnerBanner } from '../api';
import { Icon } from '../icons';
import { Title } from './Owner';

const ACTIONS = { book: 'Booking', whatsapp: 'WhatsApp', call: 'Call the store', link: 'A web address', none: 'Nothing' } as const;
type Draft = { eyebrow: string; title: string; line: string; action: keyof typeof ACTIONS; link: string; startsOn: string; endsOn: string; app: boolean; screen: boolean; on: boolean };
const EMPTY: Draft = { eyebrow: '', title: '', line: '', action: 'book', link: '', startsOn: '', endsOn: '', app: true, screen: true, on: true };
const toBody = (d: Draft) => ({ eyebrow: d.eyebrow, title: d.title, line: d.line, action: d.action, ...(d.action === 'link' && d.link ? { link: d.link } : {}), ...(d.startsOn ? { startsOn: d.startsOn } : {}), ...(d.endsOn ? { endsOn: d.endsOn } : {}), app: d.app, screen: d.screen, on: d.on });
const when = (b: OwnerBanner) => (b.startsOn && b.endsOn ? `${b.startsOn} to ${b.endsOn}` : b.startsOn ? `From ${b.startsOn}` : b.endsOn ? `Until ${b.endsOn}` : 'Always');

/** The banner form, for a new banner or an existing one. */
const Form: React.FC<{ init: Draft; photo?: string | null; onSave: (d: Draft, file: File | null) => Promise<void>; onCancel?: () => void; label: string }> = ({ init, photo, onSave, onCancel, label }) => {
  const [d, setD] = useState<Draft>(init);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const field = (k: 'eyebrow' | 'title' | 'line' | 'link', name: string, ph: string, max: number) => (
    <label className="field"><span>{name}</span><input className="inp" value={d[k]} maxLength={max} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <form className="col" style={{ gap: 14 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await onSave(d, file); } catch (x: any) { setError(x.message); } finally { setBusy(false); } }}>
      {field('eyebrow', 'Small line above', 'e.g. In the vault', 40)}
      {field('title', 'Headline', 'e.g. 24K coins and bars, at today’s rate', 70)}
      {field('line', 'Button words or a short line', 'e.g. Book now', 120)}
      <label className="field"><span>Opens</span>
        <select className="inp" value={d.action} onChange={(e) => set('action', e.target.value as Draft['action'])}>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      {d.action === 'link' && field('link', 'Address (https://…)', 'https://', 500)}
      <div className="row" style={{ gap: 10 }}>
        <label className="field grow"><span>From</span><input className="inp" type="date" value={d.startsOn} onChange={(e) => set('startsOn', e.target.value)} /></label>
        <label className="field grow"><span>Until</span><input className="inp" type="date" value={d.endsOn} onChange={(e) => set('endsOn', e.target.value)} /></label>
      </div>
      <div className="row" role="group" aria-label="Shown on" style={{ gap: 8 }}>
        <button type="button" className="chip" aria-pressed={d.app} onClick={() => set('app', !d.app)}>App</button>
        <button type="button" className="chip" aria-pressed={d.screen} onClick={() => set('screen', !d.screen)}>Shop screen</button>
      </div>
      <label className="btn w" style={{ cursor: 'pointer' }}>{file ? file.name : photo ? 'Replace the photo' : 'Choose a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <span className="mut" style={{ fontSize: 12 }}>Best sizes: 1200 × 500 for the app, 1080 × 1080 for the shop screen. A banner shows once it has a photo.</span>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row" style={{ gap: 10 }}>
        {onCancel && <button type="button" className="btn s" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn fill s" style={{ flex: 2 }} disabled={busy || d.title.trim().length < 2}>{busy ? 'Saving…' : label}</button>
      </div>
    </form>
  );
};

/** Advertising banners: above the rates in the app, beside them on the shop screen; they take turns in this order. */
export const Banners: React.FC = () => {
  const [list, setList] = useState<OwnerBanner[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.banners().then((r) => setList(r.banners)).catch((e) => setError(e.message)); }, []);
  const replace = (b: OwnerBanner) => setList((l) => l!.map((x) => (x.id === b.id ? b : x)));
  const draftOf = (b: OwnerBanner): Draft => ({ eyebrow: b.eyebrow, title: b.title, line: b.line, action: b.action, link: b.link ?? '', startsOn: b.startsOn ?? '', endsOn: b.endsOn ?? '', app: b.app, screen: b.screen, on: b.on });
  const flip = async (b: OwnerBanner, k: 'on' | 'app' | 'screen') => {
    try { replace((await api.saveBanner(b.id, toBody({ ...draftOf(b), [k]: !b[k] }))).banner); } catch (e: any) { setError(e.message); }
  };
  const move = async (i: number, d: number) => {
    const ids = list!.map((b) => b.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { setList((await api.orderBanners(ids)).banners); } catch (e: any) { setError(e.message); }
  };
  const remove = async (b: OwnerBanner) => {
    if (!confirm(`Remove “${b.title}”?`)) return;
    try { await api.removeBanner(b.id); setList((l) => l!.filter((x) => x.id !== b.id)); } catch (e: any) { setError(e.message); }
  };
  return (
    <div className="col grow">
      <Title ey="Advertising" title="Banners">Shown above the rates in your app and beside them on your shop screen. They take turns every few seconds, in this order.</Title>
      {error && <p className="err" role="alert" style={{ margin: '0 20px' }}>{error}</p>}
      <section className="col" style={{ padding: '12px 20px 0', gap: 12 }}>
        {list?.length === 0 && !adding && <p className="mut">No banners yet. Add one below.</p>}
        {list?.map((b, i) => (
          <article key={b.id} className="card col" style={{ gap: 12, opacity: b.on ? 1 : 0.6 }}>
            {editing === b.id ? (
              <Form init={draftOf(b)} photo={b.photoUrl} label="Save banner" onCancel={() => setEditing(null)} onSave={async (d, file) => { let nb = (await api.saveBanner(b.id, toBody(d))).banner; if (file) nb = (await api.bannerPhoto(b.id, file)).banner; replace(nb); setEditing(null); }} />
            ) : (
              <>
                <div className="row" style={{ gap: 12 }}>
                  <span style={{ width: 96, height: 64, flex: 'none', background: 'var(--bg3)', overflow: 'hidden' }}>{b.photoUrl ? <img src={withStore(b.photoUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="mut row" style={{ height: '100%', justifyContent: 'center', fontSize: 11 }}>No photo</span>}</span>
                  <span className="col grow" style={{ gap: 2 }}>
                    <span className="ser" style={{ fontSize: 19 }}>{b.title}</span>
                    <span className="mut" style={{ fontSize: 12 }}>Opens: {ACTIONS[b.action]}</span>
                    <span className="mut" style={{ fontSize: 12 }}>{when(b)}</span>
                  </span>
                  <button type="button" className="sw" aria-pressed={b.on} aria-label={`${b.on ? 'Hide' : 'Show'} ${b.title}`} onClick={() => flip(b, 'on')}><i /></button>
                </div>
                <div className="row sb" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <div className="row" role="group" aria-label="Shown on" style={{ gap: 6 }}>
                    <button type="button" className="chip" aria-pressed={b.app} onClick={() => flip(b, 'app')} style={{ minHeight: 36, padding: '0 10px', fontSize: 10 }}>App</button>
                    <button type="button" className="chip" aria-pressed={b.screen} onClick={() => flip(b, 'screen')} style={{ minHeight: 36, padding: '0 10px', fontSize: 10 }}>Shop screen</button>
                  </div>
                  <div className="row">
                    <button type="button" className="ic" aria-label={`Edit ${b.title}`} onClick={() => setEditing(b.id)} style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', width: 'auto', padding: '0 8px' }}>Edit</button>
                    <button type="button" className="ic" aria-label={`Move ${b.title} earlier`} disabled={i === 0} onClick={() => move(i, -1)}><Icon n="up" /></button>
                    <button type="button" className="ic" aria-label={`Move ${b.title} later`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon n="down" /></button>
                    <button type="button" className="ic" aria-label={`Remove ${b.title}`} onClick={() => remove(b)}><Icon n="x" /></button>
                  </div>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
      <section className="col" style={{ margin: '16px 20px 20px', padding: 18, gap: 14, border: '1px dashed var(--mut)' }}>
        {adding ? (
          <>
            <span className="ser" style={{ fontSize: 22 }}>Add a banner</span>
            <Form init={EMPTY} label="Add banner" onCancel={() => setAdding(false)} onSave={async (d, file) => { let b = (await api.addBanner(toBody(d))).banner; if (file) b = (await api.bannerPhoto(b.id, file)).banner; setList((l) => [...(l ?? []), b]); setAdding(false); }} />
          </>
        ) : (
          <button type="button" className="btn w" onClick={() => setAdding(true)}>Add a banner</button>
        )}
      </section>
    </div>
  );
};
