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
          background:'#16213e', border:'1px solid #4a90d9', borderRadius:6, padding:'6px 10px', boxShadow:'0 6px 24px rgba(0,0,0,0.6)', fontSize:12, color:'#e0e0e0', maxWidth:'90%' },
  title: { color:'#90cdf4', fontWeight:600 },
  label: { display:'flex', alignItems:'center', gap:4, color:'#a0aec0' },
  input: { background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:3, color:'#e0e0e0', fontSize:12, padding:'2px 5px', outline:'none' },
  select: { background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:3, color:'#e0e0e0', fontSize:12, padding:'2px 4px' },
  count: { color:'#718096', fontVariantNumeric:'tabular-nums' },
  btn: { background:'#0f3460', border:'1px solid #1a4a7a', borderRadius:4, color:'#a0aec0', padding:'3px 10px', cursor:'pointer', fontSize:11 },
  done: { borderColor:'#4a90d9', color:'#90cdf4', fontWeight:600 },
  warn: { flexBasis:'100%', color:'#f6e05e', fontSize:11 },
};
