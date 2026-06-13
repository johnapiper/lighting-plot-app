/**
 * LicenseGate — wraps the entire app. Renders children only when a valid
 * license is loaded AND the running app version satisfies the license's
 * minimum-version requirement. Shows an activation / trial / version-blocked
 * screen otherwise.
 */
import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  fetchDatabase, verifyKey, hasFeature as checkFeature,
  getTrialConfig, compareVersions,
} from '../license/licenseService';
import AppSettingsModal from './AppSettingsModal';

const { ipcRenderer } = require('electron');

// ── License context ────────────────────────────────────────────────────────
export const LicenseContext = createContext(null);
export function useLicense() { return useContext(LicenseContext); }

// Fallback trial features if the license DB can't be reached and defines none.
const DEFAULT_TRIAL_FEATURES = ['cad_view', 'cad_edit', 'fixture_library'];
const DEFAULT_TRIAL_DAYS = 14;

export default function LicenseGate({ children }) {
  const [status, setStatus]     = useState('loading'); // loading | activating | valid | trial | blocked | error
  const [license, setLicense]   = useState(null);
  const [inputKey, setInputKey] = useState('');
  const [busy, setBusy]         = useState(false);
  const [errMsg, setErrMsg]     = useState('');
  const [offlineOk, setOfflineOk] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [blockedInfo, setBlockedInfo] = useState(null); // { minVersion }
  const [showAbout, setShowAbout] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Clear any pre-encryption cached data
    try {
      const cachedDb = JSON.parse(localStorage.getItem('lplot_license_db') || 'null');
      if (cachedDb && !cachedDb._cacheVersion) localStorage.removeItem('lplot_license_db');
      const cachedResult = JSON.parse(localStorage.getItem('lplot_license_result') || 'null');
      if (cachedResult && !cachedResult._cacheVersion) localStorage.removeItem('lplot_license_result');
    } catch {}
    // Resolve the running app version first — version gating depends on it.
    ipcRenderer.invoke('get-app-version')
      .then(v => setAppVersion(v || '0.0.0'))
      .catch(() => setAppVersion('0.0.0'))
      .finally(() => bootCheck());
  }, []);

  // Restore keyboard focus to the key field whenever the activation screen is
  // shown. After deactivating (especially via a native confirm dialog) the
  // renderer can lose keyboard focus, which made the field un-typeable.
  useEffect(() => {
    if (status !== 'activating') return;
    ipcRenderer.invoke('focus-window').catch(() => {});
    const t = setTimeout(() => { try { inputRef.current?.focus(); } catch {} }, 60);
    return () => clearTimeout(t);
  }, [status]);

  async function startTrial(db) {
    const cfg = getTrialConfig(db);
    if (!cfg.enabled) { setStatus('activating'); return; }
    const days = cfg.days || DEFAULT_TRIAL_DAYS;
    let trial = await ipcRenderer.invoke('trial-read');
    if (!trial) {
      trial = { startDate: new Date().toISOString() };
      await ipcRenderer.invoke('trial-write', trial);
    }
    const daysUsed = Math.floor((Date.now() - new Date(trial.startDate)) / 86400000);
    const left = days - daysUsed;
    if (left <= 0) { setStatus('activating'); return; }
    const features = cfg.features.length ? cfg.features : DEFAULT_TRIAL_FEATURES;
    setTrialDaysLeft(left);
    setLicense({ valid: true, features, trial: true, maxVersion: null });
    setStatus('trial');
    ipcRenderer.send('license-features', { features });
  }

  // Apply a verified license result, enforcing the minimum-version requirement.
  function applyLicense(result, appVer) {
    const min = result.minVersion;
    if (min && compareVersions(appVer || appVersion || '0.0.0', min) < 0) {
      // App is older than this license allows — block beyond the About window.
      setLicense(result);
      setBlockedInfo({ minVersion: min });
      setStatus('blocked');
      ipcRenderer.send('license-features', { features: [] });
      return;
    }
    setLicense(result);
    setStatus('valid');
    ipcRenderer.send('license-features', { features: result.features || [] });
  }

  async function bootCheck() {
    setStatus('loading');
    const appVer = await ipcRenderer.invoke('get-app-version').catch(() => null) || appVersion || '0.0.0';
    try {
      const savedKey = await ipcRenderer.invoke('license-load-key');

      if (!savedKey) {
        // No license — start (or resume) trial mode using DB-defined config.
        let db = null;
        try { db = await fetchDatabase(); }
        catch { try { db = JSON.parse(localStorage.getItem('lplot_license_db') || 'null'); } catch {} }
        await startTrial(db || {});
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
          setOfflineOk(true);
          applyLicense(cached, appVer);
          return;
        }
        setErrMsg('Cannot reach the license server and no offline cache found. Please connect to the internet.');
        setStatus('error');
        return;
      }

      const result = await verifyKey(savedKey, db);
      if (result.valid) {
        localStorage.setItem('lplot_license_result', JSON.stringify({ ...result, _cacheVersion: 2 }));
        applyLicense(result, appVer);
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
      applyLicense(result, appVersion);
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
    setBlockedInfo(null);
    setShowAbout(false);
    setStatus('activating');
    // Nudge the OS window back into keyboard focus (fixes un-typeable field
    // after deactivating from a menu confirm dialog).
    ipcRenderer.invoke('focus-window').catch(() => {});
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

  // ── Version-blocked — app too old for this license ─────────────────────
  if (status === 'blocked') {
    return (
      <div style={S.overlay}>
        <div style={S.card}>
          <Logo />
          <h2 style={S.heading}>Update Required</h2>
          <p style={S.sub}>
            This license requires <strong style={{ color: '#e0e0e0' }}>version {blockedInfo?.minVersion}</strong> or newer.
            You are running <strong style={{ color: '#e0e0e0' }}>v{appVersion}</strong>.
            Please update to continue.
          </p>
          <button style={S.btn} onClick={() => setShowAbout(true)}>Check for Updates / About</button>
          <button style={{ ...S.btn, background: 'transparent', border: '1px solid #2a4060', color: '#a0aec0' }}
            onClick={handleDeactivate}>
            Use a Different License
          </button>
          {showAbout && (
            // Wrap in a higher stacking context so the modal sits above this
            // full-screen blocked overlay (which is z-index 9999).
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
              <AppSettingsModal
                onClose={() => setShowAbout(false)}
                maxVersion={license?.maxVersion || null}
              />
            </div>
          )}
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
              ref={inputRef}
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

  // ── Valid / Trial — render app with context ────────────────────────────
  const isTrial = status === 'trial' || license?.trial;
  const hasFeature = (featureId) => checkFeature(license, featureId);

  const trialBanner = isTrial && trialDaysLeft !== null ? (
    <div style={{ background:'#2a1a00', borderBottom:'1px solid #b7791f', padding:'5px 16px', fontSize:12, color:'#f6e05e', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
      <span>⏳ Trial mode — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining. Saving, loading, exporting and importing are disabled.</span>
      <button onClick={() => setStatus('activating')}
        style={{ marginLeft:8, padding:'2px 12px', background:'transparent', border:'1px solid #b7791f', borderRadius:3, color:'#f6e05e', cursor:'pointer', fontSize:11 }}>
        Activate License
      </button>
    </div>
  ) : null;

  return (
    <LicenseContext.Provider value={{
      license,
      offlineOk,
      hasFeature,
      deactivate: handleDeactivate,
      trial: isTrial,
      maxVersion: license?.maxVersion || null,
      appVersion,
    }}>
      {trialBanner}
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
