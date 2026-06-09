/**
 * Cable Report — lists all cables in the active drawing with
 * from/to, type, estimated length, and power load.
 */
import React, { useState } from 'react';
import { CABLE_TYPES, calcCircuitLoad, wattsToAmps } from '../cabling/ratings';
import { calcCableRoute, formatLength } from '../cabling/routing';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function buildRows(drawing, pipes, rigHeight, gridHeight = 6000) {
  if (!drawing) return [];
  const { infrastructure = [], cables = [], fixtures = [] } = drawing;

  const fixtureMap = {};
  fixtures.forEach(f => { fixtureMap[f.id] = f; });
  const infraMap = {};
  infrastructure.forEach(i => { infraMap[i.id] = i; });

  function label(id, type) {
    if (type === 'fixture') {
      const f = fixtureMap[id];
      return f ? `${f.name || f.type || 'Fixture'} #${f.unit || f.channel || '—'}` : id;
    }
    if (type === 'infra') {
      const i = infraMap[id];
      return i ? `${i.label || i.type} (${i.type})` : id;
    }
    return id;
  }

  function formatDrop(riseMm, dropMm) {
    if (!riseMm && !dropMm) return '—';
    const riseM = (riseMm / 1000).toFixed(2);
    const dropM = (dropMm / 1000).toFixed(2);
    return `(${riseM} + ${dropM} m)`;
  }

  return cables.map((c, idx) => {
    const fromObj = c.fromType === 'fixture' ? fixtureMap[c.fromId] : infraMap[c.fromId];
    const toObj   = c.toType   === 'fixture' ? fixtureMap[c.toId]   : infraMap[c.toId];

    let lengthMm = 0, riseMm = 0, dropMm = 0;
    if (fromObj && toObj) {
      const from = { x: fromObj.x, y: fromObj.y, onStructureId: fromObj.onStructureId || null };
      const to   = { x: toObj.x,   y: toObj.y,   onStructureId: toObj.onStructureId   || null };
      ({ lengthMm, riseMm, dropMm } = calcCableRoute(from, to, pipes, rigHeight, gridHeight));
    }

    // Power load
    let loadStr = '—', statusStr = 'OK', overloaded = false;
    if (c.cableType === 'power' && c.subtype) {
      const chainItems = [];
      if (c.fromType === 'fixture' && fromObj) chainItems.push(fromObj);
      if (c.toType   === 'fixture' && toObj)   chainItems.push(toObj);
      const load = calcCircuitLoad(chainItems, c.subtype);
      loadStr = `${load.totalAmps}A / ${load.maxAmps}A (${load.utilizationPct}%)`;
      overloaded = load.overloaded;
      statusStr  = overloaded ? '⚠ OVERLOADED' : 'OK';
    }

    const spec = CABLE_TYPES[c.subtype];
    return {
      id: c.id,
      num: idx + 1,
      label: c.label || '',
      cableType: c.cableType,
      subtype: spec?.label || c.subtype || '—',
      from: label(c.fromId, c.fromType),
      to:   label(c.toId,   c.toType),
      length: formatLength(lengthMm),
      lengthMm,
      drop: formatDrop(riseMm, dropMm),
      load: loadStr,
      status: statusStr,
      overloaded,
    };
  });
}

const COLS = [
  { key: 'num',      label: '#',          w: 40 },
  { key: 'label',    label: 'Label',      w: 90 },
  { key: 'cableType',label: 'Type',       w: 70 },
  { key: 'subtype',  label: 'Connector',  w: 130 },
  { key: 'from',     label: 'From',       w: 150 },
  { key: 'to',       label: 'To',         w: 150 },
  { key: 'length',   label: 'Length',     w: 80 },
  { key: 'drop',     label: 'Cable Drop', w: 130 },
  { key: 'load',     label: 'Load',       w: 150 },
  { key: 'status',   label: 'Status',     w: 100 },
];

export default function CableReport({ drawing, pipes, rigHeight, gridHeight, onClose }) {
  const [filterType, setFilterType] = useState('all');

  const rows = buildRows(drawing, pipes, rigHeight, gridHeight || 6000);
  const filtered = filterType === 'all' ? rows : rows.filter(r => r.cableType === filterType);

  const totalLen = filtered.reduce((s, r) => s + r.lengthMm, 0);
  const overloads = filtered.filter(r => r.overloaded).length;

  function handleCSV() {
    const header = COLS.map(c => c.label).join(',');
    const lines  = filtered.map(r => COLS.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');
    if (ipcRenderer) {
      ipcRenderer.send('export-csv', { filename: 'Cable Report.csv', csv });
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'Cable Report.csv'; a.click();
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        {/* Title bar */}
        <div style={styles.titleBar}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🔌 Cable Report</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Filter */}
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ background: '#0d1b2a', border: '1px solid #0f3460', color: '#e0e0e0', fontSize: 11, borderRadius: 3, padding: '3px 6px' }}>
              <option value="all">All types</option>
              <option value="power">Power only</option>
              <option value="dmx">DMX only</option>
              <option value="network">Network only</option>
            </select>
            <button style={styles.actionBtn} onClick={handleCSV}>Export CSV</button>
            <button style={styles.closeBtn}  onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Summary bar */}
        <div style={styles.summary}>
          <span>{filtered.length} cables</span>
          <span>· Total length: <strong>{formatLength(totalLen)}</strong></span>
          {overloads > 0 && <span style={{ color: '#ef4444' }}>· ⚠ {overloads} circuit{overloads > 1 ? 's' : ''} overloaded</span>}
        </div>

        {/* Table */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} style={{ ...styles.th, width: c.w, minWidth: c.w }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ ...styles.td, textAlign: 'center', color: '#718096', padding: 20 }}>
                  No cables found. Use the Cable tool in the toolbar to connect fixtures and infrastructure.
                </td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {COLS.map(c => (
                    <td key={c.key} style={{
                      ...styles.td,
                      color: c.key === 'status' && r.overloaded ? '#ef4444'
                           : c.key === 'cableType' ? (r.cableType === 'power' ? '#fbbf24' : r.cableType === 'dmx' ? '#a78bfa' : '#34d399')
                           : styles.td.color,
                      fontWeight: c.key === 'status' && r.overloaded ? 700 : 400,
                    }}>{r[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950,
  },
  window: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: '90vw', maxWidth: 1100, height: '80vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #0f3460',
    color: '#e0e0e0',
  },
  summary: {
    display: 'flex', gap: 12, padding: '6px 16px',
    fontSize: 11, color: '#a0aec0', borderBottom: '1px solid #0f3460',
    background: '#0d1b2a',
  },
  tableWrap: { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left',
    background: '#0f3460', color: '#4a90d9',
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.06em', position: 'sticky', top: 0, whiteSpace: 'nowrap',
  },
  td: { padding: '7px 10px', color: '#e0e0e0', borderBottom: '1px solid #0a1628', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '4px 12px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 3, color: '#4a90d9', cursor: 'pointer', fontSize: 11,
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16, padding: '0 4px',
  },
};
