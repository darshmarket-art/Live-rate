import { useEffect, useRef, useState } from 'react';
import type { Board, RowId } from '../shared/rates';
import { session, withStore } from './api';

/**
 * The store's board, live. One EventSource per screen; the browser reconnects on its own. `flash` says which rows just moved and which
 * way (cleared after a moment), so a row can glow without the rate itself having to be compared in every component.
 */
export function useBoard(path = '/api/rates/stream', enabled = true) {
  const [board, setBoard] = useState<Board | null>(null);
  const [flash, setFlash] = useState<Partial<Record<RowId, 'up' | 'dn'>>>({});
  const [connected, setConnected] = useState(false);
  const prev = useRef<Board | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const token = session.get()?.token;
    const base = withStore(path);
    const url = token ? `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : base;
    const es = new EventSource(url);
    let clear: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const b = JSON.parse(e.data) as Board;
      const before = prev.current;
      if (before) {
        const f: Partial<Record<RowId, 'up' | 'dn'>> = {};
        for (const r of b.rows) { const o = before.rows.find((x) => x.id === r.id); if (o && o.buy !== r.buy) f[r.id] = r.buy > o.buy ? 'up' : 'dn'; }
        if (Object.keys(f).length) { setFlash(f); clearTimeout(clear); clear = setTimeout(() => setFlash({}), 650); }
      }
      prev.current = b;
      setBoard(b);
    };
    return () => { es.close(); clearTimeout(clear); };
  }, [path, enabled]);
  return { board, flash, connected };
}

export const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-IN', { hour12: false });
