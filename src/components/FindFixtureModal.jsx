import React, { useState, useEffect, useRef } from 'react';

// Ctrl+F — find fixtures in the active plot by channel, unit, address, type,
// position, purpose or label. Enter / click zooms to and selects the fixture.
//
// Query forms:
//   147        exact channel or unit number first, then anything containing "147"
//   ch 147     channel only        u 3     unit only        2/101   DMX address
//   source 4   free text across type, position, purpose, label, colour, gobo
const FIELDS = [
  ['channel', 'Ch'], ['unit', 'Unit'], ['dmxAddress', 'DMX'], ['type', 'Type'],
  ['position', 'Position'], ['purpose', 'Purpose'], ['label', 'Label'], ['colour', 'Colour'], ['gobo', 'Gobo'],
];

function norm(v) { return String(v ?? '').trim().toLowerCase(); }

// Score a fixture against a query; 0 = no match. Higher ranks first.
function score(f, q) {
  const scoped = q.match(/^(ch|chan|channel|u|unit)\s*[:#]?\s*(.+)$/);
  if (scoped) {
    const field = scoped[1].startsWith('u') ? 'unit' : 'channel';
    return norm(f[field]) === scoped[2] ? 100 : 0;
  }
  if (q.includes('/')) return norm(f.dmxAddress) === q ? 100 : norm(f.dmxAddress).startsWith(q) ? 60 : 0;
  if (norm(f.channel) === q) return 100;
  if (norm(f.unit) === q) return 90;
  // Every word must appear somewhere; earlier fields weigh more.
  const words = q.split(/\s+/);
  let total = 0;
  for (const w of words) {
    let best = 0;
    FIELDS.forEach(([k], i) => {
      const v = norm(f[k]);
      if (!v) return;
      const s = v === w ? 50 : v.startsWith(w) ? 30 : v.includes(w) ? 15 : 0;
      if (s) best = Math.max(best, s - i);
    });
    if (!best) return 0;
    total += best;
  }
  return total;
}

function numericCompare(a, b) {
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export default function FindFixtureModal({ fixtures, onGoTo, onSelectAll, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = norm(query);
  const results = q
    ? fixtures.map(f => ({ f, s: score(f, q) })).filter(r => r.s > 0)
        .sort((a, b) => (b.s - a.s) || numericCompare(a.f.channel, b.f.channel)).map(r => r.f)
    : [...fixtures].sort((a, b) => numericCompare(a.channel, b.channel) || numericCompare(a.unit, b.unit));
  const shown = results.slice(0, 200);
  const cur = Math.min(cursor, Math.max(0, shown.length - 1));

  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => {
    listRef.current?.children[cur]?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(cur + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(cur - 1, 0)); }
    else if (e.key === 'Enter' && shown[cur]) {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && q) { onSelectAll(results); onClose(); }
      else { onGoTo(shown[cur]); if (!e.shiftKey) onClose(); } // Shift+Enter: preview, keep open
    }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    e.stopPropagation();
  }

  return (
    <div style={S.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modal} role="dialog" aria-label="Find fixture">
        <input ref={inputRef} style={S.input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Find fixture — channel, unit, 1/101, type, position, purpose…" aria-label="Search fixtures" />
        <div style={S.meta}>
          <span>{q ? `${results.length} match${results.length !== 1 ? 'es' : ''}` : `${fixtures.length} fixtures`}</span>
          <span style={{ flex: 1 }} />
          <span style={S.hint}>↑↓ move · Enter go · Shift+Enter preview · Ctrl+Enter select all matches</span>
        </div>
        <div ref={listRef} style={S.list} role="listbox">
          {shown.map((f, i) => (
            <div key={f.id} role="option" aria-selected={i === cur}
              style={{ ...S.row, ...(i === cur ? S.rowActive : {}) }}
              onMouseEnter={() => setCursor(i)}
              onClick={e => { onGoTo(f); if (!e.shiftKey) onClose(); }}>
              <span style={S.ch}>{f.channel ? `Ch ${f.channel}` : '—'}</span>
              <span style={S.main}>
                <span style={S.type}>{f.type || 'Fixture'}</span>
                <span style={S.sub}>
                  {[f.position && `${f.position}${f.unit ? ` #${f.unit}` : ''}`, !f.position && f.unit && `Unit ${f.unit}`, f.purpose, f.label]
                    .filter(Boolean).join(' · ') || ' '}
                </span>
              </span>
              <span style={S.addr}>{f.dmxAddress || ''}</span>
            </div>
          ))}
          {!shown.length && <div style={S.empty}>{fixtures.length ? 'No fixtures match.' : 'There are no fixtures in this plot.'}</div>}
          {results.length > shown.length && <div style={S.empty}>Showing the first {shown.length} — refine your search.</div>}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', justifyContent:'center', alignItems:'flex-start', paddingTop:'12vh', zIndex:1300 },
  modal: { width:560, maxWidth:'92vw', background:'#16213e', border:'1px solid #0f3460', borderRadius:8, boxShadow:'0 16px 48px rgba(0,0,0,0.85)', display:'flex', flexDirection:'column', overflow:'hidden' },
  input: { background:'#0d1b2a', border:'none', borderBottom:'1px solid #0f3460', color:'#e0e0e0', fontSize:15, padding:'12px 16px', outline:'none' },
  meta: { display:'flex', padding:'5px 16px', fontSize:10, color:'#718096', borderBottom:'1px solid #0f3460' },
  hint: { color:'#4a5568' },
  list: { maxHeight:'50vh', overflowY:'auto' },
  row: { display:'flex', alignItems:'center', gap:12, padding:'6px 16px', cursor:'pointer', borderLeft:'3px solid transparent' },
  rowActive: { background:'#0f3460', borderLeftColor:'#4a90d9' },
  ch: { width:64, flexShrink:0, color:'#90cdf4', fontWeight:700, fontSize:13, fontVariantNumeric:'tabular-nums' },
  main: { flex:1, display:'flex', flexDirection:'column', minWidth:0 },
  type: { fontSize:12, color:'#e0e0e0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  sub: { fontSize:10, color:'#718096', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  addr: { fontSize:11, color:'#a0aec0', fontVariantNumeric:'tabular-nums' },
  empty: { padding:'18px 16px', fontSize:12, color:'#4a5568', textAlign:'center' },
};
