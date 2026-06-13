import React, { useState } from 'react';
import { generateId } from '../canvas/geometry';

const BUILT_IN_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with default layers.',
    icon: '📄',
    meta: { title: 'Untitled', scale: 50, gridSize: 1372, gridHeight: 6000, rigHeight: 5500, units: 'mm' },
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

function getUserTemplates() {
  try { return JSON.parse(localStorage.getItem('lplot-user-templates') || '[]'); } catch { return []; }
}

export default function ProjectTemplatesDialog({ currentProject, onSelect, onClose }) {
  const [saveName, setSaveName] = useState('');
  const [userTemplates, setUserTemplates] = useState(getUserTemplates);

  function saveCurrentAsTemplate() {
    if (!saveName.trim() || !currentProject) return;
    const t = {
      id: generateId(),
      name: saveName.trim(),
      savedAt: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(currentProject)),
    };
    const updated = [...userTemplates, t];
    localStorage.setItem('lplot-user-templates', JSON.stringify(updated));
    setUserTemplates(updated);
    setSaveName('');
  }

  function deleteUserTemplate(id) {
    const updated = userTemplates.filter(t => t.id !== id);
    localStorage.setItem('lplot-user-templates', JSON.stringify(updated));
    setUserTemplates(updated);
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>📁 Project Templates</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Save current project as template */}
        <div style={S.saveRow}>
          <input style={S.input} placeholder="Save current project as template…" value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveCurrentAsTemplate(); }} />
          <button style={S.saveBtn} onClick={saveCurrentAsTemplate} disabled={!saveName.trim()}>Save</button>
        </div>

        <div style={S.body}>

          {/* User-saved templates */}
          {userTemplates.length > 0 && (
            <>
              <div style={S.sectionLabel}>Saved Templates</div>
              {userTemplates.map(t => (
                <div key={t.id} style={S.userRow}>
                  <div style={S.userRowMain}>
                    <span style={S.userName}>{t.name}</span>
                    <span style={S.userDate}>{new Date(t.savedAt).toLocaleDateString()}</span>
                  </div>
                  <button style={S.loadBtn} onClick={() => { onSelect(t); onClose(); }}>Load</button>
                  <button style={S.delBtn} onClick={() => deleteUserTemplate(t.id)}>✕</button>
                </div>
              ))}
              <div style={S.divider} />
            </>
          )}

          {/* Built-in templates */}
          <div style={S.sectionLabel}>Built-in Templates</div>
          {BUILT_IN_TEMPLATES.map(t => (
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
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:480, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  saveRow: { display:'flex', gap:8, padding:'12px 16px', borderBottom:'1px solid #0f3460' },
  input: { flex:1, background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:4, color:'#e0e0e0', padding:'6px 10px', fontSize:12, outline:'none' },
  saveBtn: { padding:'6px 14px', background:'#0f3460', border:'1px solid #4a90d9', borderRadius:4, color:'#4a90d9', cursor:'pointer', fontSize:12, fontWeight:600 },
  body: { overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:6 },
  sectionLabel: { fontSize:10, fontWeight:700, color:'#4a5568', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4, marginTop:4 },
  divider: { height:1, background:'#0f3460', margin:'8px 0' },
  userRow: { display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:6 },
  userRowMain: { flex:1, display:'flex', flexDirection:'column', gap:2 },
  userName: { fontSize:13, color:'#e0e0e0', fontWeight:600 },
  userDate: { fontSize:10, color:'#4a5568' },
  loadBtn: { padding:'4px 12px', background:'transparent', border:'1px solid #0f3460', borderRadius:4, color:'#a0aec0', cursor:'pointer', fontSize:11 },
  delBtn: { padding:'4px 8px', background:'transparent', border:'none', color:'#4a5568', cursor:'pointer', fontSize:12 },
  card: { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:6, cursor:'pointer', transition:'border-color 0.15s' },
  icon: { fontSize:28, flexShrink:0 },
  cardText: { flex:1 },
  cardName: { fontSize:13, fontWeight:700, color:'#e0e0e0', marginBottom:3 },
  cardDesc: { fontSize:11, color:'#718096' },
};
