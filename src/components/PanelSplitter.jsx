import React, { useState } from 'react';

// Draggable divider between a side panel and the canvas.
//   side="left"  → panel sits left of the handle (dragging right widens it)
//   side="right" → panel sits right of the handle (dragging left widens it)
// Double-click (or Enter/Space when focused) collapses/expands the panel;
// arrow keys resize it by 16 px for keyboard users.
export function usePanelWidth(key, def, min, max) {
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      if (v && typeof v.width === 'number') return { width: Math.max(min, Math.min(max, v.width)), collapsed: !!v.collapsed };
    } catch {}
    return { width: def, collapsed: false };
  };
  const [state, setState] = useState(read);
  const update = (patch) => setState(s => {
    const n = { ...s, ...patch };
    n.width = Math.max(min, Math.min(max, n.width));
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
    return n;
  });
  return [state, update];
}

export default function PanelSplitter({ side, width, collapsed, onResize, onToggle, min, max, label }) {
  const [active, setActive] = useState(false);

  function onMouseDown(e) {
    if (e.button !== 0 || collapsed) return;
    e.preventDefault();
    const startX = e.clientX, startW = width;
    setActive(true);
    document.body.style.cursor = 'col-resize';
    const move = (ev) => {
      const dx = ev.clientX - startX;
      onResize(Math.max(min, Math.min(max, side === 'left' ? startW + dx : startW - dx)));
    };
    const up = () => {
      setActive(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }

  function onKeyDown(e) {
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
    else if (e.key === grow && !collapsed) { e.preventDefault(); e.stopPropagation(); onResize(Math.min(max, width + 16)); }
    else if (e.key === shrink && !collapsed) { e.preventDefault(); e.stopPropagation(); onResize(Math.max(min, width - 16)); }
  }

  const arrow = (side === 'left') !== collapsed ? '‹' : '›';
  return (
    <div role="separator" aria-orientation="vertical" aria-label={`${label} — drag to resize, double-click to ${collapsed ? 'expand' : 'collapse'}`}
      aria-valuenow={collapsed ? 0 : width} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      title={`Drag to resize ${label.toLowerCase()} · double-click to ${collapsed ? 'expand' : 'collapse'}`}
      onMouseDown={onMouseDown} onDoubleClick={onToggle} onKeyDown={onKeyDown}
      style={{ ...styles.handle, ...(collapsed ? styles.collapsed : {}), ...(active ? styles.active : {}) }}
      className="panel-splitter">
      <button tabIndex={-1} aria-hidden="true" style={styles.btn} onMouseDown={e => e.stopPropagation()} onClick={onToggle}>{arrow}</button>
    </div>
  );
}

const styles = {
  handle: { width: 6, flexShrink: 0, cursor: 'col-resize', position: 'relative', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  collapsed: { width: 14, cursor: 'pointer', background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' },
  active: { background: 'var(--accent)' },
  btn: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 12, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 3, background: 'var(--bg-inset)', color: 'var(--text-dim)', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
