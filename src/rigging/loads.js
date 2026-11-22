/**
 * Rigging load analysis — a PLANNING aid, not an engineering certification.
 *
 * For each bar (pipe / truss) we gather its loads:
 *   • self weight        (kg/m × length, uniform)
 *   • extra load         (accessories / cabling lump, spread uniformly)
 *   • every fixture hung on it (point loads at their position along the bar)
 * and resolve them into hoist (pick-up point) reactions with a small Euler–Bernoulli
 * beam model (constant stiffness, rigid vertical supports). That is exact for two
 * hoists and gives the usual continuous-beam answer for three or more — where the
 * middle hoists carry MORE than a simple tributary split would suggest.
 *
 * Limits: truss shear deflection, hoist stretch/unequal chain length, dynamic
 * loads, and safety factors are NOT modelled. Always have a qualified rigger
 * verify real loads against the manufacturer's rated capacities.
 *
 * Units: positions along the bar in mm, weights in kg.
 */

import { nearestOnSeg } from '../cabling/routing';

export const PIPE_KG_PER_M = 1.7;     // 48 mm barrel, typical
export const TRUSS_KG_PER_M = 5.0;    // box / triangular truss, typical
export const DEFAULT_FIXTURE_KG = 5;  // used (and flagged) when no weight is known

const len = (p) => Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

// ── Beam solver ─────────────────────────────────────────────────────────────

/** Gaussian elimination with partial pivoting. Solves A x = b (A square). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;     // singular
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Reactions at `supports` for a bar of `length` mm carrying point loads and a
 * uniform load.
 * @param {number} length
 * @param {number[]} supports       positions (mm), ≥ 2 distinct
 * @param {{pos:number, kg:number}[]} points
 * @param {number} udlKg            total uniformly distributed load (kg) over the whole bar
 * @returns {number[]|null} upward support loads in the same order as `supports` (kg), or null if unsolvable
 */
export function solveReactions(length, supports, points, udlKg = 0) {
  const L = length / 1000;                                  // metres keep the matrix well-scaled
  const clampPos = (p) => Math.min(Math.max(p / 1000, 0), L);

  // Nodes: bar ends, supports and load points; merge anything closer than 0.5 mm.
  const raw = [0, L, ...supports.map(clampPos), ...points.map(p => clampPos(p.pos))].sort((a, b) => a - b);
  const nodes = [];
  for (const x of raw) if (!nodes.length || x - nodes[nodes.length - 1] > 0.0005) nodes.push(x);
  const nearest = (x) => { let bi = 0; for (let i = 1; i < nodes.length; i++) if (Math.abs(nodes[i] - x) < Math.abs(nodes[bi] - x)) bi = i; return bi; };

  const n = nodes.length, N = 2 * n;                        // dofs: [v0, θ0, v1, θ1, …], v positive DOWN
  const K = Array.from({ length: N }, () => new Array(N).fill(0));
  const F = new Array(N).fill(0);

  for (let e = 0; e < n - 1; e++) {
    const l = nodes[e + 1] - nodes[e];
    const k = 1 / (l * l * l);                              // EI = 1
    const ke = [
      [12, 6 * l, -12, 6 * l],
      [6 * l, 4 * l * l, -6 * l, 2 * l * l],
      [-12, -6 * l, 12, -6 * l],
      [6 * l, 2 * l * l, -6 * l, 4 * l * l],
    ];
    const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i]][d[j]] += k * ke[i][j];
    // Consistent nodal loads for this element's share of the uniform load.
    const w = L > 0 ? udlKg * (l / L) : 0;
    F[d[0]] += w / 2; F[d[1]] += (w * l) / 12;
    F[d[2]] += w / 2; F[d[3]] -= (w * l) / 12;
  }
  for (const p of points) F[2 * nearest(clampPos(p.pos))] += p.kg;

  const supIdx = [...new Set(supports.map(s => nearest(clampPos(s))))];
  if (supIdx.length < 2) return null;
  const fixed = new Set(supIdx.map(i => 2 * i));
  const free = [];
  for (let i = 0; i < N; i++) if (!fixed.has(i)) free.push(i);

  const Kff = free.map(r => free.map(c => K[r][c]));
  const u = solve(Kff, free.map(r => F[r]));
  if (!u) return null;
  const full = new Array(N).fill(0);
  free.forEach((d, i) => { full[d] = u[i]; });

  // Support force (upward, kg) = applied load − internal force at the constrained dof.
  const reactionAt = (i) => {
    const row = 2 * i;
    let kf = 0;
    for (let c = 0; c < N; c++) kf += K[row][c] * full[c];
    return F[row] - kf;
  };
  // Supports that merged into one node share it equally.
  const counts = new Map();
  supports.forEach(s => { const i = nearest(clampPos(s)); counts.set(i, (counts.get(i) || 0) + 1); });
  return supports.map(s => { const i = nearest(clampPos(s)); return reactionAt(i) / counts.get(i); });
}

