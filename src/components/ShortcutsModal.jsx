import React from 'react';

const SECTIONS = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Select'],
      ['L', 'Line'],
      ['E', 'Rectangle'],
      ['P', 'Pipe'],
      ['T', 'Text'],
      ['C', 'Calibrate'],
      ['M', 'Measure'],
      ['R / Right-click', 'Rotate pipe/truss 90° (during placement)'],
      ['Enter', 'Finish polyline / commit typed length'],
      ['Esc', 'Cancel tool / deselect'],
    ],
  },
  {
    title: 'Drafting precision',
    rows: [
      ['F3', 'Toggle object snap (endpoint / midpoint / centre / intersection)'],
      ['Shift + draw', 'Constrain to 0 / 45 / 90°'],
      ['Ctrl + draw', 'Bypass snapping (free placement)'],
      ['Type length / angle', 'While drawing a line or pipe, then Enter'],
      ['Drag', 'Smart alignment guides snap to other objects'],
    ],
  },
  {
    title: 'Selection & Editing',
    rows: [
      ['Ctrl + G', 'Group / Ungroup selection'],
      ['Del / Backspace', 'Delete selected'],
      ['Ctrl + C', 'Copy'],
      ['Ctrl + V', 'Paste'],
      ['Ctrl + D', 'Duplicate in place'],
      ['Shift + drag rotation handle', 'Snap rotation to 45°'],
    ],
  },
  {
    title: 'Project',
    rows: [
      ['Ctrl + S', 'Save'],
      ['Ctrl + O', 'Open'],
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Y', 'Redo'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['+ / −', 'Zoom in / out'],
      ['Scroll wheel', 'Zoom at cursor'],
      ['Middle mouse / Space + drag', 'Pan'],
    ],
  },
  {
    title: 'App',
    rows: [
      ['?', 'Show this shortcuts reference'],
    ],
  },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>⌨ Keyboard Shortcuts</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          {SECTIONS.map(sec => (
            <div key={sec.title} style={{ marginBottom: 20 }}>
              <div style={S.sectionTitle}>{sec.title}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {sec.rows.map(([key, desc]) => (
                    <tr key={key} style={{ borderBottom: '1px solid #0a1828' }}>
                      <td style={S.keyCell}>
                        {key.split(' / ').map((k, i) => (
                          <span key={k}>
                            {i > 0 && <span style={{ color: '#4a5568', margin: '0 4px' }}>/</span>}
                            {k.split(' + ').map((part, j) => (
                              <span key={j}>
                                {j > 0 && <span style={{ color: '#4a5568', margin: '0 2px' }}>+</span>}
                                <kbd style={S.kbd}>{part}</kbd>
                              </span>
                            ))}
                          </span>
                        ))}
                      </td>
                      <td style={S.descCell}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div style={S.footer}>
          <button style={S.closeFullBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
  },
  modal: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.9)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid #0f3460',
    fontSize: 14, fontWeight: 700, color: '#e0e0e0',
  },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16 },
  body: { padding: '18px 20px', overflowY: 'auto', flex: 1 },
  footer: { display: 'flex', justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid #0f3460' },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #0f3460',
  },
  keyCell: { padding: '6px 12px 6px 0', width: '45%', verticalAlign: 'middle' },
  descCell: { padding: '6px 0', fontSize: 12, color: '#a0aec0', verticalAlign: 'middle' },
  kbd: {
    display: 'inline-block', background: '#0d1b2a', border: '1px solid #1a3a5c',
    borderRadius: 3, padding: '1px 5px', fontSize: 11, color: '#60b0ff',
    fontFamily: 'monospace', whiteSpace: 'nowrap',
  },
  closeFullBtn: {
    padding: '6px 16px', background: 'transparent', border: '1px solid #0f3460',
    borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 12,
  },
};
