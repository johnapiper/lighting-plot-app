import React, { useState } from 'react';

/**
 * Array + Align/Distribute dialog for the current canvas selection.
 * mode: 'array' | 'align'. onApply receives a params object.
 */
export default function TransformModal({ mode, count, onApplyArray, onAlign, onClose }) {
  const [arrType, setArrType] = useState('grid');
  const [rows, setRows] = useState('2');
  const [cols, setCols] = useState('3');
  const [dx, setDx] = useState('500');
  const [dy, setDy] = useState('500');
  const [pCount, setPCount] = useState('6');
  const [pAngle, setPAngle] = useState('360');

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>{mode === 'array' ? '▦ Array' : '⊟ Align & Distribute'}</span>
          <button style={S.x} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          {mode === 'array' ? (
            <>
              <div style={S.tabs}>
                {['grid', 'polar'].map(t => (
                  <button key={t} style={{ ...S.tab, ...(arrType === t ? S.tabOn : {}) }} onClick={() => setArrType(t)}>
                    {t === 'grid' ? 'Rectangular' : 'Radial'}
                  </button>
                ))}
              </div>
              {arrType === 'grid' ? (
                <div style={S.grid2}>
                  <L label="Rows"><input style={S.inp} type="number" min="1" value={rows} onChange={e => setRows(e.target.value)} /></L>
                  <L label="Columns"><input style={S.inp} type="number" min="1" value={cols} onChange={e => setCols(e.target.value)} /></L>
                  <L label="Row spacing (mm)"><input style={S.inp} type="number" value={dy} onChange={e => setDy(e.target.value)} /></L>
                  <L label="Column spacing (mm)"><input style={S.inp} type="number" value={dx} onChange={e => setDx(e.target.value)} /></L>
                </div>
              ) : (
                <div style={S.grid2}>
                  <L label="Count (incl. original)"><input style={S.inp} type="number" min="2" value={pCount} onChange={e => setPCount(e.target.value)} /></L>
                  <L label="Total angle (°)"><input style={S.inp} type="number" value={pAngle} onChange={e => setPAngle(e.target.value)} /></L>
                  <div style={{ gridColumn: '1 / 3', fontSize: 11, color: '#718096' }}>Copies rotate around the centre of the selection.</div>
                </div>
              )}
              <div style={S.footer}>
                <button style={S.cancel} onClick={onClose}>Cancel</button>
                <button style={S.go} onClick={() => {
                  if (arrType === 'grid') onApplyArray({ type: 'grid', rows: +rows || 1, cols: +cols || 1, dx: +dx || 0, dy: +dy || 0 });
                  else onApplyArray({ type: 'polar', count: +pCount || 2, angle: +pAngle || 360 });
                }}>Create Array</button>
              </div>
            </>
          ) : (
            <>
              <div style={S.secLabel}>Align ({count} selected)</div>
              <div style={S.btnRow}>
                {[['left','⫷ Left'],['centerH','⊟ Centre H'],['right','Right ⫸']].map(([m,l]) =>
                  <button key={m} style={S.opt} onClick={() => onAlign(m)}>{l}</button>)}
              </div>
              <div style={S.btnRow}>
                {[['top','⊤ Top'],['centerV','⊟ Centre V'],['bottom','Bottom ⊥']].map(([m,l]) =>
                  <button key={m} style={S.opt} onClick={() => onAlign(m)}>{l}</button>)}
              </div>
              <div style={S.secLabel}>Distribute</div>
              <div style={S.btnRow}>
                <button style={S.opt} onClick={() => onAlign('distH')}>↔ Horizontally</button>
                <button style={S.opt} onClick={() => onAlign('distV')}>↕ Vertically</button>
              </div>
              <div style={S.footer}><button style={S.cancel} onClick={onClose}>Close</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }) {
  return <div><div style={{ fontSize: 11, color: '#718096', marginBottom: 3 }}>{label}</div>{children}</div>;
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:380, boxShadow:'0 12px 40px rgba(0,0,0,0.8)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  x: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  body: { padding:'14px 16px' },
  tabs: { display:'flex', gap:6, marginBottom:12 },
  tab: { flex:1, padding:'6px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:4, color:'#a0aec0', cursor:'pointer', fontSize:12 },
  tabOn: { background:'#0f3460', color:'#4a90d9', borderColor:'#4a90d9' },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  inp: { width:'100%', boxSizing:'border-box', background:'#0d1b2a', border:'1px solid #1a3a5c', borderRadius:4, color:'#e0e0e0', fontSize:13, padding:'6px 8px', outline:'none' },
  secLabel: { fontSize:10, fontWeight:700, color:'#4a90d9', textTransform:'uppercase', letterSpacing:'0.08em', margin:'4px 0 8px' },
  btnRow: { display:'flex', gap:6, marginBottom:8 },
  opt: { flex:1, padding:'7px 4px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:4, color:'#c0c8d8', cursor:'pointer', fontSize:11 },
  footer: { display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 },
  cancel: { padding:'6px 16px', background:'transparent', border:'1px solid #0f3460', borderRadius:4, color:'#a0aec0', cursor:'pointer', fontSize:12 },
  go: { padding:'6px 18px', background:'#0f3460', border:'1px solid #4a90d9', borderRadius:4, color:'#4a90d9', cursor:'pointer', fontSize:12, fontWeight:600 },
};
