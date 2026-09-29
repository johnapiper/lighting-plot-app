import React, { useState } from 'react';

function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return `${days} days ago`;
}

// Shown on startup when an auto-save from an unfinished session exists.
// Requires an explicit choice: the recovery file is only deleted on Discard.
export default function RecoveryDialog({ recovery, onRestore, onDiscard }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const p = recovery.project || {};
  const drawings = p.drawings || [];
  const fixtureCount = drawings.reduce((n, d) => n + (d.fixtures?.length || 0), 0);
  const fileName = recovery.currentFile ? recovery.currentFile.split(/[\\/]/).pop() : 'Untitled project';
  const when = recovery.savedAt ? new Date(recovery.savedAt) : null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} role="dialog" aria-labelledby="recovery-title">
        <div style={styles.header} id="recovery-title">Recover unsaved work?</div>
        <div style={styles.body}>
          <p style={styles.p}>Lighting Plot didn't close cleanly last time. An auto-saved copy of your work was found:</p>
          <div style={styles.card}>
            <div style={styles.fileName}>📄 {fileName}</div>
            <div style={styles.meta}>
              {when ? <>Auto-saved {when.toLocaleString()} <span style={{ color: 'var(--text-faint)' }}>({timeAgo(recovery.savedAt)})</span></> : 'Auto-save time unknown'}
            </div>
            <div style={styles.meta}>
              {drawings.length} plot{drawings.length !== 1 ? 's' : ''} · {fixtureCount} fixture{fixtureCount !== 1 ? 's' : ''}
            </div>
            {recovery.currentFile && (
              <div style={{ ...styles.meta, color: 'var(--text-faint)', wordBreak: 'break-all' }}>{recovery.currentFile}</div>
            )}
          </div>
          {confirmDiscard && (
            <div style={styles.warn}>This permanently deletes the recovered copy. It can't be undone.</div>
          )}
        </div>
        <div style={styles.footer}>
          {confirmDiscard ? (
            <>
              <button style={styles.secondary} onClick={() => setConfirmDiscard(false)}>Back</button>
              <button style={styles.danger} onClick={onDiscard}>Yes, discard it</button>
            </>
          ) : (
            <>
              <button style={styles.secondary} onClick={() => setConfirmDiscard(true)}>Discard…</button>
              <button style={styles.primary} onClick={onRestore} autoFocus>Restore</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 },
  modal: { background: 'var(--bg-panel)', border: '1px solid var(--border-accent-2)', borderRadius: 8, width: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.9)', color: 'var(--text)' },
  header: { padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700 },
  body: { padding: '14px 18px' },
  p: { margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  card: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  fileName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  meta: { fontSize: 11, color: 'var(--text-muted)' },
  warn: { marginTop: 10, fontSize: 11, color: 'var(--danger-text)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 4, padding: '6px 8px' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border)' },
  primary: { padding: '6px 18px', background: 'var(--border)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  secondary: { padding: '6px 16px', background: 'transparent', border: '1px solid var(--sep)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 },
  danger: { padding: '6px 16px', background: 'var(--danger-bg)', border: '1px solid #e53e3e', borderRadius: 4, color: 'var(--danger-text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
};
