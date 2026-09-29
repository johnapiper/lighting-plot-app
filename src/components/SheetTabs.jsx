import React, { useState, useEffect, useRef } from 'react';

export default function SheetTabs({ sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete, onDuplicate }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, sheet }
  const ctxRef = useRef(null);

  function startRename(sheet, e) {
    e.preventDefault();
    setCtxMenu(null);
    setRenamingId(sheet.id);
    setRenameVal(sheet.name);
  }
  function commitRename(id) {
    if (renameVal.trim()) onRename(id, renameVal.trim());
    setRenamingId(null);
  }

  function openCtx(e, sheet) {
    e.preventDefault();
    e.stopPropagation();
    // Menu is ~110px tall, ~160px wide — flip up/left if it would overflow
    const menuH = 115, menuW = 160;
    const x = e.clientX + menuW > window.innerWidth  ? e.clientX - menuW : e.clientX;
    const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY;
    setCtxMenu({ x, y, sheet });
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    function handle(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ctxMenu]);

  return (
    <div style={styles.bar}>
      <span style={styles.label}>Sheets:</span>
      {sheets.map(s => (
        <div key={s.id}
          style={{ ...styles.tab, ...(s.id === activeSheetId ? styles.active : {}) }}
          onContextMenu={e => openCtx(e, s)}>
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
              title="Double-click to rename; right-click for options"
            >{s.name}</span>
          )}
          {sheets.length > 1 && (
            <button style={styles.closeBtn} onClick={e => { e.stopPropagation(); onDelete(s.id); }} title="Delete sheet">×</button>
          )}
        </div>
      ))}
      <button style={styles.addBtn} onClick={onAdd} title="Add sheet">+ Sheet</button>

      {/* Context menu */}
      {ctxMenu && (
        <div ref={ctxRef} style={{ ...styles.ctx, left: ctxMenu.x, top: ctxMenu.y }}>
          <div style={styles.ctxItem} onClick={() => { startRename(ctxMenu.sheet, { preventDefault: ()=>{} }); }}>
            ✏️ Rename
          </div>
          <div style={styles.ctxItem} onClick={() => { onDuplicate && onDuplicate(ctxMenu.sheet.id); setCtxMenu(null); }}>
            📋 Duplicate
          </div>
          <div style={styles.ctxDivider} />
          <div style={{ ...styles.ctxItem, color: '#ef4444' }}
            onClick={() => { onDelete(ctxMenu.sheet.id); setCtxMenu(null); }}>
            🗑️ Delete
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  bar: { position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--bg-app)', borderTop: '1px solid var(--border)', padding: '3px 8px', gap: 4, flexShrink: 0, overflowX: 'auto', minHeight: 30 },
  label: { fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4, flexShrink: 0 },
  tab: { display: 'flex', alignItems: 'center', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px 4px 0 0', padding: '3px 8px', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 },
  active: { background: 'var(--border-strong)', borderColor: 'var(--border-accent)', color: 'var(--accent-text)', borderBottom: '1px solid var(--border-strong)' },
  tabName: { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 },
  addBtn: { background: 'var(--border)', border: '1px solid #1a4a7a', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 10, padding: '3px 8px', flexShrink: 0 },
  renameInput: { background: 'var(--bg-inset)', border: '1px solid var(--accent)', borderRadius: 2, color: 'var(--text)', fontSize: 11, padding: '0 3px', width: 80, outline: 'none' },
  ctx: {
    position: 'fixed', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
    boxShadow: '0 6px 20px rgba(0,0,0,0.7)', zIndex: 2000, minWidth: 150, padding: '4px 0',
  },
  ctxItem: { padding: '6px 14px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', userSelect: 'none',
    ':hover': { background: 'var(--border)' } },
  ctxDivider: { height: 1, background: 'var(--border)', margin: '3px 0' },
};
