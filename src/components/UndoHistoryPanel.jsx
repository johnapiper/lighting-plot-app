import React from 'react';

export default function UndoHistoryPanel({ historyStack, historyIdx, historyLabels, onJump, onClose }) {
  const stack = historyStack?.current || [];
  const labels = historyLabels?.current || [];
  const cur   = historyIdx?.current ?? stack.length - 1;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.panel}>
        <div style={S.header}>
          <span>↩ Undo History</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          {stack.length === 0 && <div style={S.empty}>No history yet.</div>}
          {[...stack].reverse().map((_, ri) => {
            const i = stack.length - 1 - ri;
            const isCurrent = i === cur;
            return (
              <div key={i} style={{ ...S.item, ...(isCurrent ? S.current : i > cur ? S.future : {}) }}
                onClick={() => !isCurrent && onJump(i)}>
                <span style={S.dot}>{isCurrent ? '●' : '○'}</span>
                <span style={S.label}>
                  <span style={S.num}>{i}.</span>
                  <span style={S.desc}>{labels[i] || (i === 0 ? 'Initial state' : 'Edit')}</span>
                  {isCurrent && <span style={S.tag}>current</span>}
                  {i > cur && <span style={{ ...S.tag, background: '#2d3748', color: '#718096' }}>redo</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div style={S.footer}>
          <span style={{ fontSize: 10, color: '#4a5568' }}>Click a state to jump to it (Ctrl+Z / Ctrl+Y still work)</span>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 },
  panel: { background:'#16213e', border:'1px solid #0f3460', borderRadius:8, width:300, maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 40px rgba(0,0,0,0.8)' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #0f3460', fontSize:13, fontWeight:700, color:'#e0e0e0' },
  closeBtn: { background:'none', border:'none', color:'#718096', cursor:'pointer', fontSize:16 },
  body: { overflowY:'auto', flex:1, padding:'8px 0' },
  empty: { padding:'20px', textAlign:'center', color:'#718096', fontSize:12 },
  item: { display:'flex', alignItems:'center', gap:10, padding:'6px 16px', cursor:'pointer', fontSize:12, color:'#a0aec0', transition:'background 0.1s' },
  current: { background:'#0f3460', color:'#e0e0e0' },
  future: { opacity:0.5 },
  dot: { fontSize:10, color:'#4a90d9', flexShrink:0 },
  label: { flex:1, display:'flex', alignItems:'center', gap:6 },
  tag: { fontSize:9, background:'#4a90d9', color:'#fff', borderRadius:3, padding:'1px 5px' },
  footer: { padding:'8px 16px', borderTop:'1px solid #0f3460' },
};
