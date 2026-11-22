/**
 * Auto-placement of hoists (pick-up points) on a bar.
 *
 * Searches for hoist positions that share the load as evenly as possible, avoid
 * uplift, keep the overhangs at the ends modest, and (when a hoist rating is
 * known) stay under ~80% of it — adding hoists in "auto" mode until that holds.
 * It uses the same beam solver as the load report, so what you see afterwards is
 * exactly what was optimised. Still a planning aid: have a rigger verify.
 */
import { analyzeBar, solveReactions, suggestHoists } from './loads';

const END_FRAC = 0.05;           // hoists stay at least 5% of the length in from each end
const MAX_OVERHANG_FRAC = 0.25;  // end overhang beyond this is penalised
const MIN_GAP_FRAC = 0.05;       // adjacent hoists at least 5% of the length apart
const TARGET_UTIL = 0.8;         // aim to stay below 80% of a hoist's rating

const round10 = (v) => Math.round(v / 10) * 10;

function makeObjective(L, points, udlKg, totalKg) {
  const lo = L * END_FRAC, hi = L * (1 - END_FRAC), minGap = L * MIN_GAP_FRAC;
  return (pos, nominal) => {
    let pen = 0;
    for (let i = 0; i < pos.length; i++) { if (pos[i] < lo) pen += (lo - pos[i]) * 5; if (pos[i] > hi) pen += (pos[i] - hi) * 5; }
    for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] < minGap) pen += (minGap - (pos[i] - pos[i - 1])) * 5 + 1000;
    const R = solveReactions(L, pos, points, udlKg);
    if (!R) return { f: 1e9, R: null };
    let maxR = -Infinity, uplift = 0;
    for (const r of R) { if (r > maxR) maxR = r; if (r < 0) uplift += -r; }
    const overL = Math.max(0, pos[0] - 0), overR = Math.max(0, L - pos[pos.length - 1]);
    const excess = Math.max(0, overL - MAX_OVERHANG_FRAC * L) + Math.max(0, overR - MAX_OVERHANG_FRAC * L);
    const dev = nominal ? pos.reduce((s, p, i) => s + Math.abs(p - nominal[i]), 0) / L : 0;
    const f = maxR + uplift * 50 + (excess / L) * totalKg * 10 + pen + dev * totalKg * 1e-3;
    return { f, R };
  };
}

/** Pattern search for the best positions of `n` hoists. */
function optimise(L, n, points, udlKg, totalKg, centroid) {
  const nominal = n === 1 ? [centroid] : suggestHoists(L, n);
  if (n === 1) return { pos: [Math.min(Math.max(centroid, 0), L)], R: [totalKg] };
  const obj = makeObjective(L, points, udlKg, totalKg);
  const clampSort = (p) => p.map(x => Math.min(Math.max(x, L * END_FRAC), L * (1 - END_FRAC))).sort((a, b) => a - b);
  let pos = clampSort(nominal);
  let best = obj(pos, nominal);
  let step = L / 10;
  for (let iter = 0; iter < 400 && step > 2; iter++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (const dir of [-1, 1]) {
        const cand = pos.slice(); cand[i] += dir * step;
        const c = clampSort(cand);
        const r = obj(c, nominal);
        if (r.f < best.f - 1e-9) { pos = c; best = r; improved = true; }
      }
    }
    if (!improved) step /= 2;
  }
  return { pos, R: best.R };
}

/**
 * @param {object} pipe
 * @param {{ count?: number|'auto', maxCount?: number, capacityKg?: number, makeId?: ()=>string }} opts
 * @returns {{ hoists: Array, reactions: number[], count: number, maxReactionKg: number, feasible: boolean, notes: string[] }}
 */
export function autoPlaceHoists(pipe, drawing, fixtureTypes = [], opts = {}) {
  const { count = 'auto', maxCount = 6, makeId = () => 'h' + Math.random().toString(36).slice(2, 8) } = opts;
  const bare = { ...pipe, hoists: [] };
  const a = analyzeBar(bare, drawing, fixtureTypes);
  const L = a.lengthMm;
  const points = a.fixtures.map(f => ({ pos: f.pos, kg: f.weightKg }));
  const udlKg = a.selfKg + a.extraKg;
  const cap = Number(opts.capacityKg ?? pipe.hoistCapacityKg ?? pipe.hoists?.[0]?.capacityKg) || undefined;
  const notes = [];

  const tryCount = (n) => {
    const r = optimise(L, n, points, udlKg, a.totalKg, a.centroidMm);
    const maxR = Math.max(...r.R);
    const uplift = r.R.some(x => x < -0.01);
    return { n, ...r, maxR, uplift, ok: !uplift && (!cap || maxR <= cap * TARGET_UTIL) };
  };

  let chosen;
  if (L < 600) {
    chosen = tryCount(1);
  } else if (count !== 'auto') {
    chosen = tryCount(Math.max(1, Math.min(8, Number(count) || 2)));
  } else {
    // Smallest number of hoists that satisfies the rating; with no rating, a span-based rule of thumb.
    const start = cap ? 2 : Math.max(2, Math.ceil(L / 6000) + 1);
    const lastTry = cap ? maxCount : start;
    for (let n = start; n <= lastTry; n++) { chosen = tryCount(n); if (chosen.ok || !cap) break; }
    if (cap && !chosen.ok) notes.push(`Even ${maxCount} hoists can't keep every hoist under ${Math.round(TARGET_UTIL * 100)}% of ${cap} kg — use a higher-rated hoist or lighten the bar.`);
  }
  if (chosen.uplift) notes.push('Some hoists are still in uplift — try fewer hoists or move heavy fixtures toward the middle.');
  if (cap && chosen.maxR > cap) notes.push(`The busiest hoist carries ${chosen.maxR.toFixed(1)} kg, over its ${cap} kg rating.`);

  const old = Array.isArray(pipe.hoists) ? pipe.hoists : [];
  const hoists = chosen.pos.map((p, i) => ({
    id: old[i]?.id || makeId(), pos: round10(p), capacityKg: old[i]?.capacityKg ?? pipe.hoistCapacityKg ?? undefined,
  }));
  return {
    hoists, reactions: chosen.R, count: chosen.n, maxReactionKg: chosen.maxR,
    feasible: chosen.ok && !chosen.uplift, notes,
  };
}
