import React, { useState } from 'react';

export default function DrawingTabs({ drawings, activeDrawingId, onSwitch, onAdd, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  function startRename(d) {
    setEditingId(d.id);
    setEditName(d.name);
  }

  function commitRename() {
    if (editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  }

  return (
    <div style={styles.bar}>
      {drawings.map(d => {
        const active = d.id === activeDrawingId;
        return (
          <div
            key={d.id}
            style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
            onClick={() => onSwitch(d.id)}
            onDoubleClick={() => startRename(d)}
            title="Double-click to rename"
          >
            {editingId === d.id ? (
              <input
                autoFocus
                style={styles.tabInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onClick={e => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <span style={styles.tabLabel}>{d.name}</span>
            )}
            {drawings.length > 1 && (
              <span
                style={styles.closeTab}
                title="Delete plot"
                onClick={e => { e.stopPropagation(); onDelete(d.id); }}
              >×</span>
            )}
          </div>
        );
      })}
      <button style={styles.addBtn} title="Add plot" onClick={onAdd}>+ Plot</button>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'flex-end',
    background: 'var(--bg-app)',
    borderTop: '1px solid var(--border)',
    padding: '0 8px',
    gap: 2,
    flexShrink: 0,
    height: 30,
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    color: 'var(--text-dim)',
    fontSize: 12,
    minWidth: 80,
    maxWidth: 160,
    userSelect: 'none',
  },
  tabActive: {
    background: 'var(--bg-inset)',
    color: 'var(--text)',
    borderColor: 'var(--accent)',
  },
  tabLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tabInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--text)',
    fontSize: 12,
    outline: 'none',
    width: '100%',
  },
  closeTab: {
    color: 'var(--text-faint)',
    fontSize: 13,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
    borderRadius: 2,
  },
  addBtn: {
    background: 'none',
    border: '1px dashed var(--border)',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    color: 'var(--text-faint)',
    fontSize: 11,
    cursor: 'pointer',
    padding: '4px 8px',
    height: 26,
  },
};
