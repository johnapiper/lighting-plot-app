import React, { useState } from 'react';

export default function RevisionHistoryModal({ revisions = [], onRestore, onSave, onClose }) {
  const [name, setName] = useState('');

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>📌 Revision History</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.saveRow}>
          <input style={S.input} placeholder="Revision name…" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); setName(''); } }} />
          <button style={S.saveBtn} disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(''); }}>
            Save Snapshot
          </button>
        </div>
        <div style={S.body}>
          {revisions.length === 0 && <div style={S.empty}>No saved revisions yet. Type a name above and click Save Snapshot.</div>}
          {[...revisions].reverse().map(rev => (
            <div key={rev.id} style={S.row}>
              <div style={S.rowMain}>
                <span style={S.revName}>{rev.name}</span>
                <span style={S.revDate}>{new Date(rev.timestamp).toLocaleString()}</span>
              </div>
              <button style={S.restoreBtn} onClick={() => { onRestore(rev.id); onClose(); }}>Restore</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:480, maxHeight:'75vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  saveRow: { display:'flex', gap:8, padding:'12px 16px', borderBottom:'1px solid #0f3460' },
  input: { flex:1, background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:4, color:'#e0e0e0', padding:'6px 10px', fontSize:12, outline:'none' },
  saveBtn: { padding:'6px 14px', background:'#0f3460', border:'1px solid #4a90d9', borderRadius:4, color:'#4a90d9', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap' },
  body: { overflowY:'auto', flex:1, padding:'8px 0' },
  empty: { padding:'24px 16px', color:'#4a5568', fontSize:12, textAlign:'center' },
  row: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #0d1b2a' },
  rowMain: { display:'flex', flexDirection:'column', gap:2 },
  revName: { fontSize:13, color:'#e0e0e0', fontWeight:600 },
  revDate: { fontSize:10, color:'#4a5568' },
  restoreBtn: { padding:'4px 12px', background:'transparent', border:'1px solid #0f3460', borderRadius:4, color:'#a0aec0', cursor:'pointer', fontSize:11, ':hover': { borderColor:'#4a90d9', color:'#4a90d9' } },
};
