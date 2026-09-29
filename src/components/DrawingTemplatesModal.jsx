import React, { useState } from 'react';
import { generateId } from '../canvas/geometry';

export default function DrawingTemplatesModal({ currentDrawing, onLoad, onClose }) {
  const [name, setName] = useState('');

  function getUserTemplates() {
    try { return JSON.parse(localStorage.getItem('lplot-drawing-templates') || '[]'); } catch { return []; }
  }
  const [userTemplates, setUserTemplates] = useState(getUserTemplates);

  function saveTemplate() {
    if (!name.trim() || !currentDrawing) return;
    const t = { id: generateId(), name: name.trim(), savedAt: new Date().toISOString(), snapshot: currentDrawing };
    const updated = [...userTemplates, t];
    localStorage.setItem('lplot-drawing-templates', JSON.stringify(updated));
    setUserTemplates(updated);
    setName('');
  }

  function deleteTemplate(id) {
    const updated = userTemplates.filter(t => t.id !== id);
    localStorage.setItem('lplot-drawing-templates', JSON.stringify(updated));
    setUserTemplates(updated);
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>📐 Drawing Templates</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.saveRow}>
          <input style={S.input} placeholder="Save current drawing as template…" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); }} />
          <button style={S.saveBtn} onClick={saveTemplate} disabled={!name.trim()}>Save</button>
        </div>
        <div style={S.body}>
          {userTemplates.length === 0 && <div style={S.empty}>No saved drawing templates. Save the current drawing above.</div>}
          {userTemplates.map(t => (
            <div key={t.id} style={S.row}>
              <div style={S.rowMain}>
                <span style={S.tName}>{t.name}</span>
                <span style={S.tDate}>{new Date(t.savedAt).toLocaleDateString()}</span>
              </div>
              <button style={S.loadBtn} onClick={() => { onLoad(t.snapshot); onClose(); }}>Load</button>
              <button style={S.delBtn} onClick={() => deleteTemplate(t.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:8, width:460, maxHeight:'75vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--text)' },
  closeBtn: { background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:16 },
  saveRow: { display:'flex', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border)' },
  input: { flex:1, background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text)', padding:'6px 10px', fontSize:12, outline:'none' },
  saveBtn: { padding:'6px 14px', background:'var(--border)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--accent)', cursor:'pointer', fontSize:12, fontWeight:600 },
  body: { overflowY:'auto', flex:1, padding:'8px 0' },
  empty: { padding:'24px 16px', color:'var(--text-faint)', fontSize:12, textAlign:'center' },
  row: { display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderBottom:'1px solid var(--bg-inset)' },
  rowMain: { flex:1, display:'flex', flexDirection:'column', gap:2 },
  tName: { fontSize:13, color:'var(--text)', fontWeight:600 },
  tDate: { fontSize:10, color:'var(--text-faint)' },
  loadBtn: { padding:'4px 12px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-muted)', cursor:'pointer', fontSize:11 },
  delBtn: { padding:'4px 8px', background:'transparent', border:'none', color:'var(--text-faint)', cursor:'pointer', fontSize:12 },
};
