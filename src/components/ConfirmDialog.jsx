import React, { useState, useEffect } from 'react';
import ModalA11y from './ModalA11y';

// In-app replacement for window.confirm(). Call `await confirmDialog({...})`
// from anywhere; <ConfirmHost /> (mounted once in App) renders it.
//   confirmDialog({ title, message, confirmLabel, cancelLabel, danger }) → Promise<boolean>
let listener = null;

export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  if (!listener) return Promise.resolve(window.confirm(o.message || o.title || 'Are you sure?'));
  return new Promise(resolve => listener({ ...o, resolve }));
}

export default function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    listener = (r) => setReq(prev => { prev?.resolve(false); return r; });
    return () => { listener = null; };
  }, []);

  if (!req) return null;
  const done = (ok) => { req.resolve(ok); setReq(null); };

  return (
    <div style={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) done(false); }}>
      <ModalA11y onClose={() => done(false)} label={req.title || 'Confirm'}>
        <div style={styles.box}>
          {req.title && <div style={styles.title}>{req.title}</div>}
          <div style={styles.msg}>{req.message}</div>
          <div style={styles.row}>
            <button style={styles.cancel} onClick={() => done(false)}>{req.cancelLabel || 'Cancel'}</button>
            <button data-autofocus style={req.danger ? styles.danger : styles.ok} onClick={() => done(true)}>
              {req.confirmLabel || 'OK'}
            </button>
          </div>
        </div>
      </ModalA11y>
    </div>
  );
}

const btn = { padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  box: { background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', borderRadius: 8, padding: '18px 20px', width: 380, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 },
  msg: { fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  row: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  cancel: { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' },
  ok: { ...btn, background: 'var(--border)', border: '1px solid var(--accent)', color: 'var(--accent-text)' },
  danger: { ...btn, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' },
};
