/**
 * LicenseManager — developer-only panel for managing the GitHub license database.
 * Accessible only when the active license has `rights === 'developer'`.
 */
import React, { useState, useEffect } from 'react';
import {
  fetchDatabase, writeDatabase, addLicense, revokeLicense, updateLicense,
  invalidateCache,
} from '../license/licenseService';

const { ipcRenderer } = require('electron');

const RIGHTS_OPTIONS = ['trial', 'standard', 'developer'];

export default function LicenseManager({ onClose }) {
  const [db, setDb]           = useState(null);
  const [token, setToken]     = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [errMsg, setErrMsg]   = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [newLicenseKey, setNewLicenseKey] = useState(null); // shown after creation
  const [tab, setTab]         = useState('list'); // list | add | token

  const [addForm, setAddForm] = useState({
    name: '', email: '', rights: 'standard',
    expiresAt: oneYearFromNow(), notes: '',
  });

  useEffect(() => {
    loadToken();
    loadDb();
  }, []);

  async function loadToken() {
    const t = await ipcRenderer.invoke('license-load-token');
    if (t) { setToken(t); setTokenSaved(true); }
  }

  async function loadDb() {
    setBusy(true); setErrMsg('');
    try {
      invalidateCache();
      const d = await fetchDatabase();
      setDb(d);
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveToken() {
    if (!token.trim()) return;
    await ipcRenderer.invoke('license-save-token', { token: token.trim() });
    setTokenSaved(true);
    flash('GitHub token saved (encrypted).');
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const { newDb, newKey } = await addLicense(db, addForm);
      await writeDatabase(newDb, token);
      setDb(newDb);
      setNewLicenseKey(newKey);
      setAddForm({ name: '', email: '', rights: 'standard', expiresAt: oneYearFromNow(), notes: '' });
      flash(`License created.`);
      setTab('list');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(key, name) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    if (!confirm(`Revoke license for "${name}"? This cannot be undone.`)) return;
    setBusy(true); setErrMsg('');
    try {
      const newDb = revokeLicense(db, key);
      await writeDatabase(newDb, token);
      setDb(newDb);
      flash('License revoked.');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate(key) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const newDb = updateLicense(db, key, { active: true });
      await writeDatabase(newDb, token);
      setDb(newDb);
      flash('License reactivated.');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const licenses = db?.licenses || [];

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>🔑 License Manager <span style={S.badge}>Developer</span></span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {['list', 'add', 'token'].map(t => (
            <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
              onClick={() => { setTab(t); setErrMsg(''); }}>
              {t === 'list' ? `All Licenses (${licenses.length})` : t === 'add' ? '+ New License' : '⚙ GitHub Token'}
            </button>
          ))}
          <button style={{ ...S.tab, marginLeft: 'auto' }} onClick={loadDb} disabled={busy}>↻ Refresh</button>
        </div>

        {errMsg    && <div style={S.errBox}>{errMsg}</div>}
        {successMsg && <div style={S.okBox}>{successMsg}</div>}

        {/* New key banner */}
        {newLicenseKey && (
          <div style={S.keyBanner}>
            <span style={{ color: '#68d391', fontWeight: 700 }}>New key created — copy now, it won't be shown again:</span>
            <div style={S.keyDisplay}>{newLicenseKey}</div>
            <button style={S.copyBtn} onClick={() => { navigator.clipboard.writeText(newLicenseKey); flash('Copied!'); }}>
              Copy to Clipboard
            </button>
            <button style={{ ...S.copyBtn, background: 'none', border: '1px solid #2a4a6a', marginLeft: 8 }}
              onClick={() => setNewLicenseKey(null)}>Dismiss</button>
          </div>
        )}

        <div style={S.body}>

          {/* ── LIST TAB ─────────────────────────────────────────────── */}
          {tab === 'list' && (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Rights', 'Expires', 'Status', 'Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {licenses.length === 0 && (
                  <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#4a5568' }}>No licenses yet.</td></tr>
                )}
                {licenses.map(l => (
                  <tr key={l.key} style={l.active ? {} : { opacity: 0.45 }}>
                    <td style={S.td}><div style={{ fontWeight: 600 }}>{l.name}</div><div style={{ fontSize: 10, color: '#718096', fontFamily: 'monospace' }}>{l.key}</div></td>
                    <td style={S.td}>{l.email}</td>
                    <td style={S.td}><span style={{ ...S.rightsBadge, background: rightsColor(l.rights) }}>{l.rights}</span></td>
                    <td style={S.td}>{l.expiresAt}</td>
                    <td style={S.td}>
                      {!l.active ? <span style={{ color: '#fc8181' }}>Revoked</span>
                        : new Date(l.expiresAt) < new Date() ? <span style={{ color: '#f6ad55' }}>Expired</span>
                        : <span style={{ color: '#68d391' }}>Active</span>}
                    </td>
                    <td style={S.td}>
                      {l.active
                        ? <button style={S.actionBtn} onClick={() => handleRevoke(l.key, l.name)} disabled={busy}>Revoke</button>
                        : <button style={{ ...S.actionBtn, background: '#2a5a3a' }} onClick={() => handleReactivate(l.key)} disabled={busy}>Reactivate</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── ADD TAB ──────────────────────────────────────────────── */}
          {tab === 'add' && (
            <form onSubmit={handleAdd} style={S.form}>
              <Row label="Name *">
                <input style={S.inp} value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
              </Row>
              <Row label="Email">
                <input style={S.inp} type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
              </Row>
              <Row label="Rights">
                <select style={S.inp} value={addForm.rights} onChange={e => setAddForm(f => ({ ...f, rights: e.target.value }))}>
                  {RIGHTS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Row>
              <Row label="Expires">
                <input style={S.inp} type="date" value={addForm.expiresAt} onChange={e => setAddForm(f => ({ ...f, expiresAt: e.target.value }))} required />
              </Row>
              <Row label="Notes">
                <input style={S.inp} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
              </Row>
              <button style={{ ...S.actionBtn, marginTop: 16, padding: '10px 24px', background: '#4a90d9', fontSize: 13 }}
                type="submit" disabled={busy || !token}>
                {busy ? 'Creating…' : 'Create License'}
              </button>
              {!token && <div style={{ color: '#f6ad55', fontSize: 11, marginTop: 8 }}>⚠ Add a GitHub token first (Token tab).</div>}
            </form>
          )}

          {/* ── TOKEN TAB ────────────────────────────────────────────── */}
          {tab === 'token' && (
            <div style={S.form}>
              <p style={{ color: '#a0aec0', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                A GitHub Personal Access Token with <strong style={{ color: '#e0e0e0' }}>repo</strong> scope
                is required to create, revoke, or modify licenses. The token is stored encrypted
                on this machine and never transmitted except directly to GitHub.
              </p>
              <Row label="GitHub PAT">
                <input style={S.inp} type="password" value={token}
                  onChange={e => { setToken(e.target.value); setTokenSaved(false); }}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
              </Row>
              <button style={{ ...S.actionBtn, marginTop: 12, padding: '9px 20px', background: '#4a90d9' }}
                onClick={saveToken} disabled={!token.trim()}>
                {tokenSaved ? '✓ Saved' : 'Save Token'}
              </button>
              <p style={{ color: '#4a5568', fontSize: 11, marginTop: 16 }}>
                Token is encrypted using the OS keychain (Windows DPAPI / macOS Keychain).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <label style={{ width: 80, fontSize: 12, color: '#a0aec0', flexShrink: 0 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function rightsColor(r) {
  if (r === 'developer') return '#6b46c1';
  if (r === 'standard')  return '#2b6cb0';
  return '#276749';
}

function oneYearFromNow() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  panel:   { background: '#16213e', border: '1px solid #0f3460', borderRadius: 8, width: '90vw', maxWidth: 860, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  title:   { fontSize: 16, fontWeight: 700, color: '#e0e0e0', display: 'flex', alignItems: 'center', gap: 8 },
  badge:   { background: '#6b46c1', color: '#e9d8fd', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, letterSpacing: '0.05em' },
  closeBtn:{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 18 },
  tabs:    { display: 'flex', borderBottom: '1px solid #0f3460', flexShrink: 0, padding: '0 16px' },
  tab:     { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', padding: '10px 14px', fontSize: 13 },
  tabActive:{ color: '#4a90d9', borderBottom: '2px solid #4a90d9' },
  errBox:  { margin: '8px 16px 0', padding: '8px 12px', background: 'rgba(252,129,129,0.12)', border: '1px solid #fc8181', borderRadius: 4, color: '#fc8181', fontSize: 12 },
  okBox:   { margin: '8px 16px 0', padding: '8px 12px', background: 'rgba(104,211,145,0.12)', border: '1px solid #68d391', borderRadius: 4, color: '#68d391', fontSize: 12 },
  body:    { flex: 1, overflow: 'auto', padding: 16 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:      { textAlign: 'left', padding: '6px 10px', color: '#718096', borderBottom: '1px solid #0f3460', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' },
  td:      { padding: '8px 10px', borderBottom: '1px solid rgba(15,52,96,0.5)', color: '#e0e0e0', verticalAlign: 'middle' },
  form:    { maxWidth: 480, paddingTop: 8 },
  inp:     { width: '100%', background: '#0d1b2a', border: '1px solid #1a3a5c', borderRadius: 4, color: '#e0e0e0', fontSize: 13, padding: '7px 10px', boxSizing: 'border-box' },
  rightsBadge: { padding: '2px 8px', borderRadius: 10, color: '#fff', fontSize: 10, fontWeight: 600 },
  actionBtn: { padding: '5px 12px', background: '#7b2d2d', border: 'none', borderRadius: 4, color: '#fed7d7', fontSize: 12, cursor: 'pointer' },
  keyBanner: { margin: '8px 16px', padding: 14, background: 'rgba(104,211,145,0.08)', border: '1px solid #68d391', borderRadius: 6 },
  keyDisplay: { fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.15em', color: '#68d391', margin: '10px 0', fontWeight: 700 },
  copyBtn:   { padding: '6px 14px', background: '#276749', border: 'none', borderRadius: 4, color: '#c6f6d5', fontSize: 12, cursor: 'pointer' },
};
