import React, { useEffect, useState } from 'react';
import { inr } from '../../shared/rates';
import { api, withStore, type Banner } from '../api';
import { Arrow } from '../icons';
import { useBoard } from '../live';
import { applyTheme } from '../theme';

/** The shop TV: large live rates on the left, the store's banners full height on the right. Opened with the owner's screen link. */
export const Screen: React.FC = () => {
  const key = new URLSearchParams(location.search).get('key') ?? '';
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.screen>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ad, setAd] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { board, flash } = useBoard(`/api/screen/stream?key=${encodeURIComponent(key)}`, Boolean(info));
  useEffect(() => {
    const load = () => api.screen(key).then((r) => { setInfo(r); applyTheme(r.theme.tokens, r.theme.display); setError(null); }).catch((e) => setError(e.message));
    void load();
    const t = setInterval(load, 60_000); // banners and theme changes reach the screen within a minute
    return () => clearInterval(t);
  }, [key]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const banners: Banner[] = info?.banners ?? [];
  useEffect(() => { if (banners.length < 2) return; const t = setInterval(() => setAd((n) => (n + 1) % banners.length), 7000); return () => clearInterval(t); }, [banners.length]);
  if (error) return <div className="tv" style={{ alignItems: 'center', justifyContent: 'center', fontSize: 28 }}><p role="alert">{error}</p></div>;
  if (!info) return <div className="tv" aria-busy="true" />;
  const b = board ?? info.board;
  const live = b.status === 'live';
  const vw = (n: number) => `${(n / 1920) * 100}vw`;
  return (
    <div className="tv">
      <main className="tv-main" style={{ width: banners.length ? '62.5%' : '100%' }}>
        <header className="row sb" style={{ paddingBottom: vw(36), borderBottom: '1px solid var(--hair)' }}>
          <span className="row" style={{ gap: vw(22) }}>
            <span className="mark ser" style={{ width: vw(64), height: vw(64), fontSize: vw(38) }}>{info.store.name.trim().charAt(0).toUpperCase()}</span>
            <span className="col" style={{ gap: 4 }}><span className="ser" style={{ fontSize: vw(44), letterSpacing: '.3em', textTransform: 'uppercase' }}>{info.store.name}</span><span className="ey" style={{ fontSize: vw(14) }}>Today’s rates</span></span>
          </span>
          <span className="col" style={{ alignItems: 'flex-end', gap: vw(8) }}>
            <span className={`live${live ? '' : ' off'}`} style={{ fontSize: vw(16) }}><i style={{ width: vw(10), height: vw(10) }} />{live ? 'Live' : 'Rates paused'}</span>
            <span className="num" style={{ fontSize: vw(30) }}>{new Date(now).toLocaleTimeString('en-IN', { hour12: false })}</span>
            <span className="mut" style={{ fontSize: vw(16) }}>{new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </span>
        </header>
        <div className="tv-grid" style={{ padding: `${vw(26)} 0 ${vw(14)}`, fontSize: vw(15), fontWeight: 500, letterSpacing: '.24em', textTransform: 'uppercase', color: 'var(--mut)' }}>
          <span>Per 10 g · silver per kg</span><span style={{ textAlign: 'right' }}>You buy</span><span style={{ textAlign: 'right' }}>You sell</span>
        </div>
        {b.rows.map((r) => (
          <div key={r.id} className={`tv-grid rrow${flash[r.id] ? ` f-${flash[r.id]}` : ''}`} style={{ minHeight: vw(150), padding: 0, borderTop: '1px solid var(--hair)', borderBottom: 0, cursor: 'default' }}>
            <span className="col" style={{ gap: vw(6) }}>
              <span className="ser" style={{ fontSize: vw(50) }}>{r.name}</span>
              {!r.fixed && <span className={`chg ${r.change > 0 ? 'up' : r.change < 0 ? 'dn' : 'mut'}`} style={{ fontSize: vw(20) }}>{r.change !== 0 && <Arrow up={r.change > 0} size={16} />}{`${r.change >= 0 ? '+' : '−'}₹${inr(Math.abs(r.change))} today`}</span>}
            </span>
            <span className="rate num" style={{ fontSize: vw(56) }}>₹{inr(r.buy)}</span>
            <span className="rate num" style={{ fontSize: vw(56) }}>₹{inr(r.sell)}</span>
          </div>
        ))}
        <div className="grow" />
        <footer className="row sb" style={{ height: vw(96), borderTop: '1px solid var(--hair)', fontSize: vw(18), color: 'var(--mut)' }}>
          <span>{[info.store.address, info.store.phone].filter(Boolean).join(' · ')}</span>
          <span>{[info.store.taxNote, b.sample ? 'Sample feed, not market rates' : ''].filter(Boolean).join(' · ')}</span>
        </footer>
      </main>
      {banners.length > 0 && (
        <aside className="tv-side" aria-roledescription="carousel" aria-label="From the store">
          {banners.map((x, i) => (
            <div key={x.id} className={`tv-ad${i === ad ? ' on' : ''}`} aria-hidden={i !== ad}>
              {x.photo && <img src={withStore(x.photo)} alt="" />}
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,9,8,.92), rgba(10,9,8,.15) 55%, rgba(10,9,8,0))' }} />
              <span className="col" style={{ position: 'absolute', left: vw(64), right: vw(64), bottom: vw(120), gap: vw(16), color: '#f3eee4' }}>
                {x.eyebrow && <span className="ey" style={{ fontSize: vw(16), color: '#e3cf9f' }}>{x.eyebrow}</span>}
                <span className="ser" style={{ fontSize: vw(72), lineHeight: 1 }}>{x.title}</span>
                {x.line && <span style={{ fontSize: vw(22), color: '#d8d1c4' }}>{x.line}</span>}
              </span>
            </div>
          ))}
          <div className="row" style={{ position: 'absolute', left: vw(64), bottom: vw(64), gap: vw(10) }} aria-hidden="true">
            {banners.map((x, i) => <span key={x.id} style={{ display: 'block', height: 3, width: i === ad ? vw(56) : vw(24), background: i === ad ? '#f3eee4' : 'rgba(243,238,228,.4)', transition: 'width .6s ease' }} />)}
          </div>
        </aside>
      )}
    </div>
  );
};
