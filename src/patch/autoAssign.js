/**
 * Rule-based auto-numbering and auto-patching.
 *
 * Pure functions: they take fixtures + options and return a PLAN (what each
 * fixture would be set to) so the UI can preview it and apply it as one undo step.
 */
import { parseDmxStrict, formatDmx } from './dmx';

export const ORDER_MODES = [
  { id: 'reading',  label: 'Plot reading order (rows top→bottom, then left→right)' },
  { id: 'position', label: 'By position (pipe name), then left→right' },
  { id: 'x',        label: 'Left → right' },
  { id: 'y',        label: 'Top → bottom (upstage → downstage)' },
  { id: 'existing', label: 'Existing unit # / channel order' },
];

const ROW_BAND_MM = 100;
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? Infinity : n; };
const posKey = (f) => String(f.position || '').trim();
const rowOf = (f) => Math.round((f.y || 0) / ROW_BAND_MM);

/** Stable sort of fixtures per an ORDER_MODES id. Returns a new array. */
export function orderFixtures(fixtures, mode = 'reading') {
  const withIdx = fixtures.map((f, i) => ({ f, i }));
  const cmp = {
    reading:  (a, b) => (rowOf(a.f) - rowOf(b.f)) || ((a.f.x || 0) - (b.f.x || 0)),
    position: (a, b) => posKey(a.f).localeCompare(posKey(b.f), undefined, { numeric: true }) || ((a.f.x || 0) - (b.f.x || 0)),
    x:        (a, b) => (a.f.x || 0) - (b.f.x || 0),
    y:        (a, b) => (a.f.y || 0) - (b.f.y || 0),
    existing: (a, b) => (num(a.f.unit) - num(b.f.unit)) || (num(a.f.channel) - num(b.f.channel)),
  }[mode] || (() => 0);
  return withIdx.sort((a, b) => (cmp(a, b) || a.i - b.i)).map(x => x.f);
}

/** Which fixtures a rule applies to. scope: 'all' | 'selected' | 'unset' (fixtures with no value in `field`). */
export function selectScope(fixtures, { scope = 'all', selectedIds = [], field = 'unit' } = {}) {
  if (scope === 'selected') { const s = new Set(selectedIds); return fixtures.filter(f => s.has(f.id)); }
  if (scope === 'unset') {
    return fixtures.filter(f => field === 'dmxAddress' ? !parseDmxStrict(f.dmxAddress) : (f[field] === undefined || f[field] === null || String(f[field]).trim() === ''));
  }
  return fixtures;
}

/**
 * Number fixtures sequentially.
 * opts: { field: 'unit'|'channel', start=1, step=1, order='reading',
 *         restartPerPosition=false, startPerPosition=false (round start up to next 10/100 per position) }
 * Returns Map(id → value-as-string).
 */
export function planNumbering(fixtures, opts = {}) {
  const { field = 'unit', start = 1, step = 1, order = 'reading', restartPerPosition = false } = opts;
  const out = new Map();
  const ordered = orderFixtures(fixtures, order);
  let next = Number(start) || 1;
  const inc = Number(step) || 1;
  let lastPos = null;
  for (const f of ordered) {
    if (restartPerPosition && lastPos !== null && posKey(f) !== lastPos) next = Number(start) || 1;
    lastPos = posKey(f);
    out.set(f.id, String(next));
    next += inc;
  }
  return { assignments: out, field };
}

/**
 * Patch fixtures sequentially from a start address.
 * opts: {
 *   start: '1/1', order='reading', gap=0 (spare channels between fixtures),
 *   sizeOf(f)=>channels (default 1),
 *   newUniversePerPosition=false,
 *   avoid: [{u,s,e}]  — ranges taken by fixtures that are NOT being re-patched
 * }
 * Returns { assignments: Map(id → "u/c"), overflow: ids that couldn't fit }.
 */
export function planPatch(fixtures, opts = {}) {
  const { start = '1/1', order = 'reading', gap = 0, sizeOf = () => 1, newUniversePerPosition = false, avoid = [], maxUniverse = 64 } = opts;
  const p = parseDmxStrict(start);
  const assignments = new Map();
  const overflow = [];
  if (!p) return { assignments, overflow, error: 'Start address must be Universe/Channel, e.g. 1/1' };

  const byU = {};
  avoid.forEach(r => { if (r) (byU[r.u] = byU[r.u] || []).push(r); });
  const overlaps = (u, s, e) => (byU[u] || []).some(r => s <= r.e && r.s <= e);

  let u = p.universe, c = p.channel;
  let lastPos = null;
  for (const f of orderFixtures(fixtures, order)) {
    const size = Math.max(1, sizeOf(f));
    if (newUniversePerPosition && lastPos !== null && posKey(f) !== lastPos) { u++; c = 1; }
    lastPos = posKey(f);
    // Advance past channel 512 or any occupied block.
    for (;;) {
      if (c + size - 1 > 512) { u++; c = 1; }
      if (u >= p.universe + maxUniverse) break;
      const clash = (byU[u] || []).find(r => c <= r.e && r.s <= c + size - 1);
      if (!clash) break;
      c = clash.e + 1;
    }
    if (u >= p.universe + maxUniverse || overlaps(u, c, c + size - 1)) { overflow.push(f.id); continue; }
    assignments.set(f.id, formatDmx(u, c));
    c += size + Math.max(0, Number(gap) || 0);
  }
  return { assignments, overflow };
}

/** Rows describing what a plan will change — used for the preview table. */
export function describeChanges(fixtures, plan, field) {
  const byId = new Map(fixtures.map(f => [f.id, f]));
  const rows = [];
  for (const [id, to] of plan.entries()) {
    const f = byId.get(id); if (!f) continue;
    const from = f[field] ?? '';
    if (String(from) !== String(to)) rows.push({ id, label: `${posKey(f) || '—'} · ${f.type || 'Fixture'}`, from: String(from), to: String(to) });
  }
  return rows;
}
