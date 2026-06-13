import React, { useState } from 'react';

export default function StudioSettingsModal({ meta, onSave, onClose }) {
  const [gridHeight, setGridHeight] = useState(String(meta?.gridHeight ?? 6000));
  const [rigHeight,  setRigHeight]  = useState(String(meta?.rigHeight  ?? 5500));
  const [gridSize,   setGridSize]   = useState(String(meta?.gridSize   ?? 1372));
  const [scale,      setScale]      = useState(String(meta?.scale      ?? 50));
  const [title,      setTitle]      = useState(meta?.title ?? '');

  function handleSave() {
    const gh = parseFloat(gridHeight);
    const rh = parseFloat(rigHeight);
    const gs = parseInt(gridSize, 10);
    const sc = parseInt(scale, 10);
    if (isNaN(gh) || gh <= 0) { alert('Grid height must be a positive number'); return; }
    if (isNaN(rh) || rh <= 0) { alert('Rig height must be a positive number'); return; }
    if (rh > gh) { alert('Rig height must be ≤ grid height'); return; }
    onSave({ gridHeight: gh, rigHeight: rh, gridSize: isNaN(gs) ? 1372 : gs, scale: isNaN(sc) ? 50 : sc, title });
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span>⚙️ Studio Settings</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          <Section title="Project">
            <Field label="Project Title" value={title} onChange={setTitle} />
            <Field label="Drawing Scale (1:N)" value={scale} onChange={setScale} type="number" />
            <Field label="Grid Size (world units)" value={gridSize} onChange={setGridSize} type="number" />
          </Section>

          <Section title="Venue / Studio">
            <Field
              label="Grid Height (mm)"
              value={gridHeight}
              onChange={setGridHeight}
              type="number"
              hint="Height of the lighting grid / ceiling void (default 6000mm = 6m)"
            />
            <Field
              label="Rig Trim Height (mm)"
              value={rigHeight}
              onChange={setRigHeight}
              type="number"
              hint="Trim height of trusses / bar hangs (default 5500mm = 5.5m)"
            />
            <div style={styles.note}>
              Cable routing uses these heights to calculate 3D cable lengths:
              fixtures hung on trusses drop to floor via the rig trim height.
            </div>
          </Section>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn}   onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid #0f3460' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#a0aec0', marginBottom: 3 }}>{label}</label>
      <input
        type={type}
        style={{ width: '100%', background: '#0d1b2a', border: '1px solid #0f3460',
          borderRadius: 4, color: '#e0e0e0', fontSize: 13, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <div style={{ fontSize: 10, color: '#718096', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
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
  closeBtn: {
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16,
  },
  body: { padding: '18px 18px 8px', overflowY: 'auto' },
  footer: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    padding: '12px 18px', borderTop: '1px solid #0f3460',
  },
  note: {
    fontSize: 10, color: '#718096', background: '#0d1b2a',
    padding: '7px 10px', borderRadius: 4, lineHeight: 1.5,
  },
  cancelBtn: {
    padding: '6px 16px', background: 'transparent', border: '1px solid #0f3460',
    borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 12,
  },
  saveBtn: {
    padding: '6px 18px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
};
