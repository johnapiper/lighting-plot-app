import React, { useState, useEffect } from 'react';
import { FEATURES as ALL_FEATURES } from '../license/features.js';

const { ipcRenderer } = require('electron');

export default function MyLicenseModal({ license, onClose, onChangeLicense }) {
  const [copied, setCopied] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  useEffect(() => {
    ipcRenderer.invoke('license-load-key').then(k => setLicenseKey(k || '')).catch(() => {});
  }, []);

  function copyKey() {
    if (licenseKey) {
      navigator.clipboard.writeText(licenseKey).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  const entry = license?.entry || {};
  const features = license?.features || [];
  const permittedFeatures = ALL_FEATURES.filter(f => features.includes(f.id));

  const groupedFeatures = permittedFeatures.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  const expiresAt = entry.expiresAt;
  const expiryLabel = expiresAt
    ? new Date(expiresAt) < new Date() ? '⚠ Expired' : new Date(expiresAt).toLocaleDateString()
    : 'Never';

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>My License</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* Holder info */}
          <Section title="License Holder">
            <Row label="Name"  value={entry.name  || '—'} />
            <Row label="Email" value={entry.email || '—'} />
            <Row label="Expires" value={expiryLabel} warn={expiryLabel === '⚠ Expired'} />
          </Section>

          {/* Key display */}
          <Section title="License Key">
            <div style={S.keyBox}>
              <code style={S.keyText}>{licenseKey || '—'}</code>
              <button style={{ ...S.ghostBtn, ...(copied ? S.copiedBtn : {}) }} onClick={copyKey}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </Section>

          {/* Permitted features */}
          <Section title="Features Included in Your License">
            {Object.keys(groupedFeatures).length === 0 ? (
              <p style={{ color: '#718096', fontSize: 12 }}>No features assigned.</p>
            ) : (
              Object.entries(groupedFeatures).map(([group, feats]) => (
                <div key={group} style={{ marginBottom: 10 }}>
                  <div style={S.groupLabel}>{group}</div>
                  <div style={S.featureList}>
                    {feats.map(f => (
                      <div key={f.id} style={S.featureChip}>✓ {f.label}</div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </Section>
        </div>

        <div style={S.footer}>
          <button style={S.changeBtn} onClick={onChangeLicense}>Change License Key</button>
          <button style={S.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={S.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, warn }) {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={{ ...S.rowValue, ...(warn ? { color: '#fc8181' } : {}) }}>{value}</span>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  },
  modal: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid #0f3460',
    fontSize: 14, fontWeight: 700, color: '#e0e0e0',
  },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16 },
  body: { padding: '18px 20px 8px', overflowY: 'auto', flex: 1 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 18px', borderTop: '1px solid #0f3460' },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid #0f3460',
  },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  rowLabel: { fontSize: 12, color: '#a0aec0' },
  rowValue: { fontSize: 12, color: '#e0e0e0', fontWeight: 600 },
  keyBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 5,
    padding: '8px 12px',
  },
  keyText: { flex: 1, fontSize: 13, color: '#60b0ff', letterSpacing: '0.05em', wordBreak: 'break-all' },
  ghostBtn: {
    padding: '4px 10px', background: 'transparent', border: '1px solid #2a4060',
    borderRadius: 4, color: '#718096', cursor: 'pointer', fontSize: 11, flexShrink: 0,
  },
  copiedBtn: { borderColor: '#68d391', color: '#68d391' },
  groupLabel: { fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 },
  featureList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  featureChip: {
    fontSize: 11, color: '#68d391', background: 'rgba(104,211,145,0.08)',
    border: '1px solid rgba(104,211,145,0.25)', borderRadius: 4, padding: '2px 8px',
  },
  changeBtn: {
    padding: '6px 14px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  cancelBtn: {
    padding: '6px 16px', background: 'transparent', border: '1px solid #0f3460',
    borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 12,
  },
};
