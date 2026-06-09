/**
 * Cable Report — lists all cables with route distance, margin, drops, slack,
 * calculated cable length, and rounded-up order length.
 *
 * Cable Length formula (per cabling-design.com):
 *   Cable Length = Route × (1 + margin%) + Drops + Slack
 *   Slack default = 1.1 m (0.9 m source + 0.2 m destination)
 *
 * Order Length = cable length rounded UP to the nearest standard stock option.
 */
import React, { useState } from 'react';
import { CABLE_TYPES, calcCircuitLoad, wattsToAmps } from '../cabling/ratings';
import { calcCableRoute, formatLength } from '../cabling/routing';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

const DEFAULT_MARGIN_PCT = 10;
const DEFAULT_SLACK_MM   = 1100; // 0.9 m + 0.2 m

// Standard stock lengths in metres for each cable category
const DEFAULT_ORDER_LENGTHS = {
  power:   [2, 3, 5, 6, 8, 10, 12, 15, 20, 30, 50],
  dmx:     [2, 3, 5, 6, 8, 10, 12, 15, 20, 30, 50],
  network: [2, 3, 5, 6, 8, 10, 12, 15, 20, 30, 50],
};

/** Round up mm length to the nearest value in the stock lengths list. */
function roundUpToOrder(mm, stockMetres) {
  if (!stockMetres || stockMetres.length === 0) return null;
  const m = mm / 1000;
  const found = stockMetres.find(s => s >= m);
  return found != null ? found * 1000 : null; // null = exceeds longest stock
}

/**
 * Walk all power cables from a starting node (the "load" end of a cable),
 * collecting every fixture reachable without going back through the excluded cable.
 * This gives the full downstream load carried by a cable.
 */
function collectDownstreamFixtures(entryId, entryType, allCables, fixtureMap, infraMap, excludeCableId) {
  const visited = new Set([`${entryType}-${entryId}`]);
  const queue = [{ id: entryId, type: entryType }];
  const result = [];
  while (queue.length) {
    const node = queue.shift();
    if (node.type === 'fixture' && fixtureMap[node.id]) result.push(fixtureMap[node.id]);
    for (const cable of allCables) {
      if (cable.id === excludeCableId || cable.cableType !== 'power') continue;
      let nextId = null, nextType = null;
      if (cable.fromId === node.id && cable.fromType === node.type) { nextId = cable.toId;   nextType = cable.toType; }
      else if (cable.toId === node.id && cable.toType === node.type)  { nextId = cable.fromId; nextType = cable.fromType; }
      if (nextId) {
        const key = `${nextType}-${nextId}`;
        if (!visited.has(key)) { visited.add(key); queue.push({ id: nextId, type: nextType }); }
      }
    }
  }
  return result;
}

/** Returns true if an infra item is a power supply source (distro, PDU, etc.) */
function isPowerSupply(id, type, infraMap) {
  if (type !== 'infra') return false;
  const item = infraMap[id];
  return item != null && ['distro', 'node', 'netport', 'switch'].includes(item.type);
}

