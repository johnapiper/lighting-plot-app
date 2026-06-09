import React, { useState, useEffect } from 'react';

const REPO = 'johnapiper/lighting-plot-app';

function semverGt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

export default function AppSettingsModal({ onClose }) {
  const [appVersion, setAppVersion] = useState('—');
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle | checking | uptodate | available | error
  const [latestVersion, setLatestVersion] = useState(null);
  const [releaseUrl, setReleaseUrl] = useState(null);

  useEffect(() => {
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.invoke('get-app-version').then(v => v && setAppVersion(v)).catch(() => {});
    }
  }, []);

  async function checkForUpdates() {
    setUpdateStatus('checking');
    try {
      const https = require('https');
      const data = await new Promise((resolve, reject) => {
        const req = https.get(
          `https://api.github.com/repos/${REPO}/releases/latest`,
          { headers: { 'User-Agent': 'lighting-plot-app' } },
          res => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('parse')); } });
          }
        );
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      const latest = (data.tag_name || '').replace(/^v/, '');
      if (!latest) { setUpdateStatus('error'); return; }
      setLatestVersion(latest);
      setReleaseUrl(data.html_url || `https://github.com/${REPO}/releases`);

      if (semverGt(latest, appVersion)) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('uptodate');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  function openRelease() {
    const url = releaseUrl || `https://github.com/${REPO}/releases`;
    if (window.require) {
      window.require('electron').shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  function openGitHub() {
    const url = `https://github.com/${REPO}`;
    if (window.require) window.require('electron').shell.openExternal(url);
    else window.open(url, '_blank');
  }

  const updateLabel = {
    idle:       null,
    checking:   <span style={{ color: '#a0aec0' }}>Checking…</span>,
    uptodate:   <span style={{ color: '#68d391' }}>✓ Up to date (v{appVersion})</span>,
    available:  <span style={{ color: '#fbbf24' }}>⬆ v{latestVersion} available — <a style={{ color: '#4a90d9', cursor: 'pointer' }} onClick={openRelease}>Download</a></span>,
    error:      <span style={{ color: '#fc8181' }}>Could not reach GitHub. Check your connection.</span>,
  }[updateStatus];

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <span>⚙ App Settings</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* ── Version & Updates ── */}
          <Section title="Version & Updates">
            <div style={S.row}>
              <span style={S.rowLabel}>Current version</span>
              <span style={S.rowValue}>v{appVersion}</span>
            </div>
            {latestVersion && updateStatus === 'available' && (
              <div style={S.row}>
                <span style={S.rowLabel}>Latest release</span>
                <span style={S.rowValue}>v{latestVersion}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <button style={S.primaryBtn} onClick={checkForUpdates} disabled={updateStatus === 'checking'}>
                {updateStatus === 'checking' ? '⏳ Checking…' : '🔄 Check for Updates'}
              </button>
              {updateLabel && <span style={{ fontSize: 12 }}>{updateLabel}</span>}
            </div>
            {updateStatus === 'available' && (
              <button style={{ ...S.primaryBtn, marginTop: 8, background: '#0f3460', borderColor: '#fbbf24', color: '#fbbf24' }}
                onClick={openRelease}>
                ⬇ Download Latest Installer
              </button>
            )}
          </Section>

          {/* ── About ── */}
          <Section title="About Lighting Plot">
            <div style={S.aboutBox}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>🎭</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e0e0e0', marginBottom: 4 }}>Lighting Plot</div>
              <div style={{ fontSize: 12, color: '#a0aec0', marginBottom: 12 }}>
                A theatrical lighting design CAD tool for drafting lighting rigs,
                managing fixture databases, and generating cable schedules.
              </div>
              <div style={S.legalBox}>
                <div style={{ fontWeight: 600, color: '#e0e0e0', marginBottom: 2 }}>
                  © {new Date().getFullYear()} John Piper. All rights reserved.
                </div>
                <div style={{ fontSize: 10, color: '#718096', lineHeight: 1.5 }}>
                  This software is proprietary and confidential. Unauthorised copying,
                  distribution or modification is strictly prohibited.
                </div>
              </div>
              <button style={{ ...S.ghostBtn, marginTop: 10 }} onClick={openGitHub}>
                View on GitHub
              </button>
            </div>
          </Section>
        </div>

        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 4, borderBottom: '1px solid #0f3460' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid #0f3460',
    fontSize: 14, fontWeight: 700, color: '#e0e0e0',
  },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16 },
  body: { padding: '20px 20px 8px', overflowY: 'auto', flex: 1 },
  footer: { display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid #0f3460' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rowLabel: { fontSize: 12, color: '#a0aec0' },
  rowValue: { fontSize: 12, color: '#e0e0e0', fontWeight: 600 },
  primaryBtn: {
    padding: '6px 16px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  ghostBtn: {
    padding: '5px 14px', background: 'transparent', border: '1px solid #2a4060',
    borderRadius: 4, color: '#718096', cursor: 'pointer', fontSize: 11,
  },
  cancelBtn: {
    padding: '6px 16px', background: 'transparent', border: '1px solid #0f3460',
    borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 12,
  },
  aboutBox: {
    background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 6,
    padding: '16px', textAlign: 'center',
  },
  legalBox: {
    background: '#0a1220', border: '1px solid #1a3050', borderRadius: 4,
    padding: '10px 14px', textAlign: 'left',
  },
};
