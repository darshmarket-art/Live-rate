import React, { useEffect, useState } from 'react';
import type { Banner } from '../api';
import { withStore } from '../api';
import { go } from '../router';
import { useStore } from '../context';

/** Where a banner leads. */
export function bannerHref(b: Banner, whatsapp: string, phone: string): { href?: string; onClick?: () => void; external?: boolean } {
  if (b.action === 'book') return { onClick: () => go('/book') };
  if (b.action === 'whatsapp' && whatsapp) return { href: `https://wa.me/${whatsapp}?text=${encodeURIComponent(b.title)}`, external: true };
  if (b.action === 'call' && phone) return { href: `tel:${phone.replace(/\s/g, '')}` };
  if (b.action === 'link' && b.link) return { href: b.link, external: true };
  return {};
}

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The store's advertising banners above the rates: one at a time, every 5 seconds, paused while a finger or pointer is on them. */
export const BannerCarousel: React.FC<{ banners: Banner[] }> = ({ banners }) => {
  const { store } = useStore();
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (banners.length < 2 || hold || REDUCED) return;
    const t = setInterval(() => setI((n) => (n + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length, hold]);
  if (!banners.length) return null;
  return (
    <section className="ban" aria-roledescription="carousel" aria-label="From the store" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      {banners.map((b, n) => {
        const to = bannerHref(b, store.whatsapp, store.phone);
        const inner = (
          <>
            {b.photo && <img src={withStore(b.photo)} alt="" loading={n === 0 ? 'eager' : 'lazy'} />}
            <span className="scrim" />
            <span className="ban-t">
              {b.eyebrow && <span className="ey">{b.eyebrow}</span>}
              <span className="ser">{b.title}</span>
              {b.action !== 'none' && <span className="xs">{b.line || { book: 'Book now', whatsapp: 'Ask on WhatsApp', call: 'Call the store', link: 'See more', none: '' }[b.action]}</span>}
              {b.action === 'none' && b.line && <span style={{ fontSize: 13, color: '#d8d1c4' }}>{b.line}</span>}
            </span>
          </>
        );
        const props = { className: `ban-s${n === i ? ' on' : ''}`, 'aria-hidden': n !== i, tabIndex: n === i ? 0 : -1 };
        return to.href ? (
          <a key={b.id} {...props} href={to.href} {...(to.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>
        ) : (
          <button key={b.id} type="button" {...props} onClick={to.onClick}>{inner}</button>
        );
      })}
      {banners.length > 1 && (
        <div className="ban-dots" role="group" aria-label="Banners">
          {banners.map((b, n) => <button key={b.id} type="button" aria-label={`Banner ${n + 1} of ${banners.length}`} aria-current={n === i} onClick={() => setI(n)}><span /></button>)}
        </div>
      )}
    </section>
  );
};
