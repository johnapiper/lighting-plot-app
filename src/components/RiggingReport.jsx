import React, { useMemo } from 'react';
import { analyzeRig, rigReportCsv } from '../rigging/loads';
import { ipcRenderer } from '../bridge';
import { toast } from './Toast';

/**
 * Rig load report for the active plot: every bar's weight, rating and hoist
 * loads with warnings. Exports as CSV.
 */
const STATUS_COLOR = { ok: '#34d399', warn: '#f6ad55', error: '#f87171' };
const r1 = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10));
const pct = (u) => (u == null ? '' : `${Math.round(u * 100)}%`);

export default function RiggingReport({ drawing, fixtureTypes, title, onClose, onSelectPipe }) {
  const analysis = useMemo(() => analyzeRig(drawing || {}, fixtureTypes), [drawing, fixtureTypes]);

  function exportCsv() {
    if (!ipcRenderer) return;
    const safe = (title || 'lighting-plot').replace(/[\\/:*?"<>|]/g, '-');
    ipcRenderer.send('export-csv', { filename: `${safe} - rigging.csv`, csv: rigReportCsv(analysis) });
    toast('Rig report CSV saved', 'success', { duration: 2000 });
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>🏗 Rigging &amp; Load Report</span>
          <span style={{ ...S.badge, background: STATUS_COLOR[analysis.status] }}>
            {analysis.status === 'ok' ? 'No problems found' : analysis.status === 'warn' ? 'Needs checking' : 'Over limit'}
          </span>
          <div style={{ flex: 1 }} />
          <button style={S.btn} onClick={exportCsv} disabled={!analysis.bars.length}>Export CSV</button>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          {!analysis.bars.length && (
            <div style={S.empty}>No bars carry fixtures yet. Hang fixtures on a pipe or truss, then add hoists to it in the Inspector.</div>
          )}

          {analysis.bars.length > 0 && (
            <div style={S.totals}>
              {analysis.bars.length} bar{analysis.bars.length === 1 ? '' : 's'} · {analysis.totals.fixtures} fixtures · {analysis.totals.hoists} hoists ·
              {' '}<b>{r1(analysis.totals.totalKg)} kg</b> total ({r1(analysis.totals.fixtureKg)} kg fixtures, {r1(analysis.totals.selfKg)} kg structure)
            </div>
          )}

          {analysis.bars.map(b => (
            <div key={b.pipeId} style={S.bar}>
              <div style={S.barHead}>
                <span style={{ ...S.dot, background: STATUS_COLOR[b.status] }} />
                <b style={{ cursor: onSelectPipe ? 'pointer' : 'default' }} onClick={() => onSelectPipe?.(b.pipeId)}>{b.name}</b>
                <span style={S.muted}>{b.type} · {(b.lengthMm / 1000).toFixed(2)} m{b.heightM ? ` · ${b.heightM} m high` : ''}</span>
                <div style={{ flex: 1 }} />
                <span><b>{r1(b.totalKg)} kg</b>{b.capacityKg ? ` of ${b.capacityKg} kg (${pct(b.utilisation)})` : ''}</span>
              </div>
              <div style={S.split}>
                structure {r1(b.selfKg)} kg · extra {r1(b.extraKg)} kg · {b.fixtures.length} fixture{b.fixtures.length === 1 ? '' : 's'} {r1(b.fixtureKg)} kg
              </div>
              {b.supports.length > 0 && (
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Hoist</th><th style={S.thR}>Position</th><th style={S.thR}>Load</th><th style={S.thR}>Rating</th><th style={S.thR}>Used</th></tr></thead>
                  <tbody>
                    {b.supports.map(s => (
                      <tr key={s.id}>
                        <td style={S.td}>{s.label}</td>
                        <td style={S.tdR}>{Math.round(s.pos)} mm</td>
                        <td style={{ ...S.tdR, color: s.uplift || (s.utilisation ?? 0) > 1 ? '#f87171' : undefined }}>{r1(s.reactionKg)} kg</td>
                        <td style={S.tdR}>{s.capacityKg ? `${s.capacityKg} kg` : '—'}</td>
                        <td style={S.tdR}>{pct(s.utilisation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {b.warnings.filter(w => w.level !== 'info' || b.warnings.length === 1).map((w, i) => (
                <div key={i} style={{ ...S.warn, color: w.level === 'error' ? '#f87171' : w.level === 'warn' ? '#f6ad55' : 'var(--text-dim)' }}>
                  {w.level === 'error' ? '⛔ ' : w.level === 'warn' ? '⚠ ' : 'ℹ '}{w.message}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={S.footer}>
          Planning estimate only, not an engineering certification. Loads assume rigid, level hoists and a bar of constant stiffness; truss shear, chain stretch, dynamic loads and safety factors are not modelled.
          Fixtures without a weight use an assumed 5 kg. Have a qualified rigger verify against the manufacturer's rated capacities.
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 },
  modal: { background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, width: 760, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.8)', color: 'var(--text)' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 },
  badge: { color: '#10151f', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '2px 8px' },
  btn: { padding: '4px 12px', background: 'var(--border)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 11 },
  x: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 },
  body: { padding: '12px 16px', overflow: 'auto', flex: 1 },
  empty: { color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' },
  totals: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 },
  bar: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 },
  barHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  dot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  muted: { color: 'var(--text-dim)', fontSize: 11 },
  split: { color: 'var(--text-dim)', fontSize: 11, margin: '3px 0 6px 17px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginLeft: 0 },
  th: { textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, padding: '2px 6px', borderBottom: '1px solid var(--border)' },
  thR: { textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, padding: '2px 6px', borderBottom: '1px solid var(--border)' },
  td: { padding: '2px 6px' },
  tdR: { padding: '2px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  warn: { fontSize: 11, marginTop: 4, lineHeight: 1.35 },
  footer: { padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.45 },
};
