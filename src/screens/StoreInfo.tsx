import React from 'react';
import { useStore } from '../context';
import { go } from '../router';

/** The store: where it is, how to reach it, and signing out. */
export const StoreInfoScreen: React.FC = () => {
  const { store, user, signOut } = useStore();
  return (
    <div className="col grow" style={{ padding: '24px 20px', gap: 6 }}>
      <span className="ey">{store.city || 'The store'}</span>
      <h1 className="ser" style={{ fontSize: 38 }}>{store.name}</h1>
      {store.tagline && <p className="mut">{store.tagline}</p>}
      <div className="col" style={{ marginTop: 18 }}>
        {store.address && <div className="kv"><span>Address</span><span style={{ textAlign: 'right' }}>{store.address}</span></div>}
        {store.phone && <div className="kv"><span>Phone</span><a href={`tel:${store.phone.replace(/\s/g, '')}`}>{store.phone}</a></div>}
        {store.pickup && <div className="kv"><span>Collect</span><span style={{ textAlign: 'right' }}>{store.pickup}</span></div>}
        {store.payTerms && <div className="kv"><span>Payment</span><span style={{ textAlign: 'right' }}>{store.payTerms}</span></div>}
      </div>
      <div className="col" style={{ gap: 10, marginTop: 24 }}>
        {store.whatsapp && <a className="btn fill w" href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>}
        {store.address && <a className="btn w" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`} target="_blank" rel="noopener noreferrer">Directions</a>}
        {user?.role === 'buyer' ? <button type="button" className="btn w" onClick={signOut}>Sign out{user.name ? ` (${user.name})` : ''}</button> : <button type="button" className="btn w" onClick={() => go('/signin')}>Sign in</button>}
      </div>
      <button type="button" className="mut" onClick={() => go('/owner')} style={{ marginTop: 28, alignSelf: 'center', background: 'none', border: 0, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', minHeight: 44, cursor: 'pointer' }}>Owner sign-in</button>
    </div>
  );
};
