import { describe, it, expect } from 'vitest';
import { throwHeight, fixtureEllipse, computeCoverage, coverageStats, coverageColor, COVERAGE_COLORS } from '../src/coverage/coverage';

const type = { id: 't', beamAngle: 30 };
const mk = (id, x, y, extra = {}) => ({ id, x, y, fixtureTypeId: 't', ...extra });
const valueAt = (g, x, y) => {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((y - g.y0) / g.cell);
  return i < 0 || j < 0 || i >= g.cols || j >= g.rows ? 0 : g.counts[j * g.cols + i];
};

describe('throwHeight', () => {
  it('uses the pipe height in metres, else the rig height', () => {
    const pipes = new Map([['p', { id: 'p', height: '4.5' }]]);
    expect(throwHeight({ pipeId: 'p' }, pipes, 5500)).toBe(4500);
    expect(throwHeight({ pipeId: 'none' }, pipes, 5500)).toBe(5500);
    expect(throwHeight({}, pipes, 6000)).toBe(6000);
  });
});

describe('fixtureEllipse', () => {
  it('is a circle under a vertical fixture, with the true beam radius', () => {
    const e = fixtureEllipse(mk('a', 1000, 2000), type, 5000);
    expect(e.cx).toBeCloseTo(1000, 6); expect(e.cy).toBeCloseTo(2000, 6);
    expect(e.rMajor).toBeCloseTo(e.rMinor, 6);
    expect(e.rMinor).toBeCloseTo(5000 * Math.tan(15 * Math.PI / 180), 6);
  });
  it('moves down-plan when tilted at rotation 0, and honours a per-fixture beam angle', () => {
    const e = fixtureEllipse(mk('a', 0, 0, { tiltAngle: 30 }), type, 5000);
    expect(e.cy).toBeGreaterThan(2500);
    const narrow = fixtureEllipse(mk('b', 0, 0, { beamAngle: 10 }), type, 5000);
    expect(narrow.rMinor).toBeLessThan(fixtureEllipse(mk('c', 0, 0), type, 5000).rMinor);
  });
  it('has no footprint without a beam angle', () => {
    expect(fixtureEllipse({ x: 0, y: 0 }, undefined, 5000)).toBeNull();
  });
});

describe('computeCoverage', () => {
  const pipes = [{ id: 'p', height: '5' }];
  it('returns null when nothing has a beam', () => {
    expect(computeCoverage({ fixtures: [{ id: 'x', x: 0, y: 0 }], pipes }, [], {})).toBeNull();
  });

  it('counts overlapping beams', () => {
    const d = { pipes, fixtures: [mk('a', 0, 0, { pipeId: 'p' }), mk('b', 1000, 0, { pipeId: 'p' })] };
    const g = computeCoverage(d, [type], {}, { cell: 100 });
    expect(g.fixtures).toBe(2);
    expect(g.max).toBe(2);
    expect(valueAt(g, 500, 0)).toBe(2);        // between the two fixtures, inside both pools (r ≈ 1340 mm)
    expect(valueAt(g, -1200, 0)).toBe(1);      // only the left one reaches here
    expect(valueAt(g, 5000, 0)).toBe(0);       // nobody
  });

  it('a fixture on a lower pipe lights a smaller pool', () => {
    const low = computeCoverage({ pipes: [{ id: 'p', height: '2' }], fixtures: [mk('a', 0, 0, { pipeId: 'p' })] }, [type], {}, { cell: 50 });
    const high = computeCoverage({ pipes: [{ id: 'p', height: '6' }], fixtures: [mk('a', 0, 0, { pipeId: 'p' })] }, [type], {}, { cell: 50 });
    const area = g => g.counts.filter(v => v > 0).length * (g.cell / 1000) ** 2;
    expect(area(low)).toBeLessThan(area(high) / 4);
  });

  it('the pool area matches pi r^2 within a few percent', () => {
    const g = computeCoverage({ pipes, fixtures: [mk('a', 0, 0, { pipeId: 'p' })] }, [type], {}, { cell: 50 });
    const r = 5 * Math.tan(15 * Math.PI / 180);
    const area = coverageStats(g).m2.one;
    expect(Math.abs(area - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.04);
  });

  it('coarsens the grid for a huge area instead of exploding', () => {
    const d = { pipes, fixtures: [mk('a', 0, 0, { pipeId: 'p' }), mk('b', 5_000_000, 5_000_000, { pipeId: 'p' })] };
    const g = computeCoverage(d, [type], {}, { cell: 50, maxCells: 200_000 });
    expect(g.cols * g.rows).toBeLessThan(400_000);
    expect(g.cell).toBeGreaterThan(50);
  });
});

describe('coverageStats', () => {
  const d = { pipes: [{ id: 'p', height: '5' }], fixtures: [mk('a', 0, 0, { pipeId: 'p' }), mk('b', 1000, 0, { pipeId: 'p' })] };
  const g = computeCoverage(d, [type], {}, { cell: 100 });

  it('measures area by overlap count', () => {
    const s = coverageStats(g);
    expect(s.m2.one).toBeGreaterThan(s.m2.two);
    expect(s.m2.two).toBeGreaterThan(0);
    expect(s.m2.three).toBe(0);
    expect(s.max).toBe(2);
  });

  it('measures inside a rectangle only', () => {
    const inside = coverageStats(g, { x: -200, y: -200, w: 1400, h: 400 });
    expect(inside.pct.one).toBeCloseTo(1, 2);           // fully lit
    expect(inside.totalM2).toBeCloseTo(1.4 * 0.4, 1);
    const far = coverageStats(g, { x: 8000, y: 8000, w: 2000, h: 2000 });
    expect(far.pct.one).toBe(0);
    expect(coverageStats(null)).toBeNull();
  });
});

describe('coverageColor', () => {
  it('has no colour for zero and saturates at the top of the ramp', () => {
    expect(coverageColor(0)).toBeNull();
    expect(coverageColor(1)).toBe(COVERAGE_COLORS[0]);
    expect(coverageColor(99)).toBe(COVERAGE_COLORS[COVERAGE_COLORS.length - 1]);
  });
});
