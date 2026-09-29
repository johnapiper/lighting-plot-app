import React, { useState, useEffect } from 'react';

// Lightweight non-blocking notifications. Call `toast(message, type)` from
// anywhere; <ToastHost /> (mounted once in App) renders them.
//   type: 'info' | 'success' | 'warn' | 'error'
let listeners = [];
let nextId = 1;

export function toast(message, type = 'info', { duration } = {}) {
  const t = { id: nextId++, message: String(message), type, duration: duration ?? (type === 'error' ? 7000 : 4000) };
  listeners.forEach(fn => fn(t));
  return t.id;
}

const COLORS = {
  info:    { bg: '#0f2a4a', border: 'var(--accent)', fg: 'var(--accent-soft)', icon: 'ℹ' },
  success: { bg: '#10301f', border: '#38a169', fg: '#9ae6b4', icon: '✓' },
  warn:    { bg: '#3a3010', border: '#d69e2e', fg: '#f6e05e', icon: '⚠' },
  error:   { bg: 'var(--danger-bg)', border: '#e53e3e', fg: 'var(--danger-text)', icon: '✕' },
};

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const add = (t) => {
      setItems(list => [...list.slice(-4), t]);
      setTimeout(() => setItems(list => list.filter(x => x.id !== t.id)), t.duration);
    };
    listeners.push(add);
    return () => { listeners = listeners.filter(fn => fn !== add); };
  }, []);

  if (!items.length) return null;
  return (
    <div style={styles.host} role="status" aria-live="polite">
      {items.map(t => {
        const c = COLORS[t.type] || COLORS.info;
        return (
          <div key={t.id} style={{ ...styles.toast, background: c.bg, borderColor: c.border, color: c.fg }}>
            <span style={styles.icon}>{c.icon}</span>
            <span style={styles.msg}>{t.message}</span>
            <button style={{ ...styles.close, color: c.fg }} title="Dismiss"
              onClick={() => setItems(list => list.filter(x => x.id !== t.id))}>×</button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  host: {
    position: 'fixed', right: 16, bottom: 36, zIndex: 5000,
    display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    minWidth: 240, maxWidth: 420, padding: '8px 10px',
    border: '1px solid', borderRadius: 6, fontSize: 12, lineHeight: 1.4,
    boxShadow: '0 6px 20px rgba(0,0,0,0.6)', pointerEvents: 'auto',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  icon: { fontWeight: 700, flexShrink: 0 },
  msg: { flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  close: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 },
};
