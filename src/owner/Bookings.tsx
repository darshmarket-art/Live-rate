import React, { useEffect, useState } from 'react';
import { PRODUCT_NAMES, inr } from '../../shared/rates';
import { api, type Booking } from '../api';
import { Title } from './Owner';

const LABEL: Record<Booking['status'], string> = { requested: 'New', confirmed: 'Confirmed', cancelled: 'Cancelled', collected: 'Collected' };
const NEXT: Record<Booking['status'], Array<[Booking['status'], string]>> = { requested: [['confirmed', 'Confirm'], ['cancelled', 'Decline']], confirmed: [['collected', 'Mark collected'], ['cancelled', 'Cancel']], cancelled: [], collected: [] };
const TABS: Array<[string, Booking['status'][]]> = [['New', ['requested']], ['Confirmed', ['confirmed']], ['Closed', ['cancelled', 'collected']]];

/** Bookings buyers made at the live rate: confirm them (and message the buyer), mark them collected, or decline. */
export const Bookings: React.FC = () => {
  const [list, setList] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.bookings().then((r) => setList(r.bookings)).catch((e) => setError(e.message));
  useEffect(() => { void load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);
  const set = async (b: Booking, s: Booking['status']) => {
    try { const { booking } = await api.setBooking(b.ref, s); setList((l) => l!.map((x) => (x.ref === b.ref ? booking : x))); } catch (e: any) { setError(e.message); }
  };
  const shown = list?.filter((b) => TABS[tab][1].includes(b.status)) ?? [];
  return (
    <div className="col grow">
      <Title ey="At the live rate" title="Bookings" />
      <div className="row" role="tablist" style={{ gap: 8, padding: '6px 20px 0' }}>
        {TABS.map(([name, st], i) => <button key={name} type="button" role="tab" aria-selected={tab === i} className="chip" aria-pressed={tab === i} onClick={() => setTab(i)}>{name} · {list?.filter((b) => st.includes(b.status)).length ?? 0}</button>)}
      </div>
      {error && <p className="err" role="alert" style={{ margin: '12px 20px 0' }}>{error}</p>}
      <section className="col" style={{ padding: '14px 20px 20px', gap: 12 }}>
        {list && !shown.length && <p className="mut">Nothing here.</p>}
        {shown.map((b) => (
          <article key={b.ref} className="card col" style={{ gap: 8 }}>
            <div className="row sb"><span className="ser" style={{ fontSize: 20 }}>{b.grams >= 1000 ? `${b.grams / 1000} kg` : `${b.grams} g`} {PRODUCT_NAMES[b.product]}</span><span className="num ser" style={{ fontSize: 22 }}>₹{inr(b.amount)}</span></div>
            <span className="mut" style={{ fontSize: 13 }}>{b.name || 'Buyer'} · +{b.phone.slice(0, 2)} {b.phone.slice(2, 7)} {b.phone.slice(7)} · ₹{inr(b.perGram, 2)}/g</span>
            <span className="mut" style={{ fontSize: 12 }}>{b.ref} · {new Date(b.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {LABEL[b.status]}</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <a className="btn s" href={`https://wa.me/${b.phone}?text=${encodeURIComponent(`Booking ${b.ref}: ${b.grams} g ${PRODUCT_NAMES[b.product]} at ₹${inr(b.perGram, 2)}/g, ₹${inr(b.amount)}.`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              {NEXT[b.status].map(([s, label]) => <button key={s} type="button" className={`btn s${s === 'confirmed' || s === 'collected' ? ' fill' : ''}`} onClick={() => set(b, s)}>{label}</button>)}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
