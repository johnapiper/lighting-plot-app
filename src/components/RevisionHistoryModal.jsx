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
  modal: { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:8, width:480, maxHeight:'75vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,0.9)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--text)' },
  closeBtn: { background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:16 },
  saveRow: { display:'flex', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border)' },
  input: { flex:1, background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text)', padding:'6px 10px', fontSize:12, outline:'none' },
  saveBtn: { padding:'6px 14px', background:'var(--border)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--accent)', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap' },
  body: { overflowY:'auto', flex:1, padding:'8px 0' },
  empty: { padding:'24px 16px', color:'var(--text-faint)', fontSize:12, textAlign:'center' },
  row: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid var(--bg-inset)' },
  rowMain: { display:'flex', flexDirection:'column', gap:2 },
  revName: { fontSize:13, color:'var(--text)', fontWeight:600 },
  revDate: { fontSize:10, color:'var(--text-faint)' },
  restoreBtn: { padding:'4px 12px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-muted)', cursor:'pointer', fontSize:11, ':hover': { borderColor:'var(--accent)', color:'var(--accent)' } },
};
