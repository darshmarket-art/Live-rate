import React, { useEffect, useState } from 'react';
import { PRODUCT_NAMES, inr } from '../../shared/rates';
import { api, type Booking } from '../api';

const STATUS: Record<Booking['status'], string> = { requested: 'Waiting for the store', confirmed: 'Confirmed', cancelled: 'Cancelled', collected: 'Collected' };
const when = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Updates: the buyer's bookings and the alerts that have gone off. */
export const Activity: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [notes, setNotes] = useState<Array<{ id: string; text: string; at: string }> | null>(null);
  useEffect(() => {
    api.myBookings().then((r) => setBookings(r.bookings)).catch(() => setBookings([]));
    api.notifications().then((r) => setNotes(r.notifications)).catch(() => setNotes([]));
  }, []);
  return (
    <div className="col grow" style={{ padding: '24px 20px' }}>
      <span className="ey">Updates</span>
      <h1 className="ser" style={{ fontSize: 34, marginTop: 6 }}>Your bookings</h1>
      <div className="col" style={{ marginTop: 12 }}>
        {bookings?.length === 0 && <p className="mut" style={{ fontSize: 13 }}>No bookings yet.</p>}
        {bookings?.map((b) => (
          <article key={b.ref} className="col" style={{ gap: 4, padding: '14px 0', borderBottom: '1px solid var(--hair)' }}>
            <span className="row sb"><span>{b.grams >= 1000 ? `${b.grams / 1000} kg` : `${b.grams} g`} {PRODUCT_NAMES[b.product]}</span><span className="num ser" style={{ fontSize: 20 }}>₹{inr(b.amount)}</span></span>
            <span className="row sb mut" style={{ fontSize: 12 }}><span>{b.ref} · {when(b.createdAt)}</span><span className={b.status === 'cancelled' ? 'dn' : b.status === 'requested' ? '' : 'up'}>{STATUS[b.status]}</span></span>
          </article>
        ))}
      </div>
      <h2 className="ser" style={{ fontSize: 26, marginTop: 30 }}>Alerts sent</h2>
      <div className="col" style={{ marginTop: 8 }}>
        {notes?.length === 0 && <p className="mut" style={{ fontSize: 13 }}>None yet.</p>}
        {notes?.map((n) => <p key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--hair)', fontSize: 14 }}>{n.text}<br /><span className="mut" style={{ fontSize: 12 }}>{when(n.at)}</span></p>)}
      </div>
    </div>
  );
};