// ── Bar analysis ─────────────────────────────────────────────────────────────

/** Suggested hoist positions (mm from the left end) for `count` hoists on a bar of `length` mm. */
export function suggestHoists(length, count) {
  if (count <= 1) return [Math.round(length / 2)];
  if (count === 2) return [Math.round(length * 0.2), Math.round(length * 0.8)];
  const a = length * 0.1, b = length * 0.9;
  return Array.from({ length: count }, (_, i) => Math.round(a + ((b - a) * i) / (count - 1)));
}

/** Weight of a fixture and whether it had to be assumed. */
export function fixtureWeight(f, type) {
  const own = num(f.weightKg);
  if (own !== undefined) return { kg: own, assumed: false };
  const t = num(type?.weightKg);
  if (t !== undefined) return { kg: t, assumed: false };
  return { kg: DEFAULT_FIXTURE_KG, assumed: true };
}

/**
 * Analyse one bar.
 * @param {object} pipe  { id, name, x1,y1,x2,y2, type, height, weightKgPerM, extraKg, capacityKg, hoists:[{id,pos,capacityKg,label}] }
 */
export function analyzeBar(pipe, drawing, fixtureTypes = []) {
  const L = len(pipe);
  const types = new Map((fixtureTypes || []).map(t => [t.id, t]));
  const perM = num(pipe.weightKgPerM) ?? (pipe.type === 'truss' ? TRUSS_KG_PER_M : PIPE_KG_PER_M);
  const selfKg = (L / 1000) * perM;
  const extraKg = num(pipe.extraKg) ?? 0;
  const capacityKg = num(pipe.capacityKg);

  const fixtures = (drawing.fixtures || [])
    .filter(f => f.pipeId === pipe.id || f.onStructureId === pipe.id)
    .map(f => {
      const t = types.get(f.fixtureTypeId);
      const w = fixtureWeight(f, t);
      const pos = nearestOnSeg(f.x, f.y, pipe.x1, pipe.y1, pipe.x2, pipe.y2).t * L;
      return { id: f.id, label: f.unit || f.channel || f.type || t?.name || 'Fixture', type: f.type || t?.name || '', pos, weightKg: w.kg, assumed: w.assumed };
    })
    .sort((a, b) => a.pos - b.pos);
  const fixtureKg = fixtures.reduce((s, f) => s + f.weightKg, 0);
  const totalKg = selfKg + extraKg + fixtureKg;
  const udlKg = selfKg + extraKg;
  const centroid = totalKg > 0 ? (fixtures.reduce((s, f) => s + f.pos * f.weightKg, 0) + udlKg * (L / 2)) / totalKg : L / 2;

  const rawHoists = (Array.isArray(pipe.hoists) ? pipe.hoists : [])
    .map((h, i) => ({ id: h.id ?? `h${i}`, pos: num(h.pos) ?? 0, capacityKg: num(h.capacityKg), label: h.label || `Hoist ${i + 1}` }))
    .sort((a, b) => a.pos - b.pos);

  const warnings = [];
  const w = (level, code, message) => warnings.push({ level, code, message });

  let reactions = null;
  if (rawHoists.length >= 2) {
    reactions = solveReactions(L, rawHoists.map(h => h.pos), fixtures.map(f => ({ pos: f.pos, kg: f.weightKg })), udlKg);
    if (!reactions) w('error', 'unsolvable', 'Hoists are too close together to resolve loads — move them apart.');
  } else if (rawHoists.length === 1) {
    reactions = [totalKg];
    const offset = Math.abs(centroid - rawHoists[0].pos);
    w('warn', 'single-hoist', `Only one hoist: the bar is only stable if it is balanced — the centre of gravity is ${Math.round(offset)} mm from the hoist.`);
  } else if (fixtures.length || totalKg > 0) {
    w('info', 'no-hoists', 'No hoists defined — add pick-up points to see per-hoist loads.');
  }

  const supports = rawHoists.map((h, i) => {
    const kg = reactions ? reactions[i] : null;
    const util = kg != null && h.capacityKg ? kg / h.capacityKg : null;
    if (kg != null && kg < -0.01) w('error', 'uplift', `${h.label} is in uplift (${kg.toFixed(1)} kg) — it would be pulled DOWN. Move hoists or rebalance the load.`);
    if (util != null && util > 1) w('error', 'hoist-overload', `${h.label} carries ${kg.toFixed(1)} kg, over its ${h.capacityKg} kg rating.`);
    else if (util != null && util > 0.8) w('warn', 'hoist-near', `${h.label} is at ${Math.round(util * 100)}% of its rating.`);
    if (h.pos < -0.5 || h.pos > L + 0.5) w('warn', 'hoist-off-bar', `${h.label} is positioned outside the bar (${Math.round(h.pos)} mm of ${Math.round(L)} mm).`);
    return { ...h, reactionKg: kg, utilisation: util, uplift: kg != null && kg < -0.01 };
  });

  const utilisation = capacityKg ? totalKg / capacityKg : null;
  if (utilisation != null && utilisation > 1) w('error', 'bar-overload', `Bar load ${totalKg.toFixed(1)} kg exceeds its ${capacityKg} kg capacity.`);
  else if (utilisation != null && utilisation > 0.8) w('warn', 'bar-near', `Bar is at ${Math.round(utilisation * 100)}% of its ${capacityKg} kg capacity.`);
  const assumedCount = fixtures.filter(f => f.assumed).length;
  if (assumedCount) w('info', 'assumed-weights', `${assumedCount} fixture${assumedCount === 1 ? '' : 's'} use an assumed ${DEFAULT_FIXTURE_KG} kg — enter real weights for accurate loads.`);

  return {
    pipeId: pipe.id, name: pipe.name || 'Bar', type: pipe.type === 'truss' ? 'truss' : 'pipe',
    lengthMm: L, heightM: num(pipe.height),
    selfKg, extraKg, fixtureKg, totalKg, capacityKg: capacityKg ?? null, utilisation,
    centroidMm: centroid, fixtures, supports, warnings,
    status: warnings.some(x => x.level === 'error') ? 'error' : warnings.some(x => x.level === 'warn') ? 'warn' : 'ok',
  };
}

