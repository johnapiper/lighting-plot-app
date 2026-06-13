import React, { useState } from 'react';

export default function UniverseOverviewModal({ fixtures, onClose }) {
  const [universe, setUniverse] = useState(1);

  // Build channel map for selected universe
  const channelMap = {};
  (fixtures || []).forEach(f => {
    if (!f.dmxAddress) return;
    const parts = f.dmxAddress.split('/');
    if (parts.length !== 2) return;
    const u = parseInt(parts[0], 10), ch = parseInt(parts[1], 10);
    if (u !== universe || isNaN(ch) || ch < 1 || ch > 512) return;
    if (!channelMap[ch]) channelMap[ch] = [];
    channelMap[ch].push(f);
  });

  // Find all universes in use
  const universes = [...new Set(
    (fixtures || []).map(f => {
      const p = (f.dmxAddress||'').split('/');
      return p.length === 2 ? parseInt(p[0], 10) : null;
    }).filter(Boolean)
  )].sort((a,b) => a-b);
  if (!universes.includes(1)) universes.unshift(1);

  const conflicts = new Set();
  Object.entries(channelMap).forEach(([ch, arr]) => { if (arr.length > 1) conflicts.add(Number(ch)); });

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>🌐 Universe Overview</span>
          <div style={{ display:'flex', gap:6 }}>
            {universes.map(u => (
              <button key={u} style={{ ...S.uBtn, ...(u === universe ? S.uBtnActive : {}) }} onClick={() => setUniverse(u)}>U{u}</button>
            ))}
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <div style={S.legend}>
            <span style={S.dot('#2d3748')}/> Empty &nbsp;
            <span style={S.dot('#1a4a2e')}/> Patched &nbsp;
            <span style={S.dot('#4a1a1a')}/> Conflict
          </div>
          <div style={S.grid}>
            {Array.from({ length: 512 }, (_, i) => {
              const ch = i + 1;
              const arr = channelMap[ch];
              const conflict = conflicts.has(ch);
              const used = !!arr;
              const bg = conflict ? '#4a1a1a' : used ? '#1a4a2e' : '#1a2030';
              const tc = conflict ? '#fc8181' : used ? '#68d391' : '#4a5568';
              return (
                <div key={ch} style={{ ...S.cell, background: bg, color: tc }}
                  title={arr ? arr.map(f => `${f.type || f.unit} (${f.label||f.unit||''}) ch${f.channel||'?'}`).join(', ') : `Ch ${ch} — empty`}>
                  {used ? (conflict ? '!' : ch) : ch <= 128 ? ch : ''}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:10, fontSize:11, color:'#718096' }}>
            Universe {universe}: {Object.keys(channelMap).length} channels patched
            {conflicts.size > 0 && <span style={{ color:'#fc8181', marginLeft:8 }}>⚠ {conflicts.size} conflict{conflicts.size!==1?'s':''}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:680, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', gap:10, justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  uBtn: { padding:'3px 10px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:3, color:'#a0aec0', cursor:'pointer', fontSize:11 },
  uBtnActive: { background:'#0f3460', color:'#4a90d9', borderColor:'#4a90d9' },
  body: { padding:'16px', overflowY:'auto', flex:1 },
  legend: { display:'flex', alignItems:'center', marginBottom:10, fontSize:11, color:'#a0aec0' },
  dot: (c) => ({ display:'inline-block', width:10, height:10, borderRadius:2, background:c, marginRight:4 }),
  grid: { display:'grid', gridTemplateColumns:'repeat(32, 1fr)', gap:2 },
  cell: { fontSize:7, textAlign:'center', padding:'2px 0', borderRadius:2, userSelect:'none', cursor:'default', lineHeight:'14px', height:14 },
};
