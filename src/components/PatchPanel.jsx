import React, { useState } from 'react';

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

export default function PatchPanel({ fixtures, allFixtureTypes, onUpdateFixture, onClose }) {
  const [filterUniverse, setFilterUniverse] = useState('');
  const conflicts = findDmxConflicts(fixtures);

  const sorted = [...fixtures].sort((a, b) => {
    const pa = parseDmx(a.dmxAddress);
    const pb = parseDmx(b.dmxAddress);
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.universe !== pb.universe) return pa.universe - pb.universe;
    return pa.channel - pb.channel;
  });

  const universes = [...new Set(sorted.map(f => parseDmx(f.dmxAddress)?.universe).filter(Boolean))];

  const filtered = filterUniverse
    ? sorted.filter(f => String(parseDmx(f.dmxAddress)?.universe) === filterUniverse)
    : sorted;

  function handleDmxChange(id, val) {
    onUpdateFixture(id, { dmxAddress: val });
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        <div style={styles.titleBar}>
          <span style={styles.title}>DMX Patch</span>
          <div style={styles.actions}>
            {universes.length > 0 && (
              <select style={styles.select} value={filterUniverse} onChange={e => setFilterUniverse(e.target.value)}>
                <option value="">All Universes</option>
                {universes.map(u => <option key={u} value={u}>Universe {u}</option>)}
              </select>
            )}
            {conflicts.size > 0 && (
              <span style={styles.conflictBadge}>⚠ {conflicts.size} conflict{conflicts.size > 1 ? 's' : ''}</span>
            )}
            <button style={{ ...styles.btn, ...styles.closeBtn }} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={styles.body}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Position', 'Unit#', 'Type', 'Mode', 'Ch Count', 'DMX Address', 'Channel', 'Purpose'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const ftype = allFixtureTypes.find(t => t.id === f.fixtureTypeId);
                const hasModes = ftype?.modes?.length > 0;
                const conflict = conflicts.has(f.id);
                return (
                  <tr key={f.id} style={{
                    ...(i % 2 === 0 ? {} : { background: 'rgba(255,255,255,0.03)' }),
                    ...(conflict ? { background: 'rgba(252,129,129,0.08)' } : {}),
                  }}>
                    <td style={styles.td}>{f.position || '—'}</td>
                    <td style={styles.td}>{f.unit || '—'}</td>
                    <td style={styles.td}>{f.type}</td>
                    <td style={styles.td}>
                      {hasModes ? (
                        <select style={styles.cellSelect} value={f.dmxMode || ''} onChange={e => {
                          const mode = ftype.modes.find(m => m.name === e.target.value);
                          onUpdateFixture(f.id, { dmxMode: e.target.value, dmxChannelCount: mode?.channelCount || 1 });
                        }}>
                          {ftype.modes.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      ) : <span style={styles.dimText}>—</span>}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{f.dmxChannelCount || 1}</td>
                    <td style={styles.td}>
                      <input
                        style={{
                          ...styles.cellInput,
                          ...(conflict ? { borderColor: '#fc8181', color: '#fc8181' } : {}),
                        }}
                        value={f.dmxAddress || ''}
                        placeholder="U/Ch"
                        onChange={e => handleDmxChange(f.id, e.target.value)}
                      />
                      {conflict && <span style={styles.conflictIcon} title="DMX conflict">⚠</span>}
                    </td>
                    <td style={styles.td}>{f.channel || '—'}</td>
                    <td style={styles.td}>{f.purpose || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p style={{ color: '#718096', padding: 20, textAlign: 'center' }}>No fixtures in the plot.</p>
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
  conflictBadge: {
    background: '#3a1a1a', color: '#fc8181',
    padding: '3px 10px', borderRadius: 4, fontSize: 12,
  },
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
    position: 'sticky', top: 0,
  },
  td: { padding: '4px 8px', borderBottom: '1px solid #0f3460', verticalAlign: 'middle' },
  cellInput: {
    background: '#0d1b2a', border: '1px solid #0f3460',
    borderRadius: 3, color: '#e0e0e0', fontSize: 12,
    padding: '2px 6px', width: 80,
  },
  cellSelect: {
    background: '#0d1b2a', border: '1px solid #0f3460',
    borderRadius: 3, color: '#e0e0e0', fontSize: 11, padding: '2px 4px',
  },
  conflictIcon: { color: '#fc8181', marginLeft: 4, fontSize: 12 },
  dimText: { color: '#4a5568' },
};
