import { useEffect, useState } from 'react';

/** A small path router: the app has a handful of screens and no nested routes. Back and forward work through the browser history. */
export const go = (path: string, replace = false) => {
  const keep = new URLSearchParams(location.search);
  const url = path + (keep.toString() && !path.includes('?') ? `?${keep}` : '');
  replace ? history.replaceState(null, '', url) : history.pushState(null, '', url);
  window.dispatchEvent(new Event('lr-route'));
  window.scrollTo(0, 0);
};
export const usePath = () => {
  const [p, setP] = useState(location.pathname);
  useEffect(() => {
    const on = () => setP(location.pathname);
    window.addEventListener('popstate', on);
    window.addEventListener('lr-route', on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('lr-route', on); };
  }, []);
  return p;
};
