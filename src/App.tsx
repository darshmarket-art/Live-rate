import React, { useCallback, useEffect, useState } from 'react';
import { api, session, type Banner, type StoreInfo, type ThemeView } from './api';
import { StoreCtx, type Ctx } from './context';
import { go, usePath } from './router';
import { applyTheme } from './theme';
import { Icon } from './icons';
import { Rates } from './screens/Rates';
import { Metal } from './screens/Metal';
import { Book } from './screens/Book';
import { Alerts } from './screens/Alerts';
import { Activity } from './screens/Activity';
import { StoreInfoScreen } from './screens/StoreInfo';
import { SignIn } from './screens/SignIn';
import { Owner } from './owner/Owner';
import { Screen } from './tv/Screen';
import type { RowId } from '../shared/rates';

const TABS = [
  { path: '/', label: 'Rates', icon: 'rates' },
  { path: '/book', label: 'Book', icon: 'cal' },
  { path: '/alerts', label: 'Alerts', icon: 'bell' },
  { path: '/activity', label: 'Updates', icon: 'msg' },
  { path: '/store', label: 'Store', icon: 'pin' }
];

export const Masthead: React.FC<{ back?: boolean }> = ({ back }) => {
  const { store } = useStoreSafe();
  return (
    <header className="bar">
      {back ? (
        <button type="button" className="ic" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : go('/'))}><Icon n="back" /></button>
      ) : (
        <button type="button" className="ic" aria-label="Rate alerts" onClick={() => go('/alerts')}><Icon n="bell" /></button>
      )}
      <button type="button" className="word" onClick={() => go('/')} aria-label={`${store.name}, rates`}>
        <span className="mark">{store.name.trim().charAt(0).toUpperCase()}</span><span>{store.name}</span>
      </button>
      {store.phone ? <a className="ic" href={`tel:${store.phone.replace(/\s/g, '')}`} aria-label="Call the store" style={{ justifySelf: 'end' }}><Icon n="phone" /></a> : <span />}
    </header>
  );
};

const useStoreSafe = () => React.useContext(StoreCtx)!;

const Tabs: React.FC<{ path: string }> = ({ path }) => (
  <nav className="tabs" aria-label="Main">
    {TABS.map((t) => (
      <button key={t.path} type="button" aria-current={(t.path === '/' ? path === '/' || path.startsWith('/metal') : path.startsWith(t.path)) ? 'page' : undefined} onClick={() => go(t.path)}>
        <Icon n={t.icon} />{t.label}
      </button>
    ))}
  </nav>
);

export const App: React.FC = () => {
  const path = usePath();
  const [data, setData] = useState<{ store: StoreInfo; theme: ThemeView; banners: Banner[] } | null>(null);
  const [user, setUser] = useState<Ctx['user']>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.store();
      setData(d);
      if (!location.pathname.startsWith('/owner')) applyTheme(d.theme.tokens, d.theme.display);
      if (session.get()) setUser((await api.me()).user);
    } catch (e: any) {
      setFailed(e?.status === 404 ? 'There is no store at this address.' : 'Could not reach the store. Check the connection and try again.');
    }
  }, []);
  useEffect(() => { if (!path.startsWith('/screen')) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (path.startsWith('/screen')) return <Screen />;
  if (failed) return <div className="app"><p className="empty" role="alert">{failed}</p></div>;
  if (!data) return <div className="app" aria-busy="true" />;

  const ctx: Ctx = {
    ...data,
    user,
    signedIn: async (role, token) => { session.set({ token, role }); setUser((await api.me()).user); },
    signOut: () => { session.set(null); setUser(null); go('/'); },
    reload: load
  };

  if (path.startsWith('/owner')) return <StoreCtx.Provider value={ctx}><Owner path={path} /></StoreCtx.Provider>;

  const buyer = user?.role === 'buyer';
  // the owner may look at the rate board with their own session; booking, alerts and updates are a buyer's
  const needsSignIn = (path === '/' || path.startsWith('/metal')) ? !user && !data.store.ratesPublic : ['/book', '/alerts', '/activity'].some((p) => path.startsWith(p)) && !buyer;
  let body: React.ReactNode;
  if (needsSignIn || path === '/signin') body = <SignIn />;
  else if (path.startsWith('/metal/')) body = <Metal row={path.split('/')[2] as RowId} />;
  else if (path.startsWith('/book')) body = <Book />;
  else if (path.startsWith('/alerts')) body = <Alerts />;
  else if (path.startsWith('/activity')) body = <Activity />;
  else if (path.startsWith('/store')) body = <StoreInfoScreen />;
  else body = <Rates />;

  return (
    <StoreCtx.Provider value={ctx}>
      <div className="app">
        <Masthead back={path.startsWith('/metal')} />
        <main className="page">{body}</main>
        <Tabs path={path} />
      </div>
    </StoreCtx.Provider>
  );
};
