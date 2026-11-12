import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_GRAMS, PRODUCT_NAMES, inr, type BookProduct } from '../../shared/rates';
import { api, ApiError, type Booking, type Quote } from '../api';
import { useStore } from '../context';

const STEPS: Record<BookProduct, number[]> = { bar: [1, 5, 10, 20, 50, 100, 1000], coin: [1, 2, 5, 8, 10, 20, 50], silver: [100, 250, 500, 1000, 5000, 10000] };
const label = (g: number) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);

/** Book at the live rate: choose the metal and weight, the server holds that rate for 30 seconds, one tap books it. */
export const Book: React.FC = () => {
  const { store } = useStore();
  const start = new URLSearchParams(location.search).get('product') as BookProduct | null;
  const [product, setProduct] = useState<BookProduct>(start && STEPS[start] ? start : 'bar');
  const [step, setStep] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<Booking | null>(null);
  const grams = STEPS[product][Math.min(step, STEPS[product].length - 1)];
  const seq = useRef(0);

  const ask = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const { quote: q } = await api.quote(product, grams);
      if (mine === seq.current) { setQuote(q); setError(null); }
    } catch (e: any) {
      if (mine === seq.current) { setQuote(null); setError(e.message); }
    }
  }, [product, grams]);

  useEffect(() => { if (!booked) void ask(); }, [ask, booked]);
  // the countdown, and a fresh rate when the hold ends
  useEffect(() => {
    if (!quote || booked) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((quote.exp - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void ask();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [quote, booked, ask]);

  const confirm = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      setBooked((await api.book(quote.token)).booking);
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'QUOTE_EXPIRED' && e.body?.quote) { setQuote(e.body.quote); setError('The held rate ended just before you booked. Here is the new rate; book again to accept it.'); }
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <div className="col grow" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16, padding: '40px 28px' }}>
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true"><circle cx="42" cy="42" r="39" fill="none" stroke="var(--accent)" strokeWidth="1.5" /><path d="M26 43 L37 54 L58 31" fill="none" stroke="var(--accent)" strokeWidth="1.5" /></svg>
        <span className="ey">Booking {booked.ref}</span>
        <h1 className="ser" style={{ fontSize: 40 }}>Rate booked</h1>
        <p className="mut" style={{ maxWidth: '30ch' }}>{label(booked.grams)} of {PRODUCT_NAMES[booked.product]} at ₹{inr(booked.perGram, 2)} a gram, ₹{inr(booked.amount)} in all. The store confirms on WhatsApp.</p>
        <div className="col" style={{ gap: 10, width: '100%', paddingTop: 10 }}>
          {store.whatsapp && <a className="btn fill w" href={`https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Booking ${booked.ref}: ${label(booked.grams)} ${PRODUCT_NAMES[booked.product]} at ₹${inr(booked.perGram, 2)}/g, ₹${inr(booked.amount)}.`)}`} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>}
          <button type="button" className="btn w" onClick={() => { setBooked(null); setQuote(null); }}>Book something else</button>
        </div>
      </div>
    );
  }

  return (
    <div className="col grow">
      <section className="col" style={{ padding: '24px 20px 6px', gap: 6 }}>
        <span className="ey">Book at the live rate</span>
        <h1 className="ser" style={{ fontSize: 34 }}>What would you like?</h1>
      </section>
      <div className="col" style={{ padding: '12px 20px 0', gap: 10 }}>
        <span className="xs mut">Metal</span>
        <div className="row" role="group" aria-label="Metal" style={{ gap: 8, flexWrap: 'wrap' }}>
          {(['bar', 'coin', 'silver'] as BookProduct[]).map((p) => <button key={p} type="button" className="chip" aria-pressed={product === p} onClick={() => { setProduct(p); setStep(2); setQuote(null); }}>{PRODUCT_NAMES[p]}</button>)}
        </div>
      </div>
      <div className="row sb" style={{ padding: '22px 20px 0' }}>
        <span className="col" style={{ gap: 2 }}><span className="xs mut">Weight</span><span className="mut" style={{ fontSize: 12 }}>Up to {label(MAX_GRAMS[product])} in one booking</span></span>
        <span className="step">
          <button type="button" aria-label="Less" onClick={() => setStep((s) => Math.max(0, Math.min(s, STEPS[product].length - 1) - 1))}>−</button>
          <span className="num" aria-live="polite">{label(grams)}</span>
          <button type="button" aria-label="More" onClick={() => setStep((s) => Math.min(STEPS[product].length - 1, s + 1))}>+</button>
        </span>
      </div>

      {error && <p className="err" role="alert" style={{ margin: '20px 20px 0' }}>{error}</p>}

      {quote && (
        <>
          <section className="row box" style={{ gap: 18, margin: '24px 20px 0', padding: 18 }}>
            <span style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
              <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--hair)" strokeWidth="2" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="176" strokeDashoffset={Math.round(176 * (1 - left / 30))} style={{ transition: 'stroke-dashoffset .5s linear' }} />
              </svg>
              <span className="num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }} aria-label={`${left} seconds left at this rate`}>{left}s</span>
            </span>
            <span className="col grow" style={{ gap: 4 }}>
              <span className="xs mut">Rate held for you</span>
              <span className="ser num" style={{ fontSize: 30 }}>₹{inr(quote.perGram, 2)}</span>
              <span className="mut" style={{ fontSize: 12 }}>per gram · a new rate follows when the timer ends</span>
            </span>
          </section>
          <section className="col" style={{ padding: '10px 20px 0' }}>
            <div className="kv"><span>Weight</span><span className="num">{label(quote.grams)}</span></div>
            <div className="kv"><span>Amount</span><span className="num ser" style={{ fontSize: 24 }}>₹{inr(quote.amount)}</span></div>
            {store.pickup && <div className="kv" style={{ borderBottom: 0 }}><span>Collect</span><span>{store.pickup}</span></div>}
          </section>
        </>
      )}
      <div className="grow" />
      <div className="col" style={{ gap: 8, padding: '16px 20px 18px', borderTop: '1px solid var(--hair)', marginTop: 16 }}>
        <button type="button" className="btn gold w" disabled={!quote || busy} onClick={confirm}>{quote ? `Book for ₹${inr(quote.amount)}` : 'Book'}</button>
        <span className="mut" style={{ fontSize: 11.5, textAlign: 'center' }}>{store.payTerms ? `${store.payTerms}. ` : ''}The store confirms every booking on WhatsApp.</span>
      </div>
    </div>
  );
};
