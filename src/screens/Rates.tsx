import React from 'react';
import { inr } from '../../shared/rates';
import { useStore } from '../context';
import { Arrow } from '../icons';
import { timeOf, useBoard } from '../live';
import { go } from '../router';
import { BannerCarousel } from './Banners';

/** Signed change since opening: "+₹350 · 0.27%". */
export const changeText = (change: number, pct: number) => `${change >= 0 ? '+' : '−'}₹${inr(Math.abs(change))} · ${Math.abs(pct).toFixed(2)}%`;

/** The live rate board: the store's banners, the live strip, spot gold, then one row per metal with "You buy" and "You sell". */
export const Rates: React.FC = () => {
  const { store, banners } = useStore();
  const { board, flash } = useBoard();
  const live = board?.status === 'live';
  return (
    <>
      <BannerCarousel banners={banners} />
      <div className="strip">
        <span className={`live${live ? '' : ' off'}`} aria-live="polite"><i />{live ? `Live · ${timeOf(board!.at)}` : 'Rates paused'}</span>
        {board?.sample ? <span className="xs mut" style={{ fontSize: 10 }}>Sample feed · not market rates</span> : board?.source === 'manual' ? <span className="xs mut" style={{ fontSize: 10 }}>Rate set by hand</span> : null}
      </div>
      {board?.spot && (
        <div className="spot">
          {board.spot.usdOz && <span><span className="mut xs" style={{ fontSize: 10 }}>Spot gold</span> <span className="num">${board.spot.usdOz.toFixed(1)}</span> <span className="mut">/oz</span></span>}
          {board.spot.fx && <span><span className="mut xs" style={{ fontSize: 10 }}>USD-INR</span> <span className="num">{board.spot.fx.toFixed(2)}</span></span>}
        </div>
      )}
      {!live && board && <p className="paused" role="status">The rate feed has paused. The last rates stay on screen and booking is off until it is back.</p>}
      <div className="rhead"><span>Per 10 g · silver per kg</span><span style={{ textAlign: 'right' }}>You buy</span><span style={{ textAlign: 'right' }}>You sell</span></div>
      <div className="col" aria-busy={!board}>
        {board?.rows.map((r) => (
          <button key={r.id} type="button" className={`rrow${flash[r.id] ? ` f-${flash[r.id]}` : ''}`} onClick={() => go(`/metal/${r.id}`)} aria-label={`${r.name}: you buy at ₹${inr(r.buy)}, you sell at ₹${inr(r.sell)} per ${r.unit}`}>
            <span className="col" style={{ gap: 3, minWidth: 0 }}>
              <span className="ser" style={{ fontSize: 21 }}>{r.name}</span>
              <span className="rsub">
                <span className="mut">{r.id === 'ag' ? 'Per kg' : r.id === 'g24' ? 'Bars and coins' : 'Jewellery'}</span>
                {r.fixed ? <span className="mut">Held by the store</span> : <span className={`chg ${r.change > 0 ? 'up' : r.change < 0 ? 'dn' : 'mut'}`}>{r.change !== 0 && <Arrow up={r.change > 0} />}{changeText(r.change, r.changePct)}</span>}
              </span>
            </span>
            <span className="rate num">₹{inr(r.buy)}</span>
            <span className="rate num">₹{inr(r.sell)}</span>
          </button>
        ))}
        {board && !board.rows.length && <p className="empty">Rates will appear here as soon as the feed starts.</p>}
      </div>
      <p className="note">Change since today’s opening rate.{store.taxNote ? ` ${store.taxNote}.` : ''} Rates move with the market until a booking is confirmed.</p>
    </>
  );
};
