import React, { useState, useRef, useEffect } from 'react';

function parseDmx(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 2) return null;
  const u = parseInt(parts[0], 10);
  const c = parseInt(parts[1], 10);
  if (isNaN(u) || isNaN(c) || c < 1 || c > 512) return null;
  return { universe: u, channel: c };
}

export function findDmxConflicts(fixtures) {
  // Returns set of fixture IDs that have conflicts
  const conflictIds = new Set();
  const byUniverse = {};

  for (const f of fixtures) {
    const addr = parseDmx(f.dmxAddress);
    if (!addr) continue;
    const chCount = f.dmxChannelCount || 1;
    const key = addr.universe;
    if (!byUniverse[key]) byUniverse[key] = [];
    byUniverse[key].push({ id: f.id, start: addr.channel, end: addr.channel + chCount - 1, name: f.type, unit: f.unit });
  }

  for (const u of Object.values(byUniverse)) {
    for (let i = 0; i < u.length; i++) {
      for (let j = i + 1; j < u.length; j++) {
        if (u[i].start <= u[j].end && u[j].start <= u[i].end) {
          conflictIds.add(u[i].id);
          conflictIds.add(u[j].id);
        }
      }
    }
  }
  return conflictIds;
}

// ── Columns ───────────────────────────────────────────────────────────────
// `edit` columns are text cells: committed on Enter / blur / Tab, pasteable.
// Returns an error string for an invalid value, or null. Empty is always allowed.
function validateDmx(raw) {
  if (!raw) return null;
  const p = String(raw).split('/');
  const u = parseInt(p[0], 10), c = parseInt(p[1], 10);
  if (p.length !== 2 || isNaN(u) || isNaN(c)) return 'Use Universe/Channel, e.g. 1/1';
  if (u < 1) return 'Universe must be 1 or more';
  if (c < 1 || c > 512) return 'Channel must be 1–512';
  return null;
}
function normaliseDmx(raw) { const p = parseDmx(raw); return p ? `${p.universe}/${p.channel}` : ''; }

const cmpNum = (a, b) => {
  const na = parseFloat(a), nb = parseFloat(b);
  const ea = a === undefined || a === null || a === '', eb = b === undefined || b === null || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // blanks last
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
};
const cmpDmx = (a, b) => {
  const pa = parseDmx(a), pb = parseDmx(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return (pa.universe - pb.universe) || (pa.channel - pb.channel);
};

const COLUMNS = [
  { key: 'position',        label: 'Position', cmp: cmpNum },
  { key: 'unit',            label: 'Unit#',    cmp: cmpNum, edit: true, width: 52 },
  { key: 'type',            label: 'Type',     cmp: cmpNum },
  { key: 'dmxMode',         label: 'Mode',     cmp: cmpNum },
  { key: 'dmxChannelCount', label: 'Ch Count', cmp: cmpNum },
  { key: 'dmxAddress',      label: 'DMX Address', cmp: cmpDmx, edit: true, width: 70, validate: validateDmx, normalise: normaliseDmx },
  { key: 'channel',         label: 'Channel',  cmp: cmpNum, edit: true, width: 56 },
  { key: 'purpose',         label: 'Purpose',  cmp: cmpNum, edit: true, width: 140 },
];
const EDIT_KEYS = COLUMNS.filter(c => c.edit).map(c => c.key);

// Spreadsheet-style text cell: local draft while focused, validated on commit.
function Cell({ col, fixture, onCommit, onNavigate, onPasteGrid }) {
  const value = fixture[col.key] ?? '';
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false); // Esc → the blur that follows must not commit
  useEffect(() => { if (!focused) { setDraft(String(value)); setError(null); } }, [value, focused]);

  function commit() {
    if (cancelledRef.current) { cancelledRef.current = false; return true; }
    const raw = draft.trim();
    const err = col.validate?.(raw) || null;
    setError(err);
    if (err) return false;
    const next = col.normalise ? col.normalise(raw) : raw;
    if (next !== String(value)) onCommit(fixture.id, { [col.key]: next });
    return true;
  }
  return (
    <input
      data-cell={`${fixture.id}:${col.key}`}
      style={{ ...styles.cellInput, width: col.width, ...(error ? styles.cellError : {}) }}
      value={draft}
      title={error ? `${error} — not saved` : undefined}
      placeholder={col.key === 'dmxAddress' ? 'U/Ch' : ''}
      onFocus={e => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); commit(); }}
      onChange={e => { setDraft(e.target.value); if (error) setError(null); }}
      onPaste={e => {
        const text = e.clipboardData.getData('text');
        // Single values paste normally; multi-cell clipboard fills down / across.
        if (!/[\t\n]/.test(text.trim())) return;
        e.preventDefault();
        setFocused(false);
        onPasteGrid(fixture.id, col.key, text);
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') { cancelledRef.current = true; setDraft(String(value)); setError(null); e.target.blur(); }
        else if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (e.key !== 'Enter' && e.altKey) return;
          e.preventDefault();
          if (commit()) onNavigate(fixture.id, col.key, (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) ? -1 : 1);
        }
      }}
    />
  );
}

