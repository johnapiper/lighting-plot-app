import React, { useState, useRef } from 'react';
import { generateId } from '../canvas/geometry';

const EYE_ON = '👁';
const LOCK_CLOSED = '🔒';
const LOCK_OPEN = '🔓';

export default function LayersPanel({ layers = [], onUpdateLayer, onAddLayer, onDeleteLayer, onReorderLayers, draggingCanvasId, activeLayerId, onSetActiveLayer }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  function startRename(layer) {
    setEditingId(layer.id);
    setEditingName(layer.name);
  }

  function commitRename(layer) {
    if (editingName.trim()) onUpdateLayer(layer.id, { name: editingName.trim() });
    setEditingId(null);
  }

  // Layer drag-to-reorder
  function handleLayerDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleLayerDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }
  function handleLayerDrop(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const newLayers = [...layers];
    const [moved] = newLayers.splice(dragIdx, 1);
    newLayers.splice(idx, 0, moved);
    onReorderLayers(newLayers);
    setDragIdx(null);
    setOverIdx(null);
  }
  function handleLayerDragEnd() { setDragIdx(null); setOverIdx(null); }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>Layers</span>
        <button style={styles.addBtn} title="Add layer" onClick={() => onAddLayer({ id: generateId(), name: 'New Layer', color: '#4a90d9', visible: true, locked: false })}>+</button>
      </div>

      <div style={styles.list}>
        {layers.map((layer, idx) => {
          const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          const isDragging = dragIdx === idx;
          const isCanvasDropTarget = draggingCanvasId;
          const isActive = layer.id === activeLayerId;

          return (
            <div
              key={layer.id}
              data-layer-id={layer.id}
              draggable
              onDragStart={e => handleLayerDragStart(e, idx)}
              onDragOver={e => handleLayerDragOver(e, idx)}
              onDrop={e => handleLayerDrop(e, idx)}
              onDragEnd={handleLayerDragEnd}
              onClick={() => !layer.system && onSetActiveLayer && onSetActiveLayer(layer.id)}
              title={layer.system ? 'Auto-managed layer (toggle visibility only)' : isActive ? 'Active layer (new objects placed here)' : 'Click to set as active layer'}
              style={{
                ...styles.row,
                ...(isActive ? styles.rowActive : {}),
                ...(isOver ? styles.rowDropOver : {}),
                ...(isDragging ? styles.rowDragging : {}),
                ...(isCanvasDropTarget ? styles.rowCanvasDrop : {}),
                opacity: isDragging ? 0.4 : 1,
              }}
            >
              {/* Active-layer indicator */}
              <div style={{ ...styles.activeDot, opacity: isActive ? 1 : 0 }} title="Active layer" />
              {/* Colour dot */}
              <div style={{ ...styles.dot, background: layer.color }} />

              {/* Name */}
              {editingId === layer.id ? (
                <input
                  autoFocus
                  style={styles.nameInput}
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => commitRename(layer)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(layer);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span style={styles.name} onDoubleClick={() => startRename(layer)} title="Double-click to rename">
                  {layer.name}
                </span>
              )}

              {/* Controls */}
              <button
                style={styles.iconBtn}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })}
              >
                {layer.visible ? EYE_ON : '🚫'}
              </button>
              <button
                style={styles.iconBtn}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => onUpdateLayer(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? LOCK_CLOSED : LOCK_OPEN}
              </button>
              {layers.length > 1 && (
                <button
                  style={{ ...styles.iconBtn, color: '#fc8181' }}
                  title="Delete layer"
                  onClick={() => onDeleteLayer(layer.id)}
                >×</button>
              )}
            </div>
          );
        })}
      </div>

      {draggingCanvasId && (
        <div style={styles.hint}>Drag object over a layer to reassign it</div>
      )}
    </div>
  );
}

const styles = {
  panel: {
    width: '100%',
    background: '#16213e',
    borderTop: '1px solid #0f3460',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 140,
    flexShrink: 0,
  },
  header: {
    padding: '6px 10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#4a90d9',
    borderBottom: '1px solid #0f3460',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addBtn: {
    background: '#0f3460',
    border: 'none',
    borderRadius: 3,
    color: '#4a90d9',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    padding: '0 5px',
    fontWeight: 700,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    borderBottom: '1px solid #0f3460',
    cursor: 'pointer',
    transition: 'background 0.1s',
    minHeight: 28,
  },
  rowActive: {
    background: 'rgba(42,96,144,0.18)',
    borderLeft: '2px solid #2a6090',
  },
  activeDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: '#60b0ff', flexShrink: 0,
    marginRight: 1,
  },
  rowDropOver: {
    borderTop: '2px solid #00aaff',
    background: 'rgba(0,170,255,0.08)',
  },
  rowDragging: {
    background: 'rgba(74, 144, 217, 0.15)',
  },
  rowCanvasDrop: {
    outline: '1px solid rgba(0,170,255,0.3)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: 11,
    color: '#c0cce0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'grab',
  },
  nameInput: {
    flex: 1,
    background: '#0d1b2a',
    border: '1px solid #4a90d9',
    borderRadius: 3,
    color: '#e0e0e0',
    fontSize: 11,
    padding: '1px 4px',
    outline: 'none',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#718096',
    fontSize: 13,
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
    width: 18,
    textAlign: 'center',
  },
  hint: {
    padding: '4px 8px',
    fontSize: 9,
    color: '#00aaff',
    textAlign: 'center',
    borderTop: '1px solid #0f3460',
  },
};
