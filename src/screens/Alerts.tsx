import React, { useEffect, useState } from 'react';
import { ROWS, inr, rowDef, type RowId } from '../../shared/rates';
import { api, type Alert } from '../api';
import { useBoard } from '../live';
import { Icon } from '../icons';

/** Rate alerts: "tell me when 24K goes below ₹…". One push of a WhatsApp message, once, when the store's own rate crosses the mark. */
export const Alerts: React.FC = () => {
  const start = new URLSearchParams(location.search).get('row') as RowId | null;
  const [row, setRow] = useState<RowId>(start && ROWS.some((r) => r.id === start) ? start : 'g24');
  const [above, setAbove] = useState(false);
  const [mark, setMark] = useState('');
  const [list, setList] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { board } = useBoard();
  const now = board?.rows.find((r) => r.id === row)?.buy;

  useEffect(() => { api.alerts().then((r) => setList(r.alerts)).catch((e) => setError(e.message)); }, []);
  // a sensible starting mark: 1% away from now in the chosen direction
  useEffect(() => { if (now && !mark) setMark(String(Math.round((now * (above ? 1.01 : 0.99)) / 100) * 100)); }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const n = Number(mark.replace(/[^\d]/g, ''));
    if (!n) return setError('Type the rate to watch for.');
    try {
      const { alert } = await api.addAlert(row, above, n);
      setList((l) => [alert, ...(l ?? [])]);
      setError(null);
    } catch (e: any) { setError(e.message); }
  };
  const toggle = async (a: Alert) => {
    try { const { alert } = await api.setAlert(a.id, !a.active); setList((l) => l!.map((x) => (x.id === a.id ? alert : x))); } catch (e: any) { setError(e.message); }
  };
  const remove = async (a: Alert) => {
    try { await api.removeAlert(a.id); setList((l) => l!.filter((x) => x.id !== a.id)); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="col grow">
      <section className="col" style={{ padding: '24px 20px 4px', gap: 6 }}>
        <span className="ey">Rate alerts</span>
        <h1 className="ser" style={{ fontSize: 34 }}>Tell me when the rate moves</h1>
        <p className="mut" style={{ fontSize: 13 }}>A WhatsApp message, once, when the store’s rate crosses your mark.</p>
      </section>
      <section className="col box" style={{ margin: '16px 20px 0', padding: 16, gap: 14 }}>
        <div className="row" role="group" aria-label="Metal" style={{ gap: 8 }}>
          {ROWS.map((r) => <button key={r.id} type="button" className="chip" aria-pressed={row === r.id} onClick={() => { setRow(r.id); setMark(''); }} style={{ flex: 1, padding: '0 6px' }}>{r.id === 'ag' ? 'Silver' : r.name.split(' ')[1]}</button>)}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="row" role="group" aria-label="Direction">
            <button type="button" className="chip" aria-pressed={!above} onClick={() => { setAbove(false); setMark(''); }}>Below</button>
            <button type="button" className="chip" aria-pressed={above} onClick={() => { setAbove(true); setMark(''); }} style={{ marginLeft: -1 }}>Above</button>
          </div>
          <label className="field grow"><span>₹ per {rowDef(row).unit}</span><input className="inp num" inputMode="numeric" value={mark ? inr(Number(mark.replace(/[^\d]/g, '')) || 0) : ''} onChange={(e) => setMark(e.target.value.replace(/[^\d]/g, ''))} style={{ fontSize: 20 }} /></label>
        </div>
        <div className="row sb" style={{ fontSize: 12 }}><span className="mut">{now ? `Now ₹${inr(now)}` : ''}</span><button type="button" className="btn gold s" onClick={add}>Add alert</button></div>
      </section>
      {error && <p className="err" role="alert" style={{ margin: '14px 20px 0' }}>{error}</p>}
      <section className="col" style={{ padding: '22px 20px 20px' }}>
        <span className="xs mut" style={{ paddingBottom: 6 }}>Your alerts</span>
        {list?.length === 0 && <p className="mut" style={{ fontSize: 13 }}>No alerts yet.</p>}
        {list?.map((a) => (
          <div key={a.id} className="row" style={{ gap: 12, minHeight: 64, borderBottom: '1px solid var(--hair)' }}>
            <span className="col grow" style={{ gap: 2 }}>
              <span>{rowDef(a.row).name} {a.above ? 'above' : 'below'} ₹{inr(a.mark)}</span>
              <span className="mut" style={{ fontSize: 12 }}>{a.active ? 'On · WhatsApp' : a.triggeredAt ? `Sent ${new Date(a.triggeredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at ₹${inr(a.triggeredRate ?? 0)}` : 'Paused'}</span>
            </span>
            <button type="button" className="sw" aria-pressed={a.active} aria-label={`${a.active ? 'Pause' : 'Turn on'} the ${rowDef(a.row).name} alert`} onClick={() => toggle(a)}><i /></button>
            <button type="button" className="ic mut" aria-label={`Remove the ${rowDef(a.row).name} alert`} onClick={() => remove(a)}><Icon n="x" /></button>
          </div>
        ))}
      </section>
    </div>
  );
};
