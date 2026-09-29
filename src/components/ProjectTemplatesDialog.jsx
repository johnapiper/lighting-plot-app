import React, { useState } from 'react';
import { generateId } from '../canvas/geometry';
import { BUILT_IN_TEMPLATES } from '../templates/builtinTemplates';
import { useUserTemplates } from '../templates/userTemplates';

export default function ProjectTemplatesDialog({ currentProject, onSelect, onClose }) {
  const [saveName, setSaveName] = useState('');
  const { templates: userTemplates, setTemplates: setUserTemplates, exportAll, importFile, canTransfer } = useUserTemplates('project');

  function saveCurrentAsTemplate() {
    if (!saveName.trim() || !currentProject) return;
    const t = {
      id: generateId(),
      name: saveName.trim(),
      savedAt: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(currentProject)),
    };
    setUserTemplates([...userTemplates, t]);
    setSaveName('');
  }

  function deleteUserTemplate(id) {
    setUserTemplates(userTemplates.filter(t => t.id !== id));
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>📁 Project Templates</span>
          <span style={{ flex:1 }} />
          {canTransfer && <button style={S.hdrBtn} onClick={importFile} title="Add templates from a .lplottemplates file">Import…</button>}
          {canTransfer && <button style={S.hdrBtn} onClick={exportAll} disabled={!userTemplates.length} title="Save your templates to a file (backup or share with another machine)">Export…</button>}
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
            <div key={t.id} style={S.card} onClick={() => { onSelect({ ...t, snapshot: t.buildSnapshot() }); onClose(); }}>
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
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16, marginLeft:6 },
  hdrBtn: { padding:'3px 10px', marginLeft:6, background:'transparent', border:'1px solid #0f3460', borderRadius:4, color:'#a0aec0', cursor:'pointer', fontSize:11, fontWeight:400 },
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
