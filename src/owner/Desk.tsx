import React, { useEffect, useState } from 'react';
import { ROWS, inr, roundTo, rowDef, type Desk as DeskT, type RowId } from '../../shared/rates';
import { api } from '../api';
import { timeOf } from '../live';
import { Title } from './Owner';

type Feed = Awaited<ReturnType<typeof api.feed>>['feed'];

/** The rate desk: the feed's rate, the store's margin on each row, the rate buyers will see, and whether bookings are open. */
export const Desk: React.FC = () => {
  const [desk, setDesk] = useState<DeskT | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [feed, setFeed] = useState<Feed>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.settings().then((s) => { setDesk(s.desk); setSaved(JSON.stringify(s.desk)); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const get = () => api.feed().then((r) => setFeed(r.feed)).catch(() => {});
    void get();
    const t = setInterval(get, 2000);
    return () => clearInterval(t);
  }, []);
  if (!desk) return <p className="empty">{error ?? 'Loading…'}</p>;

  const dirty = JSON.stringify(desk) !== saved;
  const setMargin = (id: RowId, side: 'buy' | 'sell', d: number) => setDesk({ ...desk, margins: { ...desk.margins, [id]: { ...desk.margins[id], [side]: Math.max(0, desk.margins[id][side] + d) } } });
  const toggleRow = (id: RowId) => setDesk({ ...desk, rows: desk.rows.includes(id) ? (desk.rows.length > 1 ? desk.rows.filter((r) => r !== id) : desk.rows) : ROWS.map((r) => r.id).filter((r) => r === id || desk.rows.includes(r)) });
  const setFixed = (id: RowId, v: string) => {
    const n = Number(v.replace(/\D/g, ''));
    const fixed = { ...desk.fixed };
    if (n) fixed[id] = n; else delete fixed[id];
    setDesk({ ...desk, fixed });
  };
  const publish = async () => {
    setBusy(true); setError(null);
    try { const r = await api.saveDesk(desk); setDesk(r.desk); setSaved(JSON.stringify(r.desk)); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="col grow">
      <Title ey="Rate desk" title="Your rates" />
      <section className="feedbar" style={{ margin: '8px 20px 0' }}>
        <span className="live" style={{ fontSize: 10 }}><i />{feed?.status === 'live' ? 'Feed live' : 'Feed paused'}</span>
        <span className="grow" style={{ fontSize: 12, color: '#aaa397' }}>{feed ? `Antarixs feed · last tick ${timeOf(feed.at)}` : 'Waiting for the first tick'}</span>
        {feed?.sample && <span className="xs" style={{ fontSize: 10, color: '#c9a961' }}>Sample</span>}
      </section>

      <section className="row sb" style={{ margin: '16px 20px 0', gap: 12 }}>
        <span className="col" style={{ gap: 2 }}><span>Bookings open</span><span className="mut" style={{ fontSize: 12 }}>{desk.bookingsOpen ? 'Buyers can book at the live rate' : 'Rates still show; booking is paused'}</span></span>
        <button type="button" className="sw" aria-pressed={desk.bookingsOpen} aria-label="Bookings open" onClick={() => setDesk({ ...desk, bookingsOpen: !desk.bookingsOpen })}><i /></button>
      </section>

      <section className="col" style={{ padding: '18px 20px 0', gap: 12 }}>
        <span className="row sb"><span className="xs mut">Your margin on the feed</span><span className="xs mut">Buyers see</span></span>
        {ROWS.map((row) => {
          const id = row.id;
          const on = desk.rows.includes(id);
          const base = feed?.base[id];
          const m = desk.margins[id];
          const step = id === 'ag' ? 100 : 50;
          const fixed = desk.fixed[id];
          const buy = fixed ?? (base !== undefined ? roundTo(base + m.buy, desk.round) : undefined);
          const sell = base !== undefined || fixed ? roundTo((fixed !== undefined ? fixed - m.buy : base!) - m.sell, desk.round) : undefined;
          return (
            <article key={id} className="card col" style={{ gap: 12, opacity: on ? 1 : 0.6 }}>
              <div className="row sb" style={{ alignItems: 'baseline', gap: 10 }}>
                <span className="ser" style={{ fontSize: 21 }}>{row.name.replace('Gold ', '')}</span>
                <span className="mut" style={{ fontSize: 12 }}>{base !== undefined ? `Feed ₹${inr(base)} / ${rowDef(id).unit}` : ''}</span>
                <button type="button" className="sw" aria-pressed={on} aria-label={`Show ${row.name}`} onClick={() => toggleRow(id)}><i /></button>
              </div>
              {(['buy', 'sell'] as const).map((side) => (
                <div key={side} className="row sb" style={{ gap: 8 }}>
                  <span className="col" style={{ gap: 4 }}>
                    <span className="xs mut" style={{ fontSize: 10 }}>{side === 'buy' ? 'They buy · +' : 'They sell · −'}</span>
                    <span className="step">
                      <button type="button" aria-label={`Lower the ${row.name} ${side} margin`} onClick={() => setMargin(id, side, -step)}>−</button>
                      <span className="num" style={{ minWidth: 64 }}>₹{inr(m[side])}</span>
                      <button type="button" aria-label={`Raise the ${row.name} ${side} margin`} onClick={() => setMargin(id, side, step)}>+</button>
                    </span>
                  </span>
                  <span className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
                    <span className="xs mut" style={{ fontSize: 10 }}>Shown</span>
                    <span className="num" style={{ fontSize: 18, fontWeight: 500, minHeight: 44, display: 'flex', alignItems: 'center' }}>{side === 'buy' ? (buy !== undefined ? `₹${inr(buy)}` : '—') : sell !== undefined ? `₹${inr(sell)}` : '—'}</span>
                  </span>
                </div>
              ))}
              <label className="field"><span>Hold a fixed rate (they buy, per {rowDef(id).unit})</span><input className="inp num" inputMode="numeric" placeholder="Off: follow the feed" value={fixed ? inr(fixed) : ''} onChange={(e) => setFixed(id, e.target.value)} /></label>
            </article>
          );
        })}
      </section>

      <section className="col" style={{ padding: '18px 20px 0' }}>
        <div className="kv"><span>Round to</span>
          <select aria-label="Round shown rates to" value={desk.round} onChange={(e) => setDesk({ ...desk, round: Number(e.target.value) as DeskT['round'] })} style={{ background: 'none', border: 0, borderBottom: '1px solid var(--ink)', minHeight: 36 }}>
            {[1, 5, 10, 50, 100].map((n) => <option key={n} value={n}>Nearest ₹{n}</option>)}
          </select>
        </div>
        <div className="kv"><span>24K coins</span>
          <span className="row" style={{ gap: 8 }}>₹<input className="inp num" style={{ width: 90, minHeight: 36 }} inputMode="decimal" aria-label="Extra per gram on 24K coins" value={desk.coinPremium} onChange={(e) => setDesk({ ...desk, coinPremium: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} /> a gram over bars</span>
        </div>
        <div className="kv" style={{ borderBottom: 0 }}><span>If the feed stops</span><span style={{ textAlign: 'right' }}>“Rates paused” after 30 s; bookings stop</span></div>
      </section>

      {error && <p className="err" role="alert" style={{ margin: '12px 20px 0' }}>{error}</p>}
      <div className="col" style={{ gap: 8, padding: '14px 20px 18px', marginTop: 12, borderTop: '1px solid var(--hair)' }}>
        <button type="button" className="btn fill w" disabled={!dirty || busy} onClick={publish}>{busy ? 'Publishing…' : dirty ? 'Publish new rates' : 'Rates are live'}</button>
        <span className="mut" style={{ fontSize: 11.5, textAlign: 'center' }}>Changes reach every buyer’s app and your shop screen on the next tick.</span>
      </div>
    </div>
  );
};
