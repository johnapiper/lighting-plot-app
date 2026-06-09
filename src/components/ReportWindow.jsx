import React from 'react';
import { buildInstrumentSchedule, buildChannelHookup, buildDimmerSchedule, fixturesToCSV, INSTRUMENT_COLUMNS } from '../paperwork/reports';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function ReportTable({ rows, columns }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {columns.map(c => <th key={c.key} style={styles.th}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id || i} style={i % 2 === 0 ? {} : { background: 'rgba(255,255,255,0.03)' }}>
            {columns.map(c => <td key={c.key} style={styles.td}>{r[c.key] ?? ''}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ReportWindow({ type, fixtures, onClose }) {
  const titles = {
    instrument: 'Instrument Schedule',
    channel: 'Channel Hookup',
    dimmer: 'Dimmer Schedule',
  };

  const sorted = type === 'instrument' ? buildInstrumentSchedule(fixtures)
    : type === 'channel' ? buildChannelHookup(fixtures)
    : buildDimmerSchedule(fixtures);

  const title = titles[type] || 'Report';

  function handlePrint() {
    window.print();
  }

  function handleCSV() {
    const csv = fixturesToCSV(sorted, INSTRUMENT_COLUMNS);
    if (ipcRenderer) {
      ipcRenderer.send('export-csv', { filename: `${title}.csv`, csv });
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title}.csv`;
      a.click();
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        <div style={styles.titleBar}>
          <span style={styles.title}>{title}</span>
          <div style={styles.actions}>
            <button style={styles.btn} onClick={handleCSV}>Export CSV</button>
            <button style={styles.btn} onClick={handlePrint}>Print</button>
            <button style={{ ...styles.btn, ...styles.closeBtn }} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={styles.body}>
          {sorted.length === 0
            ? <p style={{ color: '#718096', padding: 20 }}>No fixtures in the plot.</p>
            : <ReportTable rows={sorted} columns={INSTRUMENT_COLUMNS} />
          }
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
    width: '90vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #0f3460',
    flexShrink: 0,
  },
  title: { color: '#4a90d9', fontWeight: 700, fontSize: 14 },
  actions: { display: 'flex', gap: 8 },
  btn: {
    background: '#0f3460',
    border: '1px solid #1a4a7a',
    borderRadius: 4,
    color: '#a0aec0',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 12,
  },
  closeBtn: { background: '#3a1a1a', borderColor: '#7a2a2a', color: '#fc8181' },
  body: { overflowY: 'auto', padding: '0 0 12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e0e0e0' },
  th: {
    padding: '8px 12px', textAlign: 'left',
    background: '#0d1b2a', color: '#4a90d9',
    borderBottom: '2px solid #0f3460',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
    position: 'sticky', top: 0,
  },
  td: { padding: '6px 12px', borderBottom: '1px solid #0f3460' },
};
