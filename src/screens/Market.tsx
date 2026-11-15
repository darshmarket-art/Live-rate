import React, { useEffect, useRef, useState } from 'react';
import { inr, type Board, type MktId, type MktQuote } from '../../shared/rates';
import { Arrow } from '../icons';

/** The owner's notice, scrolling in a thin band. Two copies side by side make the loop seamless; still under reduced motion. */
export const Ticker: React.FC<{ text: string }> = ({ text }) => {
  if (!text.trim()) return null;
  // ~70 px a second whatever the length, so a long notice is as readable as a short one
  const secs = Math.max(12, Math.round((text.length * 8 + 120) / 70));
  return (
    <div className="tick" role="marquee" aria-label={`Notice: ${text}`}>
      <div className="tick-in" style={{ animationDuration: `${secs}s` }} aria-hidden="true">
        <span>{text}</span><span>{text}</span>
      </div>
    </div>
  );
};

/** Which prices just moved and which way, cleared after a moment (the same glow as the rate rows). */
function useFlash(values: Record<string, number | undefined>) {
  const prev = useRef<Record<string, number | undefined>>({});
  const [flash, setFlash] = useState<Record<string, 'up' | 'dn'>>({});
  const key = JSON.stringify(values);
  useEffect(() => {
    const before = prev.current;
    prev.current = values;
    const f: Record<string, 'up' | 'dn'> = {};
    for (const [k, b] of Object.entries(values)) { const a = before[k]; if (a !== undefined && b !== undefined && a !== b) f[k] = b > a ? 'up' : 'dn'; }
    if (!Object.keys(f).length) return;
    setFlash(f);
    const t = setTimeout(() => setFlash({}), 650);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return flash;
}

const usd1 = (n: number) => `$${inr(n, 1)}`;
const fmt: Record<MktId, (n: number) => string> = { comexG: usd1, comexS: (n) => `$${inr(n, 2)}`, fx: (n) => `₹${inr(n, 2)}` };
const rupees = (n: number) => `₹${inr(n)}`;

const Chg: React.FC<{ q: MktQuote; f: (n: number) => string }> = ({ q, f }) => {
  const d = q.v - q.o;
  const pct = q.o ? (d / q.o) * 100 : 0;
  return <span className={`chg ${d > 0 ? 'up' : d < 0 ? 'dn' : 'mut'}`}>{d !== 0 && <Arrow up={d > 0} />}{Math.abs(pct).toFixed(2)}%<span className="sr"> {d >= 0 ? 'up' : 'down'} today, {f(Math.abs(d))}</span></span>;
};

const BOXES: Array<{ id: MktId; name: string }> = [
  { id: 'comexG', name: 'Gold Comex' },
  { id: 'comexS', name: 'Silver Comex' },
  { id: 'fx', name: 'USD / INR' }
];

/** COMEX gold and silver and USD-INR in three small boxes, each with the day's high and low. */
export const MarketBoxes: React.FC<{ mkt?: Board['mkt'] }> = ({ mkt }) => {
  const flash = useFlash(Object.fromEntries(BOXES.map((b) => [b.id, mkt?.[b.id]?.v])));
  const boxes = BOXES.filter((b) => mkt?.[b.id]);
  if (!boxes.length) return null;
  return (
    <div className="mkt3" style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}>
      {boxes.map(({ id, name }) => {
        const q = mkt![id]!;
        return (
          <div key={id} className={`mbox${flash[id] ? ` f-${flash[id]}` : ''}`}>
            <span className="k">{name}</span>
            <span className="v num">{fmt[id](q.v)}</span>
            <Chg q={q} f={fmt[id]} />
            <span className="hl num"><span>H {fmt[id](q.h)}</span><span>L {fmt[id](q.l)}</span></span>
          </div>
        );
      })}
    </div>
  );
};

/** MCX gold and silver futures for the contract the store follows, with the day's high and low. */
export const McxBoard: React.FC<{ mcx?: Board['mcx'] }> = ({ mcx }) => {
  const rows = ([['g', 'Gold', '10 g'], ['s', 'Silver', 'kg']] as const).filter(([m]) => mcx?.[m]);
  const flash = useFlash({ g: mcx?.g?.q.v, s: mcx?.s?.q.v });
  if (!rows.length) return null;
  return (
    <section className="sec" aria-label="MCX futures">
      <div className="sec-h mcx"><span>MCX Futures</span><span>High</span><span>Low</span><span>Rate</span></div>
      {rows.map(([m, name, unit]) => {
        const { name: contract, q } = mcx![m]!;
        return (
          <div key={m} className={`mcx mrow${flash[m] ? ` f-${flash[m]}` : ''}`}>
            <span className="col" style={{ minWidth: 0 }}>
              <span className="ser" style={{ fontSize: 18 }}>{name} <span className="mut" style={{ fontSize: 12 }}>₹/{unit}</span></span>
              <span className="ctr">{contract}</span>
              <Chg q={q} f={rupees} />
            </span>
            <span className="num hl1">{rupees(q.h)}</span>
            <span className="num hl1">{rupees(q.l)}</span>
            <span className="rate num">{rupees(q.v)}</span>
          </div>
        );
      })}
    </section>
  );
};
