import React, { useState } from 'react';
import { EXAMPLE_PRESETS, newPreset, sanitizePresets } from '../rigging/presets';

/**
 * Editor for the project's bar / hoist rating presets. The built-in rows are
 * illustrative examples — replace them with your equipment's manufacturer data.
 */
export default function RigPresetsModal({ presets, onSave, onClose }) {
  const [rows, setRows] = useState(() => presets.map(p => ({ ...p })));
  const set = (i, f) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...f } : r)));
  const save = () => { onSave(sanitizePresets(rows)); onClose(); };
  const dropped = rows.length - sanitizePresets(rows).length;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}><span>⚙ Rigging presets</span><button style={S.x} onClick={onClose} aria-label="Close">✕</button></div>
        <div style={S.warn}>
          The built-in rows are <b>examples only</b>. Real capacities depend on span, load type and the manufacturer's tables —
          enter the figures from your own equipment's documentation. Presets are saved in this project.
        </div>
        <div style={S.body}>
          <table style={S.table}>
            <thead>
              <tr><th style={S.th}>Name</th><th style={S.th}>Type</th><th style={S.thR}>Weight kg/m</th><th style={S.thR}>Capacity kg</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={S.td}><input style={{ ...S.inp, width: 250 }} value={r.name} onChange={e => set(i, { name: e.target.value })} /></td>
                  <td style={S.td}>
                    <select style={S.inp} value={r.kind} onChange={e => set(i, { kind: e.target.value, weightKgPerM: e.target.value === 'bar' ? (r.weightKgPerM ?? 2) : undefined })}>
                      <option value="bar">Bar / truss</option><option value="hoist">Hoist</option>
                    </select>
                  </td>
                  <td style={S.tdR}>{r.kind === 'bar'
                    ? <input style={{ ...S.inp, width: 70, textAlign: 'right' }} value={r.weightKgPerM ?? ''} onChange={e => set(i, { weightKgPerM: e.target.value })} />
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                  <td style={S.tdR}><input style={{ ...S.inp, width: 70, textAlign: 'right' }} value={r.capacityKg ?? ''} onChange={e => set(i, { capacityKg: e.target.value })} /></td>
                  <td style={S.td}><button style={S.del} title="Delete" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={S.btn} onClick={() => setRows(rs => [...rs, newPreset('bar')])}>+ Bar / truss</button>
            <button style={S.btn} onClick={() => setRows(rs => [...rs, newPreset('hoist')])}>+ Hoist</button>
            <div style={{ flex: 1 }} />
            <button style={S.btn} onClick={() => setRows(EXAMPLE_PRESETS.map(p => ({ ...p })))}>Reset to examples</button>
          </div>
          {dropped > 0 && <div style={S.err}>{dropped} row{dropped === 1 ? '' : 's'} need a name and a capacity above 0 — they won't be saved.</div>}
        </div>
        <div style={S.footer}>
          <button style={S.cancel} onClick={onClose}>Cancel</button>
          <button style={S.go} onClick={save}>Save presets</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250 },
  modal: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, width: 640, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.8)', color: 'var(--text)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 },
  x: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 },
  warn: { padding: '8px 16px', fontSize: 11, color: 'var(--warn-text)', lineHeight: 1.45, borderBottom: '1px solid var(--border)' },
  body: { padding: '10px 16px', overflow: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, padding: '2px 4px', textTransform: 'uppercase' },
  thR: { textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, padding: '2px 4px', textTransform: 'uppercase' },
  td: { padding: '2px 4px' }, tdR: { padding: '2px 4px', textAlign: 'right' },
  inp: { background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: 3, color: 'var(--text)', fontSize: 12, padding: '3px 6px', outline: 'none', boxSizing: 'border-box' },
  del: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 },
  btn: { padding: '4px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 },
  err: { color: 'var(--danger-text)', fontSize: 11, marginTop: 6 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)' },
  cancel: { padding: '6px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 },
  go: { padding: '6px 18px', background: 'var(--border)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
};
