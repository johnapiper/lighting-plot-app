import React from 'react';

const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with default layers.',
    icon: '📄',
    meta: { title: 'Untitled', scale: 50, gridSize: 20, gridHeight: 6000, rigHeight: 5500, units: 'mm' },
  },
  {
    id: 'theatre',
    name: 'Theatre (Proscenium)',
    description: 'Standard proscenium theatre setup — FOH, flies, cyc, side positions.',
    icon: '🎭',
    meta: { title: 'Theatre Plot', scale: 50, gridSize: 500, gridHeight: 8000, rigHeight: 7000, units: 'mm' },
  },
  {
    id: 'concert',
    name: 'Concert / Live Event',
    description: 'Large grid for touring & concert rigs with truss positions.',
    icon: '🎵',
    meta: { title: 'Concert Rig', scale: 100, gridSize: 1000, gridHeight: 12000, rigHeight: 11000, units: 'mm' },
  },
  {
    id: 'tv-studio',
    name: 'TV Studio',
    description: 'TV studio ceiling grid with practical working heights.',
    icon: '📺',
    meta: { title: 'TV Studio', scale: 50, gridSize: 500, gridHeight: 5000, rigHeight: 4000, units: 'mm' },
  },
  {
    id: 'corporate',
    name: 'Corporate / Conference',
    description: 'Smaller-scale event space or conference room.',
    icon: '🏢',
    meta: { title: 'Corporate Event', scale: 25, gridSize: 250, gridHeight: 4000, rigHeight: 3500, units: 'mm' },
  },
];

export default function ProjectTemplatesDialog({ onSelect, onClose }) {
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>📁 New Project from Template</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          {TEMPLATES.map(t => (
            <div key={t.id} style={S.card} onClick={() => { onSelect(t); onClose(); }}>
              <span style={S.icon}>{t.icon}</span>
              <div style={S.cardText}>
                <div style={S.cardName}>{t.name}</div>
                <div style={S.cardDesc}>{t.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:460, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  body: { overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:8 },
  card: { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:6, cursor:'pointer', transition:'border-color 0.15s' },
  icon: { fontSize:28, flexShrink:0 },
  cardText: { flex:1 },
  cardName: { fontSize:13, fontWeight:700, color:'#e0e0e0', marginBottom:3 },
  cardDesc: { fontSize:11, color:'#718096' },
};
