import React, { useEffect, useState } from 'react';
import ModalA11y from './ModalA11y';
import Icon from './Icon';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

// Start screen shown on launch (unless disabled in App Settings). Lists recent
// files with their modified date and fixture count, plus quick actions.
function fileInfo(fp) {
  try {
    const fs = window.require('fs');
    const st = fs.statSync(fp);
    let fixtures = null, plots = null;
    if (!fp.toLowerCase().endsWith('.mvr') && st.size < 8 * 1024 * 1024) {
      try {
        const proj = JSON.parse(fs.readFileSync(fp, 'utf8'));
        fixtures = (proj.drawings || []).reduce((n, d) => n + (d.fixtures?.length || 0), 0);
        plots = proj.drawings?.length || 0;
      } catch {}
    }
    return { exists: true, mtime: st.mtime, fixtures, plots };
  } catch { return { exists: false }; }
}

function relTime(d) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString();
}

export default function WelcomeScreen({ onClose, onNew, onOpen, onOpenRecent, onTemplates, onImportMVR, canTemplates, canImportMVR, isTrial, userName }) {
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    if (!ipcRenderer) { setRecent([]); return; }
    ipcRenderer.invoke('get-pref', 'recentFiles').then(list => {
      setRecent((list || []).map(fp => ({ fp, name: fp.split(/[\\/]/).pop(), dir: fp.replace(/[\\/][^\\/]*$/, ''), ...fileInfo(fp) })));
    }).catch(() => setRecent([]));
  }, []);

  const Action = ({ icon, title, sub, onClick, disabled, autoFocus }) => (
    <button style={{ ...styles.action, ...(disabled ? styles.disabled : {}) }} onClick={onClick} disabled={disabled} {...(autoFocus ? { 'data-autofocus': true } : {})}>
      <span style={styles.actionIcon}><Icon name={icon} size={18} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={styles.actionTitle}>{title}</span>
        <span style={styles.actionSub}>{sub}</span>
      </span>
    </button>
  );

  return (
    <div style={styles.overlay}>
      <ModalA11y onClose={onClose} label="Welcome">
        <div style={styles.box}>
          <div style={styles.header}>
            <div>
              <div style={styles.title}>Lighting Plot</div>
              <div style={styles.sub}>{userName ? `Welcome back, ${userName}.` : 'Welcome.'} What would you like to work on?</div>
            </div>
            <button style={styles.close} onClick={onClose} aria-label="Close welcome screen" title="Close (Esc)"><Icon name="close" size={16} /></button>
          </div>

          <div style={styles.body}>
            <div style={styles.actions}>
              <Action icon="rect" title="New blank plot" sub="Start from an empty drawing" onClick={onNew} autoFocus />
              <Action icon="pdf" title="Open…" sub=".lightplot or .mvr file" onClick={onOpen} disabled={isTrial} />
              {canTemplates && <Action icon="fixtures" title="From template" sub="Venue & project templates" onClick={onTemplates} />}
              {canImportMVR && <Action icon="view3d" title="Import MVR…" sub="Vectorworks, grandMA, Capture…" onClick={onImportMVR} disabled={isTrial} />}
              {isTrial && <div style={styles.trial}>Trial mode: opening and saving files is disabled.</div>}
            </div>

            <div style={styles.recentCol}>
              <div style={styles.sectionTitle}>Recent files</div>
              {recent === null && <div style={styles.empty}>Loading…</div>}
              {recent?.length === 0 && <div style={styles.empty}>No recent files yet. Saved and opened plots will appear here.</div>}
              <div style={styles.recentList}>
                {recent?.map(r => (
                  <button key={r.fp} style={{ ...styles.recent, ...(!r.exists || isTrial ? styles.disabled : {}) }}
                    disabled={!r.exists || isTrial} onClick={() => onOpenRecent(r.fp)} title={r.exists ? r.fp : `${r.fp} (file not found)`}>
                    <span style={styles.fileBadge}>{r.name.toLowerCase().endsWith('.mvr') ? 'MVR' : 'LP'}</span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={styles.recentName}>{r.name}</span>
                      <span style={styles.recentDir}>{r.dir}</span>
                    </span>
                    <span style={styles.recentMeta}>
                      {!r.exists ? <span style={{ color: 'var(--danger-text)' }}>Missing</span> : <>
                        <span>{relTime(r.mtime)}</span>
                        {r.fixtures != null && <span>{r.fixtures} fixture{r.fixtures !== 1 ? 's' : ''}{r.plots > 1 ? ` · ${r.plots} plots` : ''}</span>}
                      </>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={styles.footer}>
            Tip: press <kbd style={styles.kbd}>Ctrl</kbd>+<kbd style={styles.kbd}>K</kbd> anywhere to search every command. The welcome screen can be turned off in App Settings.
          </div>
        </div>
      </ModalA11y>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: 820, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', borderRadius: 12, boxShadow: '0 24px 70px var(--shadow)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '22px 26px 14px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' },
  sub: { fontSize: 13, color: 'var(--text-dim)', marginTop: 4 },
  close: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' },
  body: { display: 'flex', gap: 22, padding: '18px 26px', minHeight: 0, flex: 1, flexWrap: 'wrap' },
  actions: { display: 'flex', flexDirection: 'column', gap: 8, width: 250, flexShrink: 0 },
  action: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', textAlign: 'left' },
  actionIcon: { width: 34, height: 34, borderRadius: 8, background: 'var(--border)', color: 'var(--accent-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionTitle: { fontSize: 13, fontWeight: 600 },
  actionSub: { fontSize: 11, color: 'var(--text-dim)', marginTop: 1 },
  trial: { fontSize: 11, color: 'var(--warn-text)', padding: '4px 2px' },
  recentCol: { flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', minHeight: 0 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  recentList: { display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 360 },
  recent: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'transparent', border: '1px solid transparent', borderRadius: 6, cursor: 'pointer', color: 'var(--text)' },
  fileBadge: { width: 34, height: 34, borderRadius: 6, background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recentName: { display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recentDir: { display: 'block', fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recentMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 },
  empty: { fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
  footer: { padding: '10px 26px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)' },
  kbd: { fontFamily: 'inherit', fontSize: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 4px' },
};
