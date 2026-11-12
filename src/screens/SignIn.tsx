import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../context';
import { go } from '../router';

const ten = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
};
const grouped = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);

/** Sign in with the WhatsApp number and a 6-digit code; a new number is asked for a name once. The buyer then stays signed in. */
export const SignIn: React.FC = () => {
  const { store, signedIn } = useStore();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const tried = useRef('');

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const send = async () => {
    setBusy(true); setError(null);
    try { const r = await api.requestCode(phone); setDevCode(r.devCode ?? null); setStep('code'); setCode(''); setWait(30); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const verify = async (c = code) => {
    tried.current = c;
    setBusy(true); setError(null);
    try {
      const r = await api.verifyCode(phone, c, step === 'name' ? name.trim() : undefined);
      if (r.status === 'needs-name') return setStep('name');
      await signedIn('buyer', r.token!);
      go(location.pathname === '/signin' ? '/' : location.pathname, true);
    } catch (e: any) {
      setError(e.message);
      if (step === 'code') { setCode(''); tried.current = ''; }
    } finally { setBusy(false); }
  };
  useEffect(() => { if (step === 'code' && code.length === 6 && code !== tried.current && !busy) void verify(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form className="signin" onSubmit={(e) => { e.preventDefault(); step === 'phone' ? void send() : void verify(); }}>
      <div className="col" style={{ gap: 14 }}>
        <span className="ey">{store.name}</span>
        <h1 className="ser">{step === 'phone' ? 'Live rates' : step === 'code' ? 'Enter the code' : 'Your name'}</h1>
        <p className="mut">{step === 'phone' ? 'Sign in with your WhatsApp number to see the rates, book and set alerts.' : step === 'code' ? `Sent to +91 ${grouped(ten(phone))} on WhatsApp.` : 'Your number is verified. Tell the store your name.'}</p>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {devCode && step !== 'phone' && <p className="ok">Development: the code is {devCode}.</p>}
      {step === 'phone' && (
        <label className="field"><span>WhatsApp number</span>
          <span className="row" style={{ gap: 12 }}><span className="ser mut" style={{ fontSize: 28 }}>+91</span>
            <input className="inp ser num" style={{ fontSize: 28, minHeight: 60 }} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={grouped(ten(phone))} onChange={(e) => setPhone(ten(e.target.value))} autoFocus />
          </span>
        </label>
      )}
      {step === 'code' && (
        <div className="code">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className={`num${code[i] ? ' set' : ''}${i === Math.min(code.length, 5) ? ' cur' : ''}`}>{code[i] ?? ''}</div>)}
          <input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        </div>
      )}
      {step === 'name' && <label className="field"><span>Name</span><input className="inp" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Shah" autoFocus /></label>}
      <button type="submit" className="btn fill w" disabled={busy || (step === 'phone' ? ten(phone).length < 10 : step === 'code' ? code.length < 6 : name.trim().length < 2)}>
        {busy ? 'One moment…' : step === 'phone' ? 'Send code on WhatsApp' : step === 'code' ? 'Verify' : 'Continue'}
      </button>
      {step !== 'phone' && (
        <div className="row sb">
          <button type="button" className="btn s" style={{ border: 0, padding: 0 }} onClick={() => { setStep('phone'); setCode(''); }}>Change number</button>
          <button type="button" className="btn s" style={{ border: 0, padding: 0 }} disabled={wait > 0 || busy} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>
        </div>
      )}
    </form>
  );
};