export default function PatchPanel({ fixtures, allFixtureTypes, selectedIds = [], onUpdateFixture, onUpdateMany, onShowOnPlot, onClose }) {
  const [filterUniverse, setFilterUniverse] = useState('');
  const [search, setSearch] = useState('');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'dmxAddress', dir: 1 });
  const bodyRef = useRef(null);
  const conflicts = findDmxConflicts(fixtures);
  const selSet = new Set(selectedIds);

  // Row order is frozen while a cell is being edited, so committing a value
  // doesn't make the row jump away mid-edit. It re-sorts on the next sort
  // change or when focus leaves the table.
  const [frozenOrder, setFrozenOrder] = useState(null);

  const col = COLUMNS.find(c => c.key === sort.key) || COLUMNS[5];
  const sortedLive = [...fixtures].sort((a, b) =>
    (col.cmp(a[col.key], b[col.key]) * sort.dir) || cmpDmx(a.dmxAddress, b.dmxAddress) || cmpNum(a.unit, b.unit));
  const byId = Object.fromEntries(fixtures.map(f => [f.id, f]));
  const sorted = frozenOrder
    ? [...frozenOrder.map(id => byId[id]).filter(Boolean), ...sortedLive.filter(f => !frozenOrder.includes(f.id))]
    : sortedLive;

  const universes = [...new Set(fixtures.map(f => parseDmx(f.dmxAddress)?.universe).filter(Boolean))].sort((a, b) => a - b);
  const q = search.trim().toLowerCase();
  const filtered = sorted.filter(f =>
    (!filterUniverse || String(parseDmx(f.dmxAddress)?.universe) === filterUniverse) &&
    (!conflictsOnly || conflicts.has(f.id)) &&
    (!q || ['position', 'unit', 'type', 'dmxAddress', 'channel', 'purpose', 'label'].some(k => String(f[k] ?? '').toLowerCase().includes(q))));

  // Scroll the first selected fixture into view when the panel opens.
  useEffect(() => {
    const first = filtered.find(f => selSet.has(f.id));
    if (first) bodyRef.current?.querySelector(`[data-row="${first.id}"]`)?.scrollIntoView({ block: 'center' });
  }, []);

  function toggleSort(key) {
    setFrozenOrder(null);
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }

  function focusCell(id, key) {
    const el = bodyRef.current?.querySelector(`[data-cell="${id}:${key}"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  }
  function navigate(id, key, delta) {
    const i = filtered.findIndex(f => f.id === id);
    const next = filtered[i + delta];
    if (next) setTimeout(() => focusCell(next.id, key), 0);
  }

  // Clipboard grid (rows by newline, cells by tab) → editable columns to the
  // right of `startKey`, rows downward from `startId` in the current order.
  function pasteGrid(startId, startKey, text) {
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(r => r.split('\t'));
    const startRow = filtered.findIndex(f => f.id === startId);
    const startCol = EDIT_KEYS.indexOf(startKey);
    const updates = [], errors = [];
    rows.forEach((cells, r) => {
      const f = filtered[startRow + r]; if (!f) return;
      const fields = {};
      cells.forEach((raw, c) => {
        const key = EDIT_KEYS[startCol + c]; if (!key) return;
        const colDef = COLUMNS.find(cd => cd.key === key);
        const v = raw.trim();
        const err = colDef.validate?.(v);
        if (err) { errors.push(`${f.unit ? `Unit ${f.unit}` : f.type}: "${v}"`); return; }
        fields[key] = colDef.normalise ? colDef.normalise(v) : v;
      });
      if (Object.keys(fields).length) updates.push({ id: f.id, fields });
    });
    if (updates.length) onUpdateMany(updates, `Paste into ${updates.length} patch row${updates.length !== 1 ? 's' : ''}`);
    const dropped = Math.max(0, rows.length - (filtered.length - startRow));
    const notes = [];
    if (errors.length) notes.push(`${errors.length} invalid value${errors.length !== 1 ? 's' : ''} skipped (${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '…' : ''})`);
    if (dropped) notes.push(`${dropped} row${dropped !== 1 ? 's' : ''} past the end of the list ignored`);
    return notes;
  }

  const [pasteNote, setPasteNote] = useState(null);

  return (
    <div style={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.window}>
        <div style={styles.titleBar}>
          <span style={styles.title}>DMX Patch</span>
          <div style={styles.actions}>
            <input style={styles.search} placeholder="Filter…" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setSearch(''); e.stopPropagation(); }} aria-label="Filter patch rows" />
            {universes.length > 0 && (
              <select style={styles.select} value={filterUniverse} onChange={e => setFilterUniverse(e.target.value)}>
                <option value="">All Universes</option>
                {universes.map(u => <option key={u} value={u}>Universe {u}</option>)}
              </select>
            )}
            {conflicts.size > 0 && (
              <button style={{ ...styles.conflictBadge, ...(conflictsOnly ? styles.conflictOn : {}) }} onClick={() => setConflictsOnly(v => !v)}
                title={conflictsOnly ? 'Show all fixtures' : 'Show only fixtures with overlapping addresses'}>
                ⚠ {conflicts.size} conflict{conflicts.size > 1 ? 's' : ''}{conflictsOnly ? ' (filtered)' : ''}
              </button>
            )}
            <span style={styles.count}>{filtered.length === fixtures.length ? `${fixtures.length} fixtures` : `${filtered.length} of ${fixtures.length}`}</span>
            <button style={{ ...styles.btn, ...styles.closeBtn }} onClick={onClose} aria-label="Close patch">✕</button>
          </div>
        </div>
        <div style={styles.helpBar}>
          Click a header to sort · Enter / ↓ moves down a column · Paste a column (or block) from a spreadsheet to fill down · ⌖ shows the fixture on the plot
          {pasteNote && <span style={styles.pasteNote}> — {pasteNote}</span>}
        </div>

        <div style={styles.body} ref={bodyRef}
          onFocus={() => { if (!frozenOrder) setFrozenOrder(sorted.map(f => f.id)); }}
          onBlur={e => { if (!bodyRef.current.contains(e.relatedTarget)) setFrozenOrder(null); }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 24 }} />
                {COLUMNS.map(c => (
                  <th key={c.key} style={{ ...styles.th, cursor: 'pointer' }} onClick={() => toggleSort(c.key)}
                    aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const ftype = allFixtureTypes.find(t => t.id === f.fixtureTypeId);
                const hasModes = ftype?.modes?.length > 0;
                const conflict = conflicts.has(f.id);
                return (
                  <tr key={f.id} data-row={f.id} style={{
                    ...(i % 2 === 0 ? {} : { background: 'rgba(255,255,255,0.03)' }),
                    ...(selSet.has(f.id) ? { background: 'rgba(74,144,217,0.16)' } : {}),
                    ...(conflict ? { background: 'rgba(252,129,129,0.08)' } : {}),
                  }}>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {onShowOnPlot && <button style={styles.locate} title="Show on plot" aria-label="Show on plot" onClick={() => onShowOnPlot(f)}>⌖</button>}
                    </td>
                    {COLUMNS.map(c => {
                      if (c.edit) {
                        return (
                          <td key={c.key} style={styles.td}>
                            <Cell col={c} fixture={f} onCommit={onUpdateFixture} onNavigate={navigate}
                              onPasteGrid={(id, key, text) => { const notes = pasteGrid(id, key, text); setPasteNote(notes.length ? notes.join('; ') : null); }} />
                            {c.key === 'dmxAddress' && conflict && <span style={styles.conflictIcon} title="DMX conflict">⚠</span>}
                          </td>
                        );
                      }
                      if (c.key === 'dmxMode') {
                        return (
                          <td key={c.key} style={styles.td}>
                            {hasModes ? (
                              <select style={styles.cellSelect} value={f.dmxMode || ''} onChange={e => {
                                const mode = ftype.modes.find(m => m.name === e.target.value);
                                onUpdateFixture(f.id, { dmxMode: e.target.value, dmxChannelCount: mode?.channelCount || 1 });
                              }}>
                                {ftype.modes.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                              </select>
                            ) : <span style={styles.dimText}>—</span>}
                          </td>
                        );
                      }
                      if (c.key === 'dmxChannelCount') return <td key={c.key} style={{ ...styles.td, textAlign: 'center' }}>{f.dmxChannelCount || 1}</td>;
                      return <td key={c.key} style={styles.td}>{f[c.key] || '—'}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p style={{ color: '#718096', padding: 20, textAlign: 'center' }}>
              {fixtures.length ? 'No fixtures match the current filter.' : 'No fixtures in the plot.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  window: {
    background: '#16213e',
    border: '1px solid #0f3460',
    borderRadius: 6,
    width: '92vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid #0f3460', flexShrink: 0,
  },
  title: { color: '#4a90d9', fontWeight: 700, fontSize: 14 },
  actions: { display: 'flex', gap: 8, alignItems: 'center' },
  helpBar: { padding: '4px 16px', fontSize: 10, color: '#4a5568', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  pasteNote: { color: '#f6e05e' },
  count: { fontSize: 11, color: '#718096' },
  search: {
    background: '#0d1b2a', border: '1px solid #0f3460', color: '#e0e0e0',
    borderRadius: 4, padding: '4px 8px', fontSize: 12, width: 160, outline: 'none',
  },
  conflictBadge: {
    background: '#3a1a1a', color: '#fc8181', border: '1px solid #3a1a1a',
    padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
  },
  conflictOn: { borderColor: '#fc8181' },
  btn: {
    background: '#0f3460', border: '1px solid #1a4a7a',
    borderRadius: 4, color: '#a0aec0', padding: '4px 12px', cursor: 'pointer', fontSize: 12,
  },
  closeBtn: { background: '#3a1a1a', borderColor: '#7a2a2a', color: '#fc8181' },
  select: {
    background: '#0d1b2a', border: '1px solid #0f3460',
    color: '#a0aec0', borderRadius: 4, padding: '4px 8px', fontSize: 12,
  },
  body: { overflowY: 'auto', padding: '0 0 12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e0e0e0' },
  th: {
    padding: '8px 12px', textAlign: 'left',
    background: '#0d1b2a', color: '#4a90d9',
    borderBottom: '2px solid #0f3460',
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
    position: 'sticky', top: 0, userSelect: 'none', whiteSpace: 'nowrap',
  },
  td: { padding: '4px 8px', borderBottom: '1px solid #0f3460', verticalAlign: 'middle' },
  cellInput: {
    background: '#0d1b2a', border: '1px solid #0f3460',
    borderRadius: 3, color: '#e0e0e0', fontSize: 12,
    padding: '2px 6px', width: 80, outline: 'none',
  },
  cellError: { borderColor: '#fc8181', color: '#fc8181' },
  cellSelect: {
    background: '#0d1b2a', border: '1px solid #0f3460',
    borderRadius: 3, color: '#e0e0e0', fontSize: 11, padding: '2px 4px',
  },
  locate: { background: 'none', border: 'none', color: '#4a90d9', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 },
  conflictIcon: { color: '#fc8181', marginLeft: 4, fontSize: 12 },
  dimText: { color: '#4a5568' },
};
