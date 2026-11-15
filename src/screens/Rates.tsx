import React from 'react';
import { inr } from '../../shared/rates';
import { useStore } from '../context';
import { Arrow } from '../icons';
import { timeOf, useBoard } from '../live';
import { go } from '../router';
import { BannerCarousel } from './Banners';
import { MarketBoxes, McxBoard, Ticker } from './Market';

/** Signed change since opening: "+₹350 · 0.27%". */
export const changeText = (change: number, pct: number) => `${change >= 0 ? '+' : '−'}₹${inr(Math.abs(change))} · ${Math.abs(pct).toFixed(2)}%`;

/** The live rate board: the owner's notice, banners, the live strip, COMEX and USD-INR, MCX futures, then the store's buy and sell (from MCX). */
export const Rates: React.FC = () => {
  const { store, banners } = useStore();
  const { board, flash } = useBoard();
  const live = board?.status === 'live';
  return (
    <>
      <Ticker text={store.notice} />
      <BannerCarousel banners={banners} />
      <div className="strip">
        <span className={`live${live ? '' : ' off'}`} aria-live="polite"><i />{live ? `Live · ${timeOf(board!.at)}` : 'Rates paused'}</span>
        {board?.sample ? <span className="xs mut" style={{ fontSize: 10 }}>Sample feed · not market rates</span> : board?.source === 'manual' ? <span className="xs mut" style={{ fontSize: 10 }}>Rate set by hand</span> : null}
      </div>
      <MarketBoxes mkt={board?.mkt} />
      {!live && board && <p className="paused" role="status">The rate feed has paused. The last rates stay on screen and booking is off until it is back.</p>}
      <section className="sec col" aria-busy={!board} aria-label="Rates">
        <div className="sec-h rhead one"><span>Rates</span><span style={{ textAlign: 'right' }}>Rate</span></div>
        {board?.rows.map((r) => (
          <button key={r.id} type="button" className={`rrow one${flash[r.id] ? ` f-${flash[r.id]}` : ''}`} onClick={() => go(`/metal/${r.id}`)} aria-label={`${r.name}: ₹${inr(r.buy)} per ${r.unit}`}>
            <span className="col" style={{ gap: 3, minWidth: 0 }}>
              <span className="ser" style={{ fontSize: 21 }}>{r.name}</span>
              <span className="rsub">
                <span className="mut">per {r.unit}</span>
                {r.fixed ? <span className="mut">Held by the store</span> : <span className={`chg ${r.change > 0 ? 'up' : r.change < 0 ? 'dn' : 'mut'}`}>{r.change !== 0 && <Arrow up={r.change > 0} />}{changeText(r.change, r.changePct)}</span>}
              </span>
            </span>
            <span className="rate num">₹{inr(r.buy)}</span>
          </button>
        ))}
        {board && !board.rows.length && <p className="empty">Rates will appear here as soon as the feed starts.</p>}
      </section>
      <McxBoard mcx={board?.mcx} />
      <p className="note">Change since today’s opening rate.{store.taxNote ? ` ${store.taxNote}.` : ''} Rates move with the market until a booking is confirmed.</p>
    </>
  );
};