function buildRows(drawing, pipes, rigHeight, gridHeight = 6000, fixtureTypes = [], marginOverrides = {}, orderLengths = DEFAULT_ORDER_LENGTHS) {
  if (!drawing) return [];
  const { infrastructure = [], cables = [], fixtures = [] } = drawing;

  const fixtureMap = {};
  fixtures.forEach(f => { fixtureMap[f.id] = f; });
  const infraMap = {};
  infrastructure.forEach(i => { infraMap[i.id] = i; });

  function label(id, type) {
    if (type === 'fixture') {
      const f = fixtureMap[id];
      if (!f) return id;
      // Look up current type name from fixtureTypes (may have changed since fixture was placed)
      const ftype = fixtureTypes.find(t => t.id === f.fixtureTypeId);
      const typeName = ftype?.name || f.type || 'Fixture';
      const num = f.unit || f.channel || '—';
      return `${typeName} #${num}`;
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
    return `${riseM} + ${dropM} m`;
  }

  return cables.map((c, idx) => {
    const fromObj = c.fromType === 'fixture' ? fixtureMap[c.fromId] : infraMap[c.fromId];
    const toObj   = c.toType   === 'fixture' ? fixtureMap[c.toId]   : infraMap[c.toId];

    let lengthMm = 0, riseMm = 0, dropMm = 0;
    if (fromObj && toObj) {
      const from = { x: fromObj.x, y: fromObj.y, onStructureId: fromObj.onStructureId || fromObj.pipeId || null };
      const to   = { x: toObj.x,   y: toObj.y,   onStructureId: toObj.onStructureId   || toObj.pipeId   || null };
      ({ lengthMm, riseMm, dropMm } = calcCableRoute(from, to, pipes, rigHeight, gridHeight, c.userWaypoints || null));
    }

    const marginPct = marginOverrides[c.id] ?? DEFAULT_MARGIN_PCT;
    const routeMm = lengthMm;
    const cableLengthMm = Math.round(routeMm * (1 + marginPct / 100) + DEFAULT_SLACK_MM);

    // Order length: round up to nearest stock option for this cable type
    const stock = orderLengths[c.cableType] || [];
    const orderMm = roundUpToOrder(cableLengthMm, stock);

    // Power load — traverse all fixtures downstream of this cable's load end
    let loadStr = '—', statusStr = 'OK', overloaded = false;
    if (c.cableType === 'power' && c.subtype) {
      // Determine which end is the supply and which is the load.
      // Supply = infra items (distro, PDU, switch, etc.).
      // If neither end is a supply, treat "from" as supply (cable drawn supply→load).
      const fromIsSupply = isPowerSupply(c.fromId, c.fromType, infraMap);
      const toIsSupply   = isPowerSupply(c.toId,   c.toType,   infraMap);
      let loadId, loadType;
      if (fromIsSupply && !toIsSupply) { loadId = c.toId;   loadType = c.toType; }
      else if (toIsSupply)             { loadId = c.fromId; loadType = c.fromType; }
      else                             { loadId = c.toId;   loadType = c.toType; } // default: "to" is load
      // Collect all fixtures reachable from the load end (full downstream subtree)
      const chainItems = collectDownstreamFixtures(loadId, loadType, cables, fixtureMap, infraMap, c.id);
      const load = calcCircuitLoad(chainItems, c.subtype, fixtureTypes);
      loadStr = `${load.totalAmps}A / ${load.maxAmps}A (${load.utilizationPct}%)`;
      overloaded = load.overloaded;
      statusStr  = overloaded ? '⚠ OVERLOADED' : 'OK';
    }

    const spec = CABLE_TYPES[c.subtype];
    return {
      id:         c.id,
      num:        idx + 1,
      label:      c.label || '',
      cableType:  c.cableType,
      subtype:    spec?.label || c.subtype || '—',
      from:       label(c.fromId, c.fromType),
      to:         label(c.toId,   c.toType),
      routeMm,
      route:      formatLength(routeMm),
      marginPct,
      drop:       formatDrop(riseMm, dropMm),
      dropsMm:    riseMm + dropMm,
      slack:      `${(DEFAULT_SLACK_MM / 1000).toFixed(1)} m`,
      cableLengthMm,
      cableLength: formatLength(cableLengthMm),
      orderMm,
      orderLength: orderMm != null ? formatLength(orderMm) : '> stock',
      load:       loadStr,
      status:     statusStr,
      overloaded,
    };
  });
}

/**
 * Returns fixtures that have no power cable AND/OR no data (DMX/network) cable connected.
 * Returns array of { fixture, missingPower, missingData, name }
 */
function buildUnconnected(drawing, fixtureTypes) {
  if (!drawing) return [];
  const { fixtures = [], cables = [], infrastructure = [] } = drawing;
  // Build sets of fixture IDs that appear on each cable type
  const withPower   = new Set();
  const withData    = new Set();
  cables.forEach(c => {
    if (c.cableType === 'power') {
      if (c.fromType === 'fixture') withPower.add(c.fromId);
      if (c.toType   === 'fixture') withPower.add(c.toId);
    }
    if (c.cableType === 'dmx' || c.cableType === 'network') {
      if (c.fromType === 'fixture') withData.add(c.fromId);
      if (c.toType   === 'fixture') withData.add(c.toId);
    }
  });
  return fixtures.map(f => {
    const missingPower = !withPower.has(f.id);
    const missingData  = !withData.has(f.id);
    if (!missingPower && !missingData) return null;
    const ftype = fixtureTypes.find(t => t.id === f.fixtureTypeId);
    const name = `${ftype?.name || f.type || 'Fixture'} #${f.unit || f.channel || '—'}`;
    return { id: f.id, name, missingPower, missingData };
  }).filter(Boolean);
}

const COLS = [
  { key: 'num',         label: '#',            w: 36 },
  { key: 'label',       label: 'Label',        w: 80 },
  { key: 'cableType',   label: 'Type',         w: 64 },
  { key: 'subtype',     label: 'Connector',    w: 120 },
  { key: 'from',        label: 'From',         w: 140 },
  { key: 'to',          label: 'To',           w: 140 },
  { key: 'route',       label: 'Route',        w: 72,  title: 'Measured route distance' },
  { key: 'drop',        label: 'Drops',        w: 110, title: 'Vertical drops (rise + drop)' },
  { key: 'marginPct',   label: 'Margin %',     w: 76,  editable: true },
  { key: 'slack',       label: 'Slack',        w: 72,  title: '0.9 m (source) + 0.2 m (load)' },
  { key: 'cableLength', label: 'Cable Length', w: 90,  title: 'Route × (1+margin%) + slack' },
  { key: 'orderLength', label: 'Order',        w: 72,  title: 'Nearest stock length to order' },
  { key: 'load',        label: 'Load',         w: 150 },
  { key: 'status',      label: 'Status',       w: 90 },
];

// ── Settings panel for stock lengths ────────────────────────────────────────

function OrderLengthSettings({ orderLengths, onChange, onClose }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      Object.entries(orderLengths).map(([k, v]) => [k, v.join(', ')])
    )
  );

  function save() {
    const parsed = {};
    for (const [k, v] of Object.entries(drafts)) {
      parsed[k] = v.split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n) && n > 0)
        .sort((a, b) => a - b);
    }
    onChange(parsed);
    onClose();
  }

  return (
    <div style={sty.settingsOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={sty.settingsBox}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#e0e0e0' }}>
          📦 Stock Cable Lengths
        </div>
        <div style={{ fontSize: 11, color: '#718096', marginBottom: 12 }}>
          Comma-separated list of lengths in metres for each cable type.<br />
          Order Length rounds up to the nearest option.
        </div>
        {Object.entries(drafts).map(([type, val]) => (
          <label key={type} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: type === 'power' ? '#fbbf24' : type === 'dmx' ? '#a78bfa' : '#34d399', textTransform: 'capitalize' }}>
              {type}
            </span>
            <input
              value={val}
              onChange={e => setDrafts(d => ({ ...d, [type]: e.target.value }))}
              style={{ ...sty.sel, width: '100%', fontFamily: 'monospace' }}
            />
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={sty.actionBtn} onClick={save}>Save</button>
          <button style={sty.closeBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CableReport({ drawing, pipes, rigHeight, gridHeight, fixtureTypes = [], onClose }) {
  const [filterType, setFilterType]   = useState('all');
  const [marginOverrides, setMarginOverrides] = useState({});
  const [globalMargin, setGlobalMargin] = useState(DEFAULT_MARGIN_PCT);
  const [orderLengths, setOrderLengths] = useState(DEFAULT_ORDER_LENGTHS);
  const [showSettings, setShowSettings] = useState(false);

  const rows = buildRows(drawing, pipes, rigHeight, gridHeight || 6000, fixtureTypes, {}, orderLengths);
  const filtered = filterType === 'all' ? rows : rows.filter(r => r.cableType === filterType);

  // Apply per-row and global margin
  const displayRows = filtered.map(r => {
    const pct = marginOverrides[r.id] ?? globalMargin;
    const cableLengthMm = Math.round(r.routeMm * (1 + pct / 100) + DEFAULT_SLACK_MM);
    const stock = orderLengths[r.cableType] || [];
    const orderMm = roundUpToOrder(cableLengthMm, stock);
    return { ...r, marginPct: pct, cableLengthMm, cableLength: formatLength(cableLengthMm),
      orderMm, orderLength: orderMm != null ? formatLength(orderMm) : '> stock' };
  });

  const totalRoute = displayRows.reduce((s, r) => s + r.routeMm, 0);
  const totalCable = displayRows.reduce((s, r) => s + r.cableLengthMm, 0);
  const totalOrder = displayRows.reduce((s, r) => s + (r.orderMm || r.cableLengthMm), 0);
  const overloads  = displayRows.filter(r => r.overloaded).length;
  const unconnected = buildUnconnected(drawing, fixtureTypes);

  function setRowMargin(id, pct) {
    setMarginOverrides(prev => ({ ...prev, [id]: pct }));
  }

  function handleCSV() {
    const header = COLS.map(c => c.label).join(',');
    const lines  = displayRows.map(r => COLS.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
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
    <div style={sty.overlay}>
      <div style={sty.window}>
        {/* Title bar */}
        <div style={sty.titleBar}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🔌 Cable Report</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sty.sel}>
              <option value="all">All types</option>
              <option value="power">Power only</option>
              <option value="dmx">DMX only</option>
              <option value="network">Network only</option>
            </select>
            <label style={{ fontSize: 11, color: '#a0aec0', display: 'flex', gap: 4, alignItems: 'center' }}>
              Default margin:
              <input type="number" min={0} max={100} value={globalMargin}
                onChange={e => setGlobalMargin(Number(e.target.value) || 0)}
                style={{ ...sty.sel, width: 52, textAlign: 'right' }}
              />%
            </label>
            <button style={sty.actionBtn} onClick={() => setShowSettings(true)} title="Configure stock cable lengths">
              📦 Stock Lengths
            </button>
            <button style={sty.actionBtn} onClick={handleCSV}>Export CSV</button>
            <button style={sty.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Summary bar */}
        <div style={sty.summary}>
          <span>{displayRows.length} cables</span>
          <span>· Route total: <strong>{formatLength(totalRoute)}</strong></span>
          <span>· Cable total: <strong>{formatLength(totalCable)}</strong></span>
          <span>· Order total: <strong style={{ color: '#68d391' }}>{formatLength(totalOrder)}</strong></span>
          {overloads > 0 && <span style={{ color: '#ef4444' }}>· ⚠ {overloads} circuit{overloads > 1 ? 's' : ''} overloaded</span>}
          <span style={{ color: '#718096', fontSize: 10 }}>
            · Slack per cable: 1.1 m (0.9 m source + 0.2 m load)
          </span>
        </div>

        {/* Unconnected fixtures warning */}
        {unconnected.length > 0 && (
          <div style={sty.warnPanel}>
            <div style={sty.warnHeader}>
              ⚠️ <strong>{unconnected.length} fixture{unconnected.length > 1 ? 's' : ''} incomplete</strong>
              <span style={{ fontWeight: 400, color: '#fbd38d' }}> — missing power and/or data connections</span>
            </div>
            <div style={sty.warnGrid}>
              {unconnected.map(u => (
                <div key={u.id} style={sty.warnItem}>
                  <span style={sty.warnName}>{u.name}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {u.missingPower && <span style={sty.badge('power')}>⚡ No power</span>}
                    {u.missingData  && <span style={sty.badge('data')}>📡 No data</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div style={sty.tableWrap}>
          <table style={sty.table}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} title={c.title || ''} style={{ ...sty.th, width: c.w, minWidth: c.w }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ ...sty.td, textAlign: 'center', color: '#718096', padding: 20 }}>
                  No cables found.
                </td></tr>
              )}
              {displayRows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {COLS.map(c => {
                    if (c.key === 'marginPct') {
                      return (
                        <td key={c.key} style={sty.td}>
                          <input
                            type="number" min={0} max={100}
                            value={r.marginPct}
                            onChange={e => setRowMargin(r.id, Number(e.target.value) || 0)}
                            style={{ width: 48, background: '#0d1b2a', border: '1px solid #1a3a5c',
                              borderRadius: 3, color: '#e0e0e0', fontSize: 11, padding: '2px 4px', textAlign: 'right' }}
                          />
                          <span style={{ color: '#718096', fontSize: 10, marginLeft: 2 }}>%</span>
                        </td>
                      );
                    }
                    if (c.key === 'cableLength') {
                      return (
                        <td key={c.key} style={{ ...sty.td, color: '#a0aec0', fontWeight: 600 }}>
                          {r[c.key]}
                        </td>
                      );
                    }
                    if (c.key === 'orderLength') {
                      const isOver = r.orderLength === '> stock';
                      return (
                        <td key={c.key} style={{ ...sty.td, color: isOver ? '#ef4444' : '#68d391', fontWeight: 700 }}>
                          {r[c.key]}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} style={{
                        ...sty.td,
                        color: c.key === 'status' && r.overloaded ? '#ef4444'
                             : c.key === 'cableType' ? (r.cableType === 'power' ? '#fbbf24' : r.cableType === 'dmx' ? '#a78bfa' : '#34d399')
                             : c.key === 'route' ? '#a0aec0'
                             : sty.td.color,
                        fontWeight: c.key === 'status' && r.overloaded ? 700 : 400,
                      }}>{r[c.key]}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showSettings && (
        <OrderLengthSettings
          orderLengths={orderLengths}
          onChange={setOrderLengths}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

const sty = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950,
  },
  window: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: '95vw', maxWidth: 1400, height: '82vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid #0f3460',
    color: '#e0e0e0', flexWrap: 'wrap', gap: 8,
  },
  summary: {
    display: 'flex', gap: 12, padding: '5px 16px',
    fontSize: 11, color: '#a0aec0', borderBottom: '1px solid #0f3460',
    background: '#0d1b2a', flexWrap: 'wrap',
  },
  tableWrap: { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '7px 8px', textAlign: 'left',
    background: '#0f3460', color: '#4a90d9',
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', position: 'sticky', top: 0, whiteSpace: 'nowrap',
  },
  td: { padding: '6px 8px', color: '#e0e0e0', borderBottom: '1px solid #0a1628', whiteSpace: 'nowrap' },
  sel: {
    background: '#0d1b2a', border: '1px solid #0f3460', color: '#e0e0e0',
    fontSize: 11, borderRadius: 3, padding: '3px 6px',
  },
  actionBtn: {
    padding: '4px 12px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 3, color: '#4a90d9', cursor: 'pointer', fontSize: 11,
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16, padding: '0 4px',
  },
  warnPanel: {
    background: 'rgba(180,100,0,0.15)', borderBottom: '1px solid #7a4400',
    padding: '8px 16px', flexShrink: 0,
  },
  warnHeader: { fontSize: 12, color: '#fbd38d', marginBottom: 6 },
  warnGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  warnItem: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)',
    border: '1px solid #7a4400', borderRadius: 4, padding: '3px 8px', fontSize: 11,
  },
  warnName: { color: '#fbd38d', fontWeight: 600 },
  badge: (type) => ({
    background: type === 'power' ? 'rgba(239,68,68,0.2)' : 'rgba(167,139,250,0.2)',
    border: `1px solid ${type === 'power' ? '#ef4444' : '#a78bfa'}`,
    color: type === 'power' ? '#fc8181' : '#c4b5fd',
    borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 600,
  }),
  settingsOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 960,
  },
  settingsBox: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
  },
};
