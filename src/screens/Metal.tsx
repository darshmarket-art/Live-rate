import React, { useEffect, useState } from 'react';
import { inr, rowDef, ROW_IDS, type RowId } from '../../shared/rates';
import { api } from '../api';
import { timeOf, useBoard } from '../live';
import { go } from '../router';
import { changeText } from './Rates';

const RANGES = ['1D', '1W', '1M', '1Y'] as const;
const FROM: Record<(typeof RANGES)[number], string> = { '1D': 'Opening', '1W': '7 days ago', '1M': '30 days ago', '1Y': 'A year ago' };

/** One metal: its live rate, a chart for the period, day figures, and the two things to do next. */
export const Metal: React.FC<{ row: RowId }> = ({ row }) => {
  const id = (ROW_IDS as readonly string[]).includes(row) ? row : 'g24';
  const def = rowDef(id);
  const { board } = useBoard();
  const [range, setRange] = useState<(typeof RANGES)[number]>('1D');
  const [points, setPoints] = useState<Array<{ at: number; v: number }> | null>(null);
  useEffect(() => { setPoints(null); api.history(id, range).then((r) => setPoints(r.points)).catch(() => setPoints([])); }, [id, range]);
  const r = board?.rows.find((x) => x.id === id);
  const vals = points?.map((p) => p.v) ?? [];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(hi - lo, 1);
  const xy = vals.map((v, i) => [Math.round((i / Math.max(vals.length - 1, 1)) * 350), Math.round(170 - ((v - lo) / span) * 160)]);
  const line = xy.map((p) => p.join(',')).join(' ');
  return (
    <>
      <section className="col" style={{ padding: '26px 20px 18px', gap: 8 }}>
        <span className="row sb"><span className="ey">{def.name} · per {def.unit}</span>{board && <span className={`live${board.status === 'live' ? '' : ' off'}`}><i />{timeOf(board.at)}</span>}</span>
        <span className="ser num" style={{ fontSize: 54 }}>{r ? `₹${inr(r.buy)}` : '—'}</span>
        {r && (
          <>
            <span className="row" style={{ gap: 14, fontSize: 13 }}><span className="mut">You buy</span>{!r.fixed && <span className={r.change >= 0 ? 'up' : 'dn'}>{changeText(r.change, r.changePct)}</span>}<span className="mut">today</span></span>
            <span className="row" style={{ gap: 14, fontSize: 13 }}><span className="mut">You sell</span><span className="num">₹{inr(r.sell)}</span></span>
          </>
        )}
      </section>
      <div className="row" role="group" aria-label="Period" style={{ gap: 8, padding: '0 20px 12px' }}>
        {RANGES.map((k) => <button key={k} type="button" className="chip" aria-pressed={range === k} onClick={() => setRange(k)}>{k}</button>)}
      </div>
      <figure style={{ margin: 0, padding: '0 20px' }}>
        {vals.length > 1 ? (
          <svg viewBox="0 0 350 180" width="100%" role="img" aria-label={`${def.name}, ${FROM[range].toLowerCase()} to now: from ₹${inr(vals[0])} to ₹${inr(vals[vals.length - 1])}`} style={{ display: 'block' }}>
            {[45, 90, 135].map((y) => <line key={y} x1="0" y1={y} x2="350" y2={y} stroke="var(--hair)" strokeWidth="1" />)}
            <polygon points={`0,180 ${line} 350,180`} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />
            <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="4" fill="var(--accent)" />
          </svg>
        ) : (
          <p className="empty" style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{points ? 'Not enough history for this period yet.' : 'Loading…'}</p>
        )}
        <div className="row sb mut" style={{ fontSize: 11, paddingTop: 6 }}><span>{FROM[range]}</span><span>Now</span></div>
      </figure>
      {vals.length > 1 && (
        <section className="col" style={{ padding: '18px 20px 0' }}>
          <div className="kv"><span>{range === '1D' ? 'Opening' : 'Then'}</span><span className="num">₹{inr(vals[0])}</span></div>
          <div className="kv"><span>High</span><span className="num">₹{inr(hi)}</span></div>
          <div className="kv"><span>Low</span><span className="num">₹{inr(lo)}</span></div>
        </section>
      )}
      <div className="grow" />
      <div className="row" style={{ gap: 10, padding: '16px 20px', borderTop: '1px solid var(--hair)', marginTop: 16 }}>
        <button type="button" className="btn s" style={{ flex: 1 }} onClick={() => go(`/alerts?row=${id}`)}>Set an alert</button>
        <button type="button" className="btn gold s" style={{ flex: 1.4 }} onClick={() => go(`/book?product=${id === 'ag' ? 'silver' : 'bar'}`)}>Book at this rate</button>
      </div>
    </>
  );
};
