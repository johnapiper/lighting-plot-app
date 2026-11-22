/**
 * Floor coverage — how many beams overlap each patch of the stage floor.
 *
 * Every fixture's beam lands on the floor as an ellipse (see canvas/beam.js: it
 * depends on beam angle, tilt, rotation and the height it hangs at). We rasterise
 * those ellipses on a grid and count overlaps, which shows dark spots (no light),
 * thin spots (one beam) and well-covered areas (two or more) at a glance.
 *
 * Throw height is the height of the pipe the fixture hangs on, so a fixture on a
 * low boom throws a smaller pool than one on a high electric.
 */
import { beamFootprint } from '../canvas/beam';

const MAX_RADIUS_MM = 40000;   // a grazing beam can be enormous; don't let it blow up the grid

/** mm above the floor at which a fixture throws from. */
export function throwHeight(f, pipesById, rigMm = 5500) {
  const p = f.pipeId ? pipesById.get(f.pipeId) : null;
  const m = parseFloat(p?.height);
  return Number.isFinite(m) && m > 0 ? m * 1000 : rigMm;
}

/** The floor ellipse of one fixture in plan coordinates, or null (no beam angle). */
export function fixtureEllipse(f, type, height) {
  const beamDeg = Number.isFinite(parseFloat(f.beamAngle)) ? parseFloat(f.beamAngle) : type?.beamAngle;
  const fp = beamFootprint({ beamDeg, tiltDeg: parseFloat(f.tiltAngle) || 0, rotationDeg: parseFloat(f.rotation) || 0, height });
  if (!fp) return null;
  const rMajor = Math.min(fp.rMajor, MAX_RADIUS_MM), rMinor = Math.min(fp.rMinor, MAX_RADIUS_MM);
  const cx = f.x + fp.cx, cy = f.y + fp.cy;
  const px = -fp.dirY, py = fp.dirX;
  return {
    cx, cy, rMajor, rMinor, dirX: fp.dirX, dirY: fp.dirY, px, py,
    // axis-aligned bounding box of the ellipse
    hx: Math.hypot(rMajor * fp.dirX, rMinor * px),
    hy: Math.hypot(rMajor * fp.dirY, rMinor * py),
  };
}

/**
 * @param {{ cell?: number, maxCells?: number }} opts  cell size in mm (grows automatically if the area is huge)
 * @returns {null | { x0, y0, cell, cols, rows, counts: Uint8Array, max: number, fixtures: number }}
 */
export function computeCoverage(drawing, fixtureTypes = [], meta = {}, { cell = 250, maxCells = 1_000_000 } = {}) {
  const types = new Map((fixtureTypes || []).map(t => [t.id, t]));
  const pipesById = new Map((drawing.pipes || []).map(p => [p.id, p]));
  const rigMm = parseFloat(meta.rigHeight) || 5500;

  const ells = [];
  for (const f of drawing.fixtures || []) {
    const e = fixtureEllipse(f, types.get(f.fixtureTypeId), throwHeight(f, pipesById, rigMm));
    if (e) ells.push(e);
  }
  if (!ells.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of ells) {
    minX = Math.min(minX, e.cx - e.hx); maxX = Math.max(maxX, e.cx + e.hx);
    minY = Math.min(minY, e.cy - e.hy); maxY = Math.max(maxY, e.cy + e.hy);
  }
  let c = cell;
  while (((maxX - minX) / c + 2) * ((maxY - minY) / c + 2) > maxCells) c *= 1.5;
  const x0 = Math.floor(minX / c) * c - c, y0 = Math.floor(minY / c) * c - c;
  const cols = Math.ceil((maxX - x0) / c) + 1, rows = Math.ceil((maxY - y0) / c) + 1;
  const counts = new Uint8Array(cols * rows);

  for (const e of ells) {
    const i0 = Math.max(0, Math.floor((e.cx - e.hx - x0) / c)), i1 = Math.min(cols - 1, Math.ceil((e.cx + e.hx - x0) / c));
    const j0 = Math.max(0, Math.floor((e.cy - e.hy - y0) / c)), j1 = Math.min(rows - 1, Math.ceil((e.cy + e.hy - y0) / c));
    for (let j = j0; j <= j1; j++) {
      const wy = y0 + (j + 0.5) * c - e.cy;
      for (let i = i0; i <= i1; i++) {
        const wx = x0 + (i + 0.5) * c - e.cx;
        const a = (wx * e.dirX + wy * e.dirY) / e.rMajor, b = (wx * e.px + wy * e.py) / e.rMinor;
        if (a * a + b * b <= 1) { const k = j * cols + i; if (counts[k] < 255) counts[k]++; }
      }
    }
  }
  let max = 0;
  for (let k = 0; k < counts.length; k++) if (counts[k] > max) max = counts[k];
  return { x0, y0, cell: c, cols, rows, counts, max, fixtures: ells.length };
}

/**
 * Area (m²) covered by at least 1 / 2 / 3 beams. With `rect` {x,y,w,h} (mm) only that
 * area is measured, and its total area is reported so percentages can be shown.
 */
export function coverageStats(grid, rect = null) {
  if (!grid) return null;
  const { x0, y0, cell, cols, rows, counts } = grid;
  const cellM2 = (cell / 1000) ** 2;
  const at = (x, y) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
    return i < 0 || j < 0 || i >= cols || j >= rows ? 0 : counts[j * cols + i];
  };
  let n1 = 0, n2 = 0, n3 = 0, total = 0;
  if (rect) {
    // Sample the rectangle on the grid's own spacing (cell centres).
    const nx = Math.max(1, Math.round(rect.w / cell)), ny = Math.max(1, Math.round(rect.h / cell));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = at(rect.x + (i + 0.5) * (rect.w / nx), rect.y + (j + 0.5) * (rect.h / ny));
      total++; if (v >= 1) n1++; if (v >= 2) n2++; if (v >= 3) n3++;
    }
    const each = (rect.w / nx / 1000) * (rect.h / ny / 1000);
    return { totalM2: total * each, m2: { one: n1 * each, two: n2 * each, three: n3 * each }, pct: total ? { one: n1 / total, two: n2 / total, three: n3 / total } : { one: 0, two: 0, three: 0 }, max: grid.max, scoped: true };
  }
  for (let k = 0; k < counts.length; k++) { const v = counts[k]; if (v >= 1) n1++; if (v >= 2) n2++; if (v >= 3) n3++; }
  return { totalM2: null, m2: { one: n1 * cellM2, two: n2 * cellM2, three: n3 * cellM2 }, pct: null, max: grid.max, scoped: false };
}

// Ramp for 1, 2, 3, 4, 5+ overlapping beams.
export const COVERAGE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
export const coverageColor = (count) => (count <= 0 ? null : COVERAGE_COLORS[Math.min(count, COVERAGE_COLORS.length) - 1]);

/** Browser only: draw the grid to a PNG data URL (one pixel per cell, nearest-neighbour when scaled). */
export function renderCoveragePng(grid, alpha = 0.45) {
  const c = document.createElement('canvas');
  c.width = grid.cols; c.height = grid.rows;
  const g = c.getContext('2d');
  const img = g.createImageData(grid.cols, grid.rows);
  const rgb = COVERAGE_COLORS.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let k = 0; k < grid.counts.length; k++) {
    const v = grid.counts[k]; if (!v) continue;
    const [r, gg, b] = rgb[Math.min(v, rgb.length) - 1];
    img.data[k * 4] = r; img.data[k * 4 + 1] = gg; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = Math.round(255 * alpha);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
