import React, { useEffect, useState } from 'react';
import { checkAccent, contrast, tokensFor, type ThemeId } from '../../shared/themes';
import { api, type ThemeChoice } from '../api';
import { useStore } from '../context';
import { Arrow } from '../icons';
import { themeVars } from '../theme';
import { Title } from './Owner';

/** A small rate board in a theme: what buyers will see. */
const Preview: React.FC<{ id: ThemeId; accent?: string; display: string; big?: boolean; name: string }> = ({ id, accent, display, big, name }) => {
  const t = tokensFor({ id, accent });
  return (
    <div style={{ ...themeVars(t, display), border: `1px solid ${t.hair}` }} aria-hidden="true">
      <div className="row sb" style={{ padding: big ? '12px 14px' : '8px 10px', borderBottom: `1px solid ${t.hair}` }}>
        <span className="ser" style={{ fontSize: big ? 18 : 13, letterSpacing: '.24em', textTransform: 'uppercase' }}>{name}</span>
        <span className="live" style={{ fontSize: big ? 10 : 8 }}><i />Live</span>
      </div>
      {[['Gold 24K', '1,28,450', true], ['Gold 22K', '1,17,650', false], ...(big ? [['Silver', '1,52,800', true]] : [])].map(([n, v, up]) => (
        <div key={String(n)} className="row sb" style={{ padding: big ? '12px 14px' : '7px 10px', borderBottom: `1px solid ${t.hair}` }}>
          <span className="col"><span className="ser" style={{ fontSize: big ? 18 : 13 }}>{n}</span>{big && <span className={up ? 'up' : 'dn'} style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Arrow up={Boolean(up)} />₹350 · 0.27%</span>}</span>
          <span className="num" style={{ fontSize: big ? 17 : 12, fontWeight: 500 }}>₹{v}</span>
        </div>
      ))}
      <div style={{ padding: big ? 14 : 8 }}><span className="btn gold w" style={{ minHeight: big ? 44 : 28, fontSize: big ? 11 : 8 }}>Book at this rate</span></div>
    </div>
  );
};

/** Choose how the buyer app and the shop screen look: a preset, and optionally the store's own accent colour. */
export const Themes: React.FC = () => {
  const { store, reload } = useStore();
  const [themes, setThemes] = useState<ThemeChoice[]>([]);
  const [pick, setPick] = useState<ThemeId>('noir');
  const [accent, setAccent] = useState<string>('');
  const [useAccent, setUseAccent] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.settings().then((s) => {
      setThemes(s.themes); setPick(s.theme.id); setAccent(s.theme.accent ?? ''); setUseAccent(Boolean(s.theme.accent));
      setSaved(JSON.stringify({ id: s.theme.id, accent: s.theme.accent ?? null }));
    }).catch((e) => setError(e.message));
  }, []);
  const def = themes.find((t) => t.id === pick);
  const accentErr = useAccent && accent ? checkAccent(pick, accent) : null;
  const current = JSON.stringify({ id: pick, accent: useAccent && accent ? accent : null });
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.saveTheme({ id: pick, ...(useAccent && accent ? { accent } : {}) }); setSaved(current); await reload(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="col grow">
      <Title ey="Look" title="Theme">The colours of your buyers’ app and your shop screen. This console stays light.</Title>
      <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: '10px 20px 0' }}>
        {themes.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={pick === t.id} aria-pressed={pick === t.id} className="th-card" onClick={() => setPick(t.id)}>
            <Preview id={t.id} display={t.display} name={store.name.split(' ')[0]} />
            <span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 500 }}>{t.name}{pick === t.id && saved.includes(`"${t.id}"`) ? ' · in use' : ''}</b><span className="mut" style={{ fontSize: 12 }}>{t.note}</span></span>
          </button>
        ))}
      </div>

      <section className="col card" style={{ margin: '18px 20px 0', gap: 12 }}>
        <div className="row sb" style={{ gap: 12 }}>
          <span className="col"><span>Your own accent colour</span><span className="mut" style={{ fontSize: 12 }}>For the book button, eyebrows and the selected chip</span></span>
          <button type="button" className="sw" aria-pressed={useAccent} aria-label="Use your own accent colour" onClick={() => setUseAccent(!useAccent)}><i /></button>
        </div>
        {useAccent && (
          <div className="row" style={{ gap: 12 }}>
            <input type="color" aria-label="Accent colour" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : def?.tokens.accent ?? '#c9a961'} onChange={(e) => setAccent(e.target.value)} style={{ width: 52, height: 44, padding: 0, border: '1px solid var(--hair)', background: '#fff' }} />
            <label className="field grow"><span>Hex</span><input className="inp" value={accent} placeholder={def?.tokens.accent} onChange={(e) => setAccent(e.target.value.trim())} /></label>
            {def && /^#[0-9a-f]{6}$/i.test(accent) && <span className="mut num" style={{ fontSize: 12 }}>{contrast(accent, def.tokens.bg).toFixed(1)}:1</span>}
          </div>
        )}
        {accentErr && <p className="err" role="alert">{accentErr}</p>}
      </section>

      {def && (
        <section className="col" style={{ padding: '18px 20px 0', gap: 8 }}>
          <span className="xs mut">What buyers will see</span>
          <Preview id={pick} accent={useAccent && accent && !accentErr ? accent : undefined} display={def.display} big name={store.name.split(' ')[0]} />
        </section>
      )}

      {error && <p className="err" role="alert" style={{ margin: '12px 20px 0' }}>{error}</p>}
      <div className="col" style={{ gap: 8, padding: '14px 20px 18px', marginTop: 12, borderTop: '1px solid var(--hair)' }}>
        <button type="button" className="btn fill w" disabled={busy || current === saved || Boolean(accentErr)} onClick={save}>{busy ? 'Saving…' : current === saved ? 'This theme is live' : 'Use this theme'}</button>
        <span className="mut" style={{ fontSize: 11.5, textAlign: 'center' }}>Buyers see it the next time they open the app; the shop screen within a minute.</span>
      </div>
    </div>
  );
};