/** Analyse every bar that carries fixtures or has hoists / loads defined. */
export function analyzeRig(drawing, fixtureTypes = []) {
  const bars = (drawing.pipes || [])
    .map(p => analyzeBar(p, drawing, fixtureTypes))
    .filter(b => b.fixtures.length || b.supports.length || b.capacityKg || b.extraKg)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const totals = bars.reduce((t, b) => ({
    totalKg: t.totalKg + b.totalKg, fixtureKg: t.fixtureKg + b.fixtureKg, selfKg: t.selfKg + b.selfKg + b.extraKg,
    hoists: t.hoists + b.supports.length, fixtures: t.fixtures + b.fixtures.length,
  }), { totalKg: 0, fixtureKg: 0, selfKg: 0, hoists: 0, fixtures: 0 });
  const worst = bars.some(b => b.status === 'error') ? 'error' : bars.some(b => b.status === 'warn') ? 'warn' : 'ok';
  return { bars, totals, status: worst };
}

/** CSV of the rig report: one row per hoist (or per bar when it has none). */
export function rigReportCsv(analysis) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const r1 = (v) => (v == null ? '' : (Math.round(v * 10) / 10).toString());
  const rows = [['Bar', 'Type', 'Length (m)', 'Fixtures', 'Self (kg)', 'Fixtures (kg)', 'Extra (kg)', 'Total (kg)', 'Capacity (kg)', 'Bar %', 'Hoist', 'Position (mm)', 'Hoist load (kg)', 'Hoist rating (kg)', 'Hoist %', 'Status']];
  for (const b of analysis.bars) {
    const base = [q(b.name), b.type, r1(b.lengthMm / 1000), b.fixtures.length, r1(b.selfKg), r1(b.fixtureKg), r1(b.extraKg), r1(b.totalKg), r1(b.capacityKg), b.utilisation != null ? Math.round(b.utilisation * 100) : ''];
    if (!b.supports.length) rows.push([...base, '', '', '', '', '', q(b.status)]);
    b.supports.forEach(s => rows.push([...base, q(s.label), Math.round(s.pos), r1(s.reactionKg), r1(s.capacityKg), s.utilisation != null ? Math.round(s.utilisation * 100) : '', q(b.status)]));
  }
  return rows.map(r => r.join(',')).join('\r\n') + '\r\n';
}
