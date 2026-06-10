import React, { useState, useEffect } from 'react';
const { ipcRenderer } = require('electron');

export default function UpdaterDialog({ onClose }) {
  const [state, setState] = useState('checking'); // checking | available | downloading | downloaded | uptodate | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const onAvailable = (_, info) => { setState('available'); setUpdateInfo(info); };
    const onNotAvailable = () => setState('uptodate');
    const onProgress = (_, p) => { setState('downloading'); setProgress(p.percent); };
    const onDownloaded = () => setState('downloaded');
    const onError = (_, msg) => { setState('error'); setErrorMsg(msg); };

    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-not-available', onNotAvailable);
    ipcRenderer.on('update-download-progress', onProgress);
    ipcRenderer.on('update-downloaded', onDownloaded);
    ipcRenderer.on('update-error', onError);

    return () => {
      ipcRenderer.removeListener('update-available', onAvailable);
      ipcRenderer.removeListener('update-not-available', onNotAvailable);
      ipcRenderer.removeListener('update-download-progress', onProgress);
      ipcRenderer.removeListener('update-downloaded', onDownloaded);
      ipcRenderer.removeListener('update-error', onError);
    };
  }, []);

  function handleDownload() {
    setState('downloading');
    ipcRenderer.invoke('download-update');
  }

  function handleInstall() {
    ipcRenderer.invoke('install-update');
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.card}>
        <div style={S.header}>
          <span style={S.title}>Software Update</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {state === 'checking' && (
            <p style={S.msg}>Checking for updates…</p>
          )}

          {state === 'uptodate' && (
            <>
              <div style={S.icon}>✓</div>
              <p style={S.msg}>Lighting Plot is up to date.</p>
              <button style={S.btn} onClick={onClose}>Close</button>
            </>
          )}

          {state === 'available' && updateInfo && (
            <>
              <div style={S.icon}>↑</div>
              <p style={S.msg}>
                <strong style={{ color: '#e0e0e0' }}>Version {updateInfo.version}</strong> is available.
              </p>
              {updateInfo.releaseNotes && (
                <div style={S.notes}
                  dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }} />
              )}
              <div style={S.btnRow}>
                <button style={{ ...S.btn, background: 'none', border: '1px solid #1a3a5c', color: '#718096' }} onClick={onClose}>Later</button>
                <button style={S.btn} onClick={handleDownload}>Download & Install</button>
              </div>
            </>
          )}

          {state === 'downloading' && (
            <>
              <p style={S.msg}>Downloading update… {progress}%</p>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, width: `${progress}%` }} />
              </div>
            </>
          )}

          {state === 'downloaded' && (
            <>
              <div style={S.icon}>✓</div>
              <p style={S.msg}>Update downloaded. Restart to apply.</p>
              <div style={S.btnRow}>
                <button style={{ ...S.btn, background: 'none', border: '1px solid #1a3a5c', color: '#718096' }} onClick={onClose}>Later</button>
                <button style={S.btn} onClick={handleInstall}>Restart & Install</button>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <p style={{ ...S.msg, color: '#fc8181' }}>Update check failed.</p>
              <p style={{ color: '#718096', fontSize: 11, textAlign: 'center' }}>{errorMsg}</p>
              <button style={S.btn} onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  card:    { background: '#16213e', border: '1px solid #0f3460', borderRadius: 8, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #0f3460' },
  title:   { color: '#e0e0e0', fontWeight: 700, fontSize: 15 },
  closeBtn:{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 18 },
  body:    { padding: '28px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  icon:    { fontSize: 32, color: '#4a90d9' },
  msg:     { color: '#c0c8d8', fontSize: 14, textAlign: 'center', margin: 0 },
  notes:   { background: '#0d1b2a', border: '1px solid #1a3a5c', borderRadius: 4, padding: '10px 14px', fontSize: 11, color: '#a0aec0', maxHeight: 140, overflowY: 'auto', width: '100%', boxSizing: 'border-box' },
  btnRow:  { display: 'flex', gap: 10, marginTop: 4 },
  btn:     { padding: '9px 22px', background: '#4a90d9', border: 'none', borderRadius: 5, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  barTrack:{ width: '100%', height: 6, background: '#0d1b2a', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', background: '#4a90d9', borderRadius: 3, transition: 'width 0.2s' },
};
