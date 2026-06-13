import React, { useState, useEffect } from 'react';

const { ipcRenderer } = require('electron');

export default function AppSettingsModal({ onClose, autoSaveEnabled = true, onChangeAutoSave, pendingUpdateVersion = null }) {
  const [appVersion, setAppVersion] = useState('—');
  // idle | checking | uptodate | available | downloading | downloaded | error
  const [updateStatus, setUpdateStatus]   = useState(pendingUpdateVersion ? 'available' : 'idle');
  const [latestVersion, setLatestVersion] = useState(pendingUpdateVersion);
  const [dlProgress, setDlProgress]       = useState(0);
  const [errMsg, setErrMsg]               = useState('');

  useEffect(() => {
    ipcRenderer.invoke('get-app-version').then(v => v && setAppVersion(v)).catch(() => {});

    const onAvailable    = (_, info) => { setLatestVersion(info.version); setUpdateStatus('available'); };
    const onNotAvailable = ()        => setUpdateStatus('uptodate');
    const onProgress     = (_, p)   => { setUpdateStatus('downloading'); setDlProgress(p.percent); };
    const onDownloaded   = ()        => setUpdateStatus('downloaded');
    const onError        = (_, msg) => { setErrMsg(msg); setUpdateStatus('error'); };

    ipcRenderer.on('update-available',        onAvailable);
    ipcRenderer.on('update-not-available',    onNotAvailable);
    ipcRenderer.on('update-download-progress',onProgress);
    ipcRenderer.on('update-downloaded',       onDownloaded);
    ipcRenderer.on('update-error',            onError);

    return () => {
      ipcRenderer.removeListener('update-available',         onAvailable);
      ipcRenderer.removeListener('update-not-available',     onNotAvailable);
      ipcRenderer.removeListener('update-download-progress', onProgress);
      ipcRenderer.removeListener('update-downloaded',        onDownloaded);
      ipcRenderer.removeListener('update-error',             onError);
    };
  }, []);

  function checkForUpdates() {
    setUpdateStatus('checking');
    setErrMsg('');
    ipcRenderer.invoke('check-for-updates');
  }

  function downloadUpdate() {
    setUpdateStatus('downloading');
    ipcRenderer.invoke('download-update');
  }

  function installUpdate() {
    ipcRenderer.invoke('install-update');
  }

  function openGitHub() {
    require('electron').shell.openExternal('https://github.com/johnapiper/lighting-plot-app');
  }

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
            {latestVersion && (
              <div style={S.row}>
                <span style={S.rowLabel}>Latest version</span>
                <span style={S.rowValue}>v{latestVersion}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              {(updateStatus === 'idle' || updateStatus === 'uptodate' || updateStatus === 'error') && (
                <button style={S.primaryBtn} onClick={checkForUpdates}>
                  🔄 Check for Updates
                </button>
              )}
              {updateStatus === 'checking' && (
                <span style={{ color: '#a0aec0', fontSize: 12 }}>Checking…</span>
              )}
              {updateStatus === 'uptodate' && (
                <span style={{ color: '#68d391', fontSize: 12 }}>✓ Up to date (v{appVersion})</span>
              )}
              {updateStatus === 'available' && (
                <button style={{ ...S.primaryBtn, borderColor: '#fbbf24', color: '#fbbf24' }} onClick={downloadUpdate}>
                  ⬇ Download v{latestVersion}
                </button>
              )}
              {updateStatus === 'downloading' && (
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#a0aec0', fontSize: 12, marginBottom: 4 }}>Downloading… {dlProgress}%</div>
                  <div style={{ background: '#0d1b2a', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${dlProgress}%`, height: '100%', background: '#4a90d9', transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              {updateStatus === 'downloaded' && (
                <button style={{ ...S.primaryBtn, borderColor: '#68d391', color: '#68d391' }} onClick={installUpdate}>
                  ↺ Restart & Install
                </button>
              )}
              {updateStatus === 'error' && (
                <span style={{ color: '#fc8181', fontSize: 12 }}>{errMsg || 'Update check failed.'}</span>
              )}
            </div>
          </Section>

          {/* ── Auto-save ── */}
          <Section title="Auto-Save">
            <div style={S.row}>
              <span style={S.rowLabel}>Auto-save project every 2 minutes</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoSaveEnabled}
                  onChange={e => onChangeAutoSave?.(e.target.checked)} />
                <span style={{ fontSize: 12, color: autoSaveEnabled ? '#68d391' : '#718096' }}>
                  {autoSaveEnabled ? 'On' : 'Off'}
                </span>
              </label>
            </div>
            <div style={{ fontSize: 10, color: '#718096', marginTop: 4 }}>
              If the app closes unexpectedly, you will be offered to restore the last auto-saved session on next launch.
            </div>
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
