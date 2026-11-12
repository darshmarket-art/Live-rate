import React, { useState } from 'react';
import { api } from '../api';
import { useStore } from '../context';
import { Icon } from '../icons';
import { go } from '../router';
import { Desk } from './Desk';
import { Bookings } from './Bookings';
import { Banners } from './Banners';
import { Themes } from './Themes';
import { StoreSettings } from './StoreSettings';

const TABS = [
  { path: '/owner', label: 'Rates', icon: 'rates' },
  { path: '/owner/bookings', label: 'Bookings', icon: 'cal' },
  { path: '/owner/banners', label: 'Banners', icon: 'image' },
  { path: '/owner/theme', label: 'Theme', icon: 'palette' },
  { path: '/owner/store', label: 'Store', icon: 'user' }
];

const OwnerLogin: React.FC = () => {
  const { store, signedIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="signin" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await signedIn('owner', (await api.ownerLogin(email, password)).token); } catch (x: any) { setError(x.message); } finally { setBusy(false); } }}>
      <div className="col" style={{ gap: 14 }}>
        <span className="ey">{store.name}</span>
        <h1 className="ser">Owner sign-in</h1>
        <p className="mut">Set your margins, banners, theme and bookings.</p>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <label className="field"><span>Email</span><input className="inp" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>Password</span><input className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="submit" className="btn fill w" disabled={busy || !email || !password}>{busy ? 'One moment…' : 'Sign in'}</button>
      <button type="button" className="btn s" style={{ border: 0, alignSelf: 'center' }} onClick={() => go('/')}>Back to the rates</button>
    </form>
  );
};

/** The store owner's console, in the store's light console look whatever theme buyers see. */
export const Owner: React.FC<{ path: string }> = ({ path }) => {
  const { store, user } = useStore();
  const owner = user?.role === 'owner';
  let body: React.ReactNode;
  if (!owner) body = <OwnerLogin />;
  else if (path.startsWith('/owner/bookings')) body = <Bookings />;
  else if (path.startsWith('/owner/banners')) body = <Banners />;
  else if (path.startsWith('/owner/theme')) body = <Themes />;
  else if (path.startsWith('/owner/store')) body = <StoreSettings />;
  else body = <Desk />;
  return (
    <div className="app lt">
      <header className="bar">
        <span />
        <button type="button" className="word" onClick={() => go('/owner')}><span className="mark">{store.name.trim().charAt(0).toUpperCase()}</span><span>{store.name}</span></button>
        <button type="button" className="ic" aria-label="See the buyers’ app" onClick={() => go('/')} style={{ justifySelf: 'end' }}><Icon n="right" /></button>
      </header>
      <main className="page">{body}</main>
      {owner && (
        <nav className="tabs" aria-label="Owner">
          {TABS.map((t) => <button key={t.path} type="button" aria-current={(t.path === '/owner' ? path === '/owner' || path === '/owner/' : path.startsWith(t.path)) ? 'page' : undefined} onClick={() => go(t.path)}><Icon n={t.icon} />{t.label}</button>)}
        </nav>
      )}
    </div>
  );
};

export const Title: React.FC<{ ey: string; title: string; children?: React.ReactNode }> = ({ ey, title, children }) => (
  <section className="col" style={{ padding: '22px 20px 8px', gap: 6 }}>
    <span className="ey">{ey}</span>
    <h1 className="ser" style={{ fontSize: 36 }}>{title}</h1>
    {children && <p className="mut" style={{ fontSize: 13 }}>{children}</p>}
  </section>
);
