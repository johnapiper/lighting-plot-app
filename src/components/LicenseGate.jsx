/**
 * LicenseGate — wraps the entire app. Renders children only when a valid
 * license is loaded. Shows an activation screen otherwise.
 */
import React, { useState, useEffect, createContext, useContext } from 'react';
import { fetchDatabase, verifyKey, hasFeature as checkFeature } from '../license/licenseService';

const { ipcRenderer } = require('electron');

// ── License context ────────────────────────────────────────────────────────
export const LicenseContext = createContext(null);
export function useLicense() { return useContext(LicenseContext); }

// ── Main gate ──────────────────────────────────────────────────────────────
const TRIAL_DAYS = 14;
const TRIAL_FEATURES = ['cad_edit', 'pdf_background', 'patch_panel', 'reports'];

export default function LicenseGate({ children }) {
  const [status, setStatus]     = useState('loading'); // loading | activating | valid | trial | error
  const [license, setLicense]   = useState(null);
  const [inputKey, setInputKey] = useState('');
  const [busy, setBusy]         = useState(false);
  const [errMsg, setErrMsg]     = useState('');
  const [offlineOk, setOfflineOk] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);

  useEffect(() => {
    // Clear any pre-encryption cached data
    try {
      const cachedDb = JSON.parse(localStorage.getItem('lplot_license_db') || 'null');
      if (cachedDb && !cachedDb._cacheVersion) localStorage.removeItem('lplot_license_db');
      const cachedResult = JSON.parse(localStorage.getItem('lplot_license_result') || 'null');
      if (cachedResult && !cachedResult._cacheVersion) localStorage.removeItem('lplot_license_result');
    } catch {}
    bootCheck();
  }, []);

  async function bootCheck() {
    setStatus('loading');
    try {
      const savedKey = await ipcRenderer.invoke('license-load-key');
      if (!savedKey) {
        // Check trial
        let trial = await ipcRenderer.invoke('trial-read');
        if (!trial) {
          trial = { startDate: new Date().toISOString() };
          await ipcRenderer.invoke('trial-write', trial);
        }
        const daysUsed = Math.floor((Date.now() - new Date(trial.startDate)) / 86400000);
        const left = TRIAL_DAYS - daysUsed;
        if (left > 0) {
          setTrialDaysLeft(left);
          setLicense({ valid: true, features: TRIAL_FEATURES, trial: true });
          setStatus('trial');
          ipcRenderer.send('license-features', { features: TRIAL_FEATURES });
          return;
        }
        setStatus('activating');
        return;
      }

      // Try online verify first
      let db;
      try {
        db = await fetchDatabase();
      } catch {
        // Offline — check if we have a cached result from last boot
        const cached = JSON.parse(localStorage.getItem('lplot_license_result') || 'null');
        if (cached?.valid && new Date(cached.expiresAt) > new Date()) {
          setLicense(cached);
          setOfflineOk(true);
          setStatus('valid');
          return;
        }
        setErrMsg('Cannot reach the license server and no offline cache found. Please connect to the internet.');
        setStatus('error');
        return;
      }

      const result = await verifyKey(savedKey, db);
      if (result.valid) {
        localStorage.setItem('lplot_license_result', JSON.stringify({ ...result, _cacheVersion: 2 }));
        setLicense(result);
        setStatus('valid');
        ipcRenderer.send('license-features', { features: result.features || [] });
      } else {
        setErrMsg(result.reason);
        setStatus('activating');
      }
    } catch (e) {
      setErrMsg(e.message);
      setStatus('error');
    }
  }

  async function handleActivate(e) {
    e.preventDefault();
    if (!inputKey.trim()) return;
    setBusy(true); setErrMsg('');
    try {
      const db = await fetchDatabase();
      const result = await verifyKey(inputKey.trim(), db);
      if (!result.valid) { setErrMsg(result.reason); return; }
      await ipcRenderer.invoke('license-save-key', { key: inputKey.trim().toUpperCase() });
      localStorage.setItem('lplot_license_result', JSON.stringify({ ...result, _cacheVersion: 2 }));
      setLicense(result);
      setStatus('valid');
      ipcRenderer.send('license-features', { features: result.features || [] });
    } catch (e) {
      setErrMsg(e.message || 'Activation failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleDeactivate() {
    ipcRenderer.invoke('license-clear-key');
    ipcRenderer.send('license-features', { features: [] });
    localStorage.removeItem('lplot_license_result');
    setLicense(null);
    setInputKey('');
    setStatus('activating');
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={S.overlay}>
        <div style={S.card}>
          <Logo />
          <p style={{ color: '#718096', marginTop: 16 }}>Checking license…</p>
        </div>
      </div>
    );
  }

  // ── Error (offline + no cache) ─────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={S.overlay}>
        <div style={S.card}>
          <Logo />
          <div style={S.errBox}>{errMsg}</div>
          <button style={S.btn} onClick={bootCheck}>Retry</button>
        </div>
      </div>
    );
  }

  // ── Activation screen ──────────────────────────────────────────────────
  if (status === 'activating') {
    return (
      <div style={S.overlay}>
        <div style={S.card}>
          <Logo />
          <h2 style={S.heading}>Activate Lighting Plot</h2>
          <p style={S.sub}>Enter your license key to continue.</p>
          <form onSubmit={handleActivate} style={{ width: '100%' }}>
            <input
              style={S.keyInput}
              placeholder="LPLOT-XXXX-XXXX-XXXX-XXXX"
              value={inputKey}
              onChange={e => setInputKey(e.target.value.toUpperCase())}
              autoFocus
              spellCheck={false}
            />
            {errMsg && <div style={S.errBox}>{errMsg}</div>}
            <button style={S.btn} type="submit" disabled={busy || !inputKey.trim()}>
              {busy ? 'Verifying…' : 'Activate'}
            </button>
          </form>
          <p style={S.footer}>
            License keys can be obtained from your system administrator or project manager.
          </p>
        </div>
      </div>
    );
  }

  // ── Valid — render app with context ───────────────────────────────────
  const hasFeature = (featureId) => checkFeature(license, featureId);

  return (
    <LicenseContext.Provider value={{ license, offlineOk, hasFeature, deactivate: handleDeactivate }}>
      {children}
    </LicenseContext.Provider>
  );
}

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 8 }}>
      <svg viewBox="0 0 64 64" width="56" height="56">
        <circle cx="32" cy="32" r="28" fill="none" stroke="#4a90d9" strokeWidth="2.5"/>
        <circle cx="32" cy="32" r="16" fill="none" stroke="#4a90d9" strokeWidth="1.2"/>
        <line x1="32" y1="4"  x2="32" y2="16" stroke="#4a90d9" strokeWidth="2.5"/>
        <line x1="32" y1="48" x2="32" y2="14" stroke="#4a90d9" strokeWidth="1.2"/>
        <line x1="32" y1="14" x2="32" y2="12" stroke="#4a90d9" strokeWidth="1.2"/>
        <line x1="20" y1="16" x2="32" y2="16" stroke="#4a90d9" strokeWidth="2"/>
        <line x1="44" y1="16" x2="32" y2="16" stroke="#4a90d9" strokeWidth="2"/>
      </svg>
      <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: 18, marginTop: 4, letterSpacing: '0.04em' }}>
        LIGHTING PLOT
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: '#0d1117',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  card: {
    background: '#16213e', border: '1px solid #0f3460',
    borderRadius: 10, padding: '36px 40px', width: 420,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  },
  heading: { color: '#e0e0e0', fontSize: 20, fontWeight: 700, margin: '12px 0 4px' },
  sub:     { color: '#718096', fontSize: 13, marginBottom: 20, textAlign: 'center' },
  keyInput: {
    width: '100%', boxSizing: 'border-box',
    background: '#0d1b2a', border: '1px solid #1a3a5c',
    borderRadius: 5, color: '#e0e0e0', fontSize: 15,
    padding: '10px 12px', letterSpacing: '0.12em',
    textAlign: 'center', outline: 'none',
    fontFamily: "'Courier New', monospace",
  },
  btn: {
    width: '100%', marginTop: 12, padding: '11px',
    background: '#4a90d9', border: 'none', borderRadius: 5,
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  errBox: {
    marginTop: 10, padding: '8px 12px',
    background: 'rgba(252,129,129,0.12)', border: '1px solid #fc8181',
    borderRadius: 4, color: '#fc8181', fontSize: 12, width: '100%', boxSizing: 'border-box',
  },
  footer: { color: '#4a5568', fontSize: 11, marginTop: 20, textAlign: 'center' },
};
