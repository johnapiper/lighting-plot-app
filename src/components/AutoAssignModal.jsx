import React, { useMemo, useState } from 'react';
import {
  ORDER_MODES, selectScope, planNumbering, planPatch, describeChanges,
} from '../patch/autoAssign';
import { footprintOf, parseDmx } from '../patch/dmx';

/**
 * Rule-based auto-number / auto-patch. Shows a live preview of what would
 * change and applies it as ONE undo step through `onApply(updates, label)`.
 *
 *   updates = [{ id, fields }]  (fields go through the app's channel↔DMX sync)
 */
export default function AutoAssignModal({ fixtures, selectedIds, fixtureTypes, onApply, onClose }) {
  const [tab, setTab] = useState('number');                   // 'number' | 'patch'
  const [scope, setScope] = useState(selectedIds.length > 1 ? 'selected' : 'all');
  const [order, setOrder] = useState('reading');
  // numbering
  const [field, setField] = useState('unit');
  const [start, setStart] = useState('1');
  const [step, setStep] = useState('1');
  const [restart, setRestart] = useState(false);
  // patching
  const [addr, setAddr] = useState('1/1');
  const [gap, setGap] = useState('0');
  const [newUni, setNewUni] = useState(false);

  const targetField = tab === 'patch' ? 'dmxAddress' : field;
  const scoped = useMemo(
    () => selectScope(fixtures, { scope, selectedIds, field: targetField }),
    [fixtures, scope, selectedIds, targetField],
  );

  const result = useMemo(() => {
    if (!scoped.length) return { plan: new Map(), rows: [], error: null, overflow: [] };
    if (tab === 'number') {
      const plan = planNumbering(scoped, { start: Number(start), step: Number(step), order, restartPerPosition: restart });
      return { plan, rows: describeChanges(fixtures, plan, field), error: null, overflow: [] };
    }
    // Fixtures outside the scope keep their addresses — route around them.
    const inScope = new Set(scoped.map(f => f.id));
    const avoid = fixtures.filter(f => !inScope.has(f.id)).map(f => {
      const p = parseDmx(f.dmxAddress);
      return p && { u: p.universe, s: p.channel, e: p.channel + footprintOf(f, fixtureTypes) - 1 };
    });
    const { assignments, overflow, error } = planPatch(scoped, {
      start: addr, order, gap: Number(gap) || 0, newUniversePerPosition: newUni,
      sizeOf: f => footprintOf(f, fixtureTypes), avoid,
    });
    return { plan: assignments, rows: describeChanges(fixtures, assignments, 'dmxAddress'), error: error || null, overflow };
  }, [tab, scoped, fixtures, fixtureTypes, field, start, step, order, restart, addr, gap, newUni]);

  const canApply = !result.error && result.rows.length > 0;

  function apply() {
    const updates = [];
    for (const [id, value] of result.plan.entries()) {
      const f = fixtures.find(f => f.id === id);
      const key = tab === 'patch' ? 'dmxAddress' : field;
      if (f && String(f[key] ?? '') === String(value)) continue;
      updates.push({ id, fields: { [key]: value } });
    }
    const label = tab === 'patch'
      ? `Auto-patch ${updates.length} fixtures from ${addr}`
      : `Auto-number ${updates.length} fixtures (${field === 'unit' ? 'unit #' : 'channel'} from ${start})`;
    onApply(updates, label);
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span>⚙ Auto-number &amp; Patch</span>
          <button style={S.x} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={S.body}>
          <div style={S.tabs}>
            <button style={{ ...S.tab, ...(tab === 'number' ? S.tabOn : {}) }} onClick={() => setTab('number')}>Number</button>
            <button style={{ ...S.tab, ...(tab === 'patch' ? S.tabOn : {}) }} onClick={() => setTab('patch')}>Patch</button>
          </div>

          <div style={S.grid2}>
            <Lbl label="Apply to">
              <select style={S.inp} value={scope} onChange={e => setScope(e.target.value)}>
                <option value="all">All fixtures</option>
                <option value="selected" disabled={!selectedIds.length}>Selected ({selectedIds.length})</option>
                <option value="unset">{tab === 'patch' ? 'Unpatched only' : 'Fixtures without a value'}</option>
              </select>
            </Lbl>
            <Lbl label="Order">
              <select style={S.inp} value={order} onChange={e => setOrder(e.target.value)}>
                {ORDER_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Lbl>

            {tab === 'number' ? (
              <>
                <Lbl label="Field">
                  <select style={S.inp} value={field} onChange={e => setField(e.target.value)}
                    title="Channel also sets the DMX address in the fixture's universe, like the Inspector does.">
                    <option value="unit">Unit #</option>
                    <option value="channel">Channel</option>
                  </select>
                </Lbl>
                <div />
                <Lbl label="Start at"><input style={S.inp} type="number" min="1" value={start} onChange={e => setStart(e.target.value)} /></Lbl>
                <Lbl label="Step"><input style={S.inp} type="number" min="1" value={step} onChange={e => setStep(e.target.value)} /></Lbl>
                <label style={{ ...S.check, gridColumn: '1 / 3' }}>
                  <input type="checkbox" checked={restart} onChange={e => setRestart(e.target.checked)} /> Restart numbering on each position (pipe)
                </label>
              </>
            ) : (
              <>
                <Lbl label="Start address (Universe/Channel)"><input style={S.inp} value={addr} onChange={e => setAddr(e.target.value)} placeholder="1/1" /></Lbl>
                <Lbl label="Spare channels between fixtures"><input style={S.inp} type="number" min="0" value={gap} onChange={e => setGap(e.target.value)} /></Lbl>
                <label style={{ ...S.check, gridColumn: '1 / 3' }}>
                  <input type="checkbox" checked={newUni} onChange={e => setNewUni(e.target.checked)} /> Start a new universe for each position (pipe)
                </label>
                <div style={{ ...S.note, gridColumn: '1 / 3' }}>
                  Steps by each fixture's channel footprint, skips ranges used by fixtures outside this selection, and rolls into the next universe after 512. Channel numbers follow the new address.
                </div>
              </>
            )}
          </div>

          <div style={S.secLabel}>Preview — {result.rows.length} change{result.rows.length === 1 ? '' : 's'} of {scoped.length} fixture{scoped.length === 1 ? '' : 's'}</div>
          {result.error && <div style={S.err}>{result.error}</div>}
          {result.overflow.length > 0 && <div style={S.err}>{result.overflow.length} fixture(s) could not be fitted into the available universes.</div>}
          <div style={S.preview}>
            {result.rows.slice(0, 40).map(r => (
              <div key={r.id} style={S.row}>
                <span style={S.rowLabel}>{r.label}</span>
                <span style={S.from}>{r.from || '—'}</span>
                <span style={S.arrow}>→</span>
                <span style={S.to}>{r.to}</span>
              </div>
            ))}
            {result.rows.length > 40 && <div style={S.more}>…and {result.rows.length - 40} more</div>}
            {!result.rows.length && !result.error && <div style={S.more}>{scoped.length ? 'Nothing would change.' : 'No fixtures match this scope.'}</div>}
          </div>

          <div style={S.footer}>
            <button style={S.cancel} onClick={onClose}>Cancel</button>
            <button style={{ ...S.go, opacity: canApply ? 1 : 0.5 }} disabled={!canApply} onClick={apply}>
              Apply{canApply ? ` (${result.rows.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
      {label}{children}
    </label>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 },
  modal: { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:8, width:520, maxWidth:'94vw', maxHeight:'92vh', overflow:'auto', boxShadow:'0 12px 40px rgba(0,0,0,0.8)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--text)' },
  x: { background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:16 },
  body: { padding:'14px 16px' },
  tabs: { display:'flex', gap:6, marginBottom:12 },
  tab: { flex:1, padding:'6px', background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-muted)', cursor:'pointer', fontSize:12 },
  tabOn: { background:'var(--border)', color:'var(--accent)', borderColor:'var(--accent)' },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  inp: { width:'100%', boxSizing:'border-box', background:'var(--bg-inset)', border:'1px solid var(--border-strong)', borderRadius:4, color:'var(--text)', fontSize:12, padding:'6px 8px', outline:'none' },
  check: { display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted)' },
  note: { fontSize:11, color:'var(--text-dim)', lineHeight:1.4 },
  secLabel: { fontSize:10, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.08em', margin:'14px 0 6px' },
  err: { fontSize:11, color:'var(--warn-text)', marginBottom:6 },
  preview: { background:'var(--bg-inset)', border:'1px solid var(--border)', borderRadius:4, maxHeight:180, overflow:'auto', padding:4 },
  row: { display:'flex', alignItems:'center', gap:8, fontSize:11, padding:'2px 6px', color:'var(--text-muted)' },
  rowLabel: { flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  from: { color:'var(--text-dim)', minWidth:44, textAlign:'right', fontVariantNumeric:'tabular-nums' },
  arrow: { color:'var(--text-dim)' },
  to: { color:'var(--accent-soft)', minWidth:44, fontWeight:600, fontVariantNumeric:'tabular-nums' },
  more: { fontSize:11, color:'var(--text-dim)', padding:'4px 6px' },
  footer: { display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 },
  cancel: { padding:'6px 16px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-muted)', cursor:'pointer', fontSize:12 },
  go: { padding:'6px 18px', background:'var(--border)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--accent)', cursor:'pointer', fontSize:12, fontWeight:600 },
};
