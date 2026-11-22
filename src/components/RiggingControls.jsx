import React, { useEffect, useState } from 'react';
import { suggestHoists, PIPE_KG_PER_M, TRUSS_KG_PER_M } from '../rigging/loads';

/**
 * Rigging section of the pipe/truss inspector: bar weight and rating, hoist
 * (pick-up) points, and the live load result from src/rigging/loads.js.
 */

// Small numeric input: free typing, commits on Enter/blur, Esc reverts, blank = "unset".
function Num({ value, onCommit, placeholder, width = 70, allowBlank = true, min }) {
  const fmt = (v) => (v == null || v === '' ? '' : String(v));
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(fmt(value)); }, [value, focused]);
  const commit = () => {
    const t = draft.trim();
    if (t === '') { if (allowBlank) onCommit(undefined); else setDraft(fmt(value)); return; }
    const n = Number(t);
    if (!isFinite(n) || (min != null && n < min)) { setDraft(fmt(value)); return; }
    if (n !== Number(value)) onCommit(n);
  };
  return (
    <input style={{ ...S.input, width }} value={draft} placeholder={placeholder} inputMode="decimal"
      onFocus={() => setFocused(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { setDraft(fmt(value)); e.target.blur(); }
      }} />
  );
}

const STATUS = { ok: ['#34d399', 'OK'], warn: ['#f6ad55', 'Check'], error: ['#f87171', 'Over limit'] };
const kg = (v) => (v == null ? '—' : `${(Math.round(v * 10) / 10).toString()} kg`);

export default function RiggingControls({ pipe, analysis, onUpdatePipe }) {
  const hoists = Array.isArray(pipe.hoists) ? pipe.hoists : [];
  const defaultPerM = pipe.type === 'truss' ? TRUSS_KG_PER_M : PIPE_KG_PER_M;
  const lengthMm = analysis?.lengthMm ?? Math.hypot(pipe.x2 - pipe.x1, pipe.y2 - pipe.y1);
  const set = (fields) => onUpdatePipe(pipe.id, fields);
  const setHoist = (i, fields) => set({ hoists: hoists.map((h, k) => (k === i ? { ...h, ...fields } : h)) });
  const newId = () => 'h' + Math.random().toString(36).slice(2, 8);
  const [color, label] = STATUS[analysis?.status || 'ok'];

  return (
    <div style={{ borderTop: '2px solid var(--border)' }}>
      <div style={S.title}>Rigging &amp; Load</div>

      <div style={S.row}><span style={S.k}>Weight (kg/m)</span>
        <Num value={pipe.weightKgPerM} placeholder={String(defaultPerM)} onCommit={v => set({ weightKgPerM: v })} min={0} /></div>
      <div style={S.row}><span style={S.k}>Rated capacity (kg)</span>
        <Num value={pipe.capacityKg} placeholder="none" onCommit={v => set({ capacityKg: v })} min={0} /></div>
      <div style={S.row}><span style={S.k}>Extra load (kg)</span>
        <Num value={pipe.extraKg} placeholder="0" onCommit={v => set({ extraKg: v })} min={0} /></div>

      <div style={S.sub}>Hoists / pick-up points</div>
      {hoists.length === 0 && <div style={S.hint}>No hoists yet. Add them to see how the load is shared.</div>}
      {hoists.map((h, i) => {
        const s = analysis?.supports?.find(x => x.id === h.id) || analysis?.supports?.[i];
        const bad = s && (s.uplift || (s.utilisation != null && s.utilisation > 1));
        return (
          <div key={h.id || i} style={S.hoistRow}>
            <span style={S.k}>#{i + 1}</span>
            <Num value={Math.round(h.pos ?? 0)} onCommit={v => setHoist(i, { pos: v ?? 0 })} allowBlank={false} width={58} />
            <span style={S.unit}>mm</span>
            <Num value={h.capacityKg} placeholder="rating" onCommit={v => setHoist(i, { capacityKg: v })} width={54} min={0} />
            <span style={{ ...S.load, color: bad ? '#f87171' : 'var(--text)' }}>{s?.reactionKg != null ? kg(s.reactionKg) : ''}</span>
            <button style={S.x} title="Remove hoist" onClick={() => set({ hoists: hoists.filter((_, k) => k !== i) })}>×</button>
          </div>
        );
      })}
      <div style={S.btnRow}>
        <button style={S.btn} onClick={() => set({ hoists: [...hoists, { id: newId(), pos: Math.round(lengthMm / 2) }] })}>+ Hoist</button>
        {[2, 3, 4].map(n => (
          <button key={n} style={S.btn} title={`Replace with ${n} evenly placed hoists`}
            onClick={() => set({ hoists: suggestHoists(lengthMm, n).map((pos, i) => ({ id: hoists[i]?.id || newId(), pos, capacityKg: hoists[i]?.capacityKg })) })}>
            Auto {n}
          </button>
        ))}
      </div>
      <div style={S.hint}>Position is measured from the bar's first (left/start) end.</div>

      {analysis && (
        <div style={S.result}>
          <div style={S.row}>
            <span style={S.k}>Bar load</span>
            <span style={{ ...S.v, color }}>{kg(analysis.totalKg)}{analysis.capacityKg ? ` / ${analysis.capacityKg} kg (${Math.round(analysis.utilisation * 100)}%)` : ''}</span>
          </div>
          <div style={S.row}><span style={S.k}>Self / extra / fixtures</span>
            <span style={S.v}>{kg(analysis.selfKg)} / {kg(analysis.extraKg)} / {kg(analysis.fixtureKg)}</span></div>
          <div style={S.row}><span style={S.k}>Status</span><span style={{ ...S.v, color, fontWeight: 700 }}>{label}</span></div>
          {analysis.warnings.map((w, i) => (
            <div key={i} style={{ ...S.warn, color: w.level === 'error' ? '#f87171' : w.level === 'warn' ? '#f6ad55' : 'var(--text-dim)' }}>
              {w.level === 'error' ? '⛔ ' : w.level === 'warn' ? '⚠ ' : 'ℹ '}{w.message}
            </div>
          ))}
          <div style={S.disclaimer}>Planning estimate only — not an engineering certification. Have a qualified rigger verify against rated capacities.</div>
        </div>
      )}
    </div>
  );
}

const S = {
  title: { padding: '7px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  sub: { padding: '8px 10px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 10px', fontSize: 11 },
  hoistRow: { display: 'flex', alignItems: 'center', gap: 5, padding: '2px 10px', fontSize: 11 },
  k: { color: 'var(--text-muted)' },
  v: { color: 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  unit: { color: 'var(--text-dim)', fontSize: 10 },
  load: { marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 11 },
  input: { background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: 3, color: 'var(--text)', fontSize: 11, padding: '2px 5px', outline: 'none', boxSizing: 'border-box' },
  x: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '0 2px' },
  btnRow: { display: 'flex', gap: 4, padding: '6px 10px 2px', flexWrap: 'wrap' },
  btn: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: '3px 7px' },
  hint: { padding: '3px 10px', fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4 },
  result: { margin: '8px 0 0', padding: '6px 0 8px', borderTop: '1px solid var(--border)' },
  warn: { padding: '2px 10px', fontSize: 10.5, lineHeight: 1.35 },
  disclaimer: { padding: '6px 10px 0', fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.4 },
};
