import React, { useState } from 'react';

export default function FixtureSwapModal({ fixtureIds = [], allFixtureTypes = [], customFixtureTypes = [], onSwap, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const allTypes = [...allFixtureTypes, ...customFixtureTypes];
  const filtered = allTypes.filter(ft =>
    !search || ft.name?.toLowerCase().includes(search.toLowerCase()) || ft.manufacturer?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>🔄 Swap Fixture Type</span>
          <span style={S.sub}>{fixtureIds.length} fixture{fixtureIds.length !== 1 ? 's' : ''} selected</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.searchRow}>
          <input style={S.input} autoFocus placeholder="Search fixture types…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={S.body}>
          {filtered.length === 0 && <div style={S.empty}>No fixture types found.</div>}
          {filtered.map(ft => (
            <div key={ft.id || ft.name} style={{ ...S.row, ...(selected === (ft.id || ft.name) ? S.rowSel : {}) }}
              onClick={() => setSelected(ft.id || ft.name)}>
              <span style={S.ftName}>{ft.name}</span>
              {ft.manufacturer && <span style={S.ftMfr}>{ft.manufacturer}</span>}
              {ft.channels && <span style={S.ftCh}>{ft.channels}ch</span>}
            </div>
          ))}
        </div>
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...S.swapBtn, ...(selected ? {} : S.disabled) }}
            disabled={!selected}
            onClick={() => { if (selected) { onSwap(fixtureIds, selected); onClose(); } }}>
            Swap
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:420, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  sub: { fontSize:11, color:'#718096', marginLeft:'auto', marginRight:8 },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  searchRow: { padding:'10px 16px', borderBottom:'1px solid #0f3460' },
  input: { width:'100%', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:4, color:'#e0e0e0', padding:'6px 10px', fontSize:12, outline:'none', boxSizing:'border-box' },
  body: { overflowY:'auto', flex:1 },
  empty: { padding:'24px', color:'#4a5568', fontSize:12, textAlign:'center' },
  row: { display:'flex', alignItems:'center', gap:8, padding:'8px 16px', cursor:'pointer', borderBottom:'1px solid #0d1b2a', transition:'background 0.1s' },
  rowSel: { background:'#0f3460' },
  ftName: { flex:1, fontSize:12, color:'#e0e0e0' },
  ftMfr: { fontSize:10, color:'#718096' },
  ftCh: { fontSize:10, color:'#4a90d9', background:'#0d1b2a', padding:'1px 5px', borderRadius:3 },
  footer: { display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 16px', borderTop:'1px solid #0f3460' },
  cancelBtn: { padding:'6px 16px', background:'transparent', border:'1px solid #0f3460', borderRadius:4, color:'#718096', cursor:'pointer', fontSize:12 },
  swapBtn: { padding:'6px 16px', background:'#0f3460', border:'1px solid #4a90d9', borderRadius:4, color:'#4a90d9', cursor:'pointer', fontSize:12, fontWeight:600 },
  disabled: { opacity:0.4, cursor:'not-allowed' },
};
