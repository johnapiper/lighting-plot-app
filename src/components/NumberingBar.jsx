import React from 'react';

// Floating bar shown over the canvas while click-to-number is active.
// App owns the state: { field: 'channel'|'unit', next, step, count, warning }.
export default function NumberingBar({ state, onChange, onSkip, onBack, onDone }) {
  const num = (key) => ({
    type: 'number', value: state[key],
    onChange: e => onChange({ [key]: e.target.value === '' ? '' : Number(e.target.value) }),
    onKeyDown: e => { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); e.stopPropagation(); },
  });
  return (
    <div style={S.wrap} role="toolbar" aria-label="Click to number">
      <span style={S.title}>🔢 Click fixtures to number them</span>
      <select style={S.select} value={state.field} onChange={e => onChange({ field: e.target.value })}
        title="Which field to fill. Channel also sets the DMX address in the fixture's universe (as the Inspector does).">
        <option value="channel">Channel</option>
        <option value="unit">Unit #</option>
      </select>
      <label style={S.label}>Next <input style={{ ...S.input, width: 64 }} min={1} {...num('next')} /></label>
      <label style={S.label}>Step <input style={{ ...S.input, width: 44 }} min={1} {...num('step')} /></label>
      <span style={S.count}>{state.count} done</span>
      <button style={S.btn} onClick={onSkip} title="Skip this number without assigning it">Skip</button>
      <button style={S.btn} onClick={onBack} disabled={!state.count} title="Undo the last assignment and reuse its number">Back</button>
      <button style={{ ...S.btn, ...S.done }} onClick={onDone} title="Finish (Esc)">Done</button>
      {state.warning && <div style={S.warn}>⚠ {state.warning}</div>}
    </div>
  );
}

const S = {
  wrap: { position:'absolute', top:28, left:'50%', transform:'translateX(-50%)', zIndex:20, display:'flex', flexWrap:'wrap', alignItems:'center', gap:8,
          background:'var(--bg-panel)', border:'1px solid var(--accent)', borderRadius:6, padding:'6px 10px', boxShadow:'0 6px 24px rgba(0,0,0,0.6)', fontSize:12, color:'var(--text)', maxWidth:'90%' },
  title: { color:'var(--accent-soft)', fontWeight:600 },
  label: { display:'flex', alignItems:'center', gap:4, color:'var(--text-muted)' },
  input: { background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:3, color:'var(--text)', fontSize:12, padding:'2px 5px', outline:'none' },
  select: { background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:3, color:'var(--text)', fontSize:12, padding:'2px 4px' },
  count: { color:'var(--text-dim)', fontVariantNumeric:'tabular-nums' },
  btn: { background:'var(--border)', border:'1px solid #1a4a7a', borderRadius:4, color:'var(--text-muted)', padding:'3px 10px', cursor:'pointer', fontSize:11 },
  done: { borderColor:'var(--accent)', color:'var(--accent-soft)', fontWeight:600 },
  warn: { flexBasis:'100%', color:'var(--warn-text)', fontSize:11 },
};
