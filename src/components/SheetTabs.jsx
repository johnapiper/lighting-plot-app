import React, { useState } from 'react';

export default function SheetTabs({ sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  function startRename(sheet, e) {
    e.preventDefault();
    setRenamingId(sheet.id);
    setRenameVal(sheet.name);
  }
  function commitRename(id) {
    if (renameVal.trim()) onRename(id, renameVal.trim());
    setRenamingId(null);
  }

  return (
    <div style={styles.bar}>
      <span style={styles.label}>Sheets:</span>
      {sheets.map(s => (
        <div key={s.id} style={{ ...styles.tab, ...(s.id === activeSheetId ? styles.active : {}) }}>
          {renamingId === s.id ? (
            <input
              autoFocus
              style={styles.renameInput}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(s.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(s.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
            />
          ) : (
            <span
              style={styles.tabName}
              onClick={() => onSwitch(s.id)}
              onDoubleClick={e => startRename(s, e)}
              title="Double-click to rename"
            >{s.name}</span>
          )}
          {sheets.length > 1 && (
            <button style={styles.closeBtn} onClick={e => { e.stopPropagation(); onDelete(s.id); }} title="Delete sheet">×</button>
          )}
        </div>
      ))}
      <button style={styles.addBtn} onClick={onAdd} title="Add sheet">+ Sheet</button>
    </div>
  );
}

const styles = {
  bar: { display: 'flex', alignItems: 'center', background: '#0d1117', borderTop: '1px solid #0f3460', padding: '3px 8px', gap: 4, flexShrink: 0, overflowX: 'auto', minHeight: 30 },
  label: { fontSize: 9, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4, flexShrink: 0 },
  tab: { display: 'flex', alignItems: 'center', background: '#16213e', border: '1px solid #0f3460', borderRadius: '4px 4px 0 0', padding: '3px 8px', gap: 4, cursor: 'pointer', fontSize: 11, color: '#a0aec0', flexShrink: 0 },
  active: { background: '#1a3a5c', borderColor: '#2a6090', color: '#60b0ff', borderBottom: '1px solid #1a3a5c' },
  tabName: { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  closeBtn: { background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 },
  addBtn: { background: '#0f3460', border: '1px solid #1a4a7a', borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 10, padding: '3px 8px', flexShrink: 0 },
  renameInput: { background: '#0d1b2a', border: '1px solid #4a90d9', borderRadius: 2, color: '#e0e0e0', fontSize: 11, padding: '0 3px', width: 80, outline: 'none' },
};
