import { describe, it, expect } from 'vitest';
import {
  solveReactions, suggestHoists, fixtureWeight, analyzeBar, analyzeRig, rigReportCsv,
  DEFAULT_FIXTURE_KG, PIPE_KG_PER_M, TRUSS_KG_PER_M,
} from '../src/rigging/loads';

const sum = (a) => a.reduce((s, x) => s + x, 0);

describe('solveReactions (beam statics)', () => {
  it('splits a centred point load equally between two hoists', () => {
    const r = solveReactions(10000, [2000, 8000], [{ pos: 5000, kg: 100 }]);
    expect(r[0]).toBeCloseTo(50, 6); expect(r[1]).toBeCloseTo(50, 6);
  });

  it('uses the lever rule for an off-centre load', () => {
    // supports 0 and 4000; load at 1000 → R1 = 3P/4, R2 = P/4
    const r = solveReactions(4000, [0, 4000], [{ pos: 1000, kg: 80 }]);
    expect(r[0]).toBeCloseTo(60, 6); expect(r[1]).toBeCloseTo(20, 6);
  });

  it('shares a uniform load equally between two symmetric hoists', () => {
    const r = solveReactions(8000, [1000, 7000], [], 120);
    expect(r[0]).toBeCloseTo(60, 6); expect(r[1]).toBeCloseTo(60, 6);
  });

  it('puts an overhanging load into uplift on the far hoist', () => {
    // bar 10 m, hoists at 2 m and 8 m, 90 kg on the right end:  R2 = P*8/6, R1 = -P*2/6
    const r = solveReactions(10000, [2000, 8000], [{ pos: 10000, kg: 90 }]);
    expect(r[1]).toBeCloseTo(120, 5);
    expect(r[0]).toBeCloseTo(-30, 5);
  });

  it('gives the continuous-beam answer for three hoists (middle carries 5/8)', () => {
    const r = solveReactions(8000, [0, 4000, 8000], [], 160);
    expect(r[0]).toBeCloseTo(160 * 3 / 16, 4);
    expect(r[1]).toBeCloseTo(160 * 5 / 8, 4);
    expect(r[2]).toBeCloseTo(160 * 3 / 16, 4);
  });

  it('always balances: reactions add up to the total load', () => {
    const pts = [{ pos: 700, kg: 12 }, { pos: 2100, kg: 7.5 }, { pos: 5900, kg: 20 }, { pos: 6500, kg: 6 }];
    const r = solveReactions(7000, [500, 3000, 6600], pts, 15);
    expect(sum(r)).toBeCloseTo(12 + 7.5 + 20 + 6 + 15, 4);
  });

  it('returns null for fewer than two distinct supports', () => {
    expect(solveReactions(5000, [1000], [{ pos: 0, kg: 1 }])).toBeNull();
    expect(solveReactions(5000, [1000, 1000.2], [{ pos: 0, kg: 1 }])).toBeNull();
  });
});

describe('suggestHoists', () => {
  it('places hoists sensibly', () => {
    expect(suggestHoists(10000, 1)).toEqual([5000]);
    expect(suggestHoists(10000, 2)).toEqual([2000, 8000]);
    expect(suggestHoists(10000, 3)).toEqual([1000, 5000, 9000]);
  });
});

describe('fixtureWeight', () => {
  it('prefers the instance, then the type, then an assumed default', () => {
    expect(fixtureWeight({ weightKg: '7.5' }, { weightKg: 5 })).toEqual({ kg: 7.5, assumed: false });
    expect(fixtureWeight({}, { weightKg: 5 })).toEqual({ kg: 5, assumed: false });
    expect(fixtureWeight({}, undefined)).toEqual({ kg: DEFAULT_FIXTURE_KG, assumed: true });
  });
});

describe('analyzeBar', () => {
  const pipe = (extra = {}) => ({ id: 'p', name: '1 Electric', x1: 0, y1: 0, x2: 10000, y2: 0, ...extra });
  const types = [{ id: 'prof', name: 'Profile', weightKg: 10 }];
  const fx = (id, x, extra = {}) => ({ id, x, y: 0, pipeId: 'p', fixtureTypeId: 'prof', unit: id, ...extra });

  it('sums self weight, extra load and fixtures', () => {
    const d = { fixtures: [fx('1', 1000), fx('2', 9000)] };
    const a = analyzeBar(pipe({ extraKg: 5 }), d, types);
    expect(a.selfKg).toBeCloseTo(10 * PIPE_KG_PER_M, 6);
    expect(a.fixtureKg).toBe(20);
    expect(a.totalKg).toBeCloseTo(10 * PIPE_KG_PER_M + 5 + 20, 6);
  });

  it('uses truss weight per metre and an explicit override', () => {
    expect(analyzeBar(pipe({ type: 'truss' }), { fixtures: [] }, types).selfKg).toBeCloseTo(10 * TRUSS_KG_PER_M, 6);
    expect(analyzeBar(pipe({ weightKgPerM: 3 }), { fixtures: [] }, types).selfKg).toBeCloseTo(30, 6);
  });

  it('only counts fixtures hung on this bar and positions them along it', () => {
    const d = { fixtures: [fx('1', 2500), { ...fx('2', 100), pipeId: 'other' }] };
    const a = analyzeBar(pipe(), d, types);
    expect(a.fixtures).toHaveLength(1);
    expect(a.fixtures[0].pos).toBeCloseTo(2500, 6);
  });

  it('resolves hoist loads that add up to the total', () => {
    const d = { fixtures: [fx('1', 1000), fx('2', 5000), fx('3', 9500)] };
    const a = analyzeBar(pipe({ hoists: [{ pos: 2000, capacityKg: 250 }, { pos: 8000, capacityKg: 250 }] }), d, types);
    expect(a.supports.reduce((s, h) => s + h.reactionKg, 0)).toBeCloseTo(a.totalKg, 4);
    expect(a.status).toBe('ok');
  });

  it('flags hoist overload, uplift, bar overload and missing hoists', () => {
    const heavy = { fixtures: Array.from({ length: 10 }, (_, i) => fx(String(i), 9500, { weightKg: 25 })) };
    const a = analyzeBar(pipe({ capacityKg: 100, hoists: [{ pos: 2000, capacityKg: 150 }, { pos: 8000, capacityKg: 150 }] }), heavy, types);
    const codes = a.warnings.map(w => w.code);
    expect(codes).toContain('uplift');
    expect(codes).toContain('hoist-overload');
    expect(codes).toContain('bar-overload');
    expect(a.status).toBe('error');

    const none = analyzeBar(pipe(), { fixtures: [fx('1', 500)] }, types);
    expect(none.warnings.map(w => w.code)).toContain('no-hoists');
    expect(none.status).toBe('ok');
  });

  it('warns about a single hoist and about assumed weights', () => {
    const a = analyzeBar(pipe({ hoists: [{ pos: 5000 }] }), { fixtures: [{ id: 'x', x: 1000, y: 0, pipeId: 'p' }] }, types);
    const codes = a.warnings.map(w => w.code);
    expect(codes).toContain('single-hoist');
    expect(codes).toContain('assumed-weights');
  });

  it('warns near the 80% mark', () => {
    const a = analyzeBar(pipe({ capacityKg: 40, weightKgPerM: 0 }), { fixtures: [fx('1', 5000, { weightKg: 33 })] }, types);
    expect(a.warnings.map(w => w.code)).toContain('bar-near');
    expect(a.status).toBe('warn');
  });
});

describe('analyzeRig + CSV', () => {
  const drawing = {
    pipes: [
      { id: 'a', name: '2 Electric', x1: 0, y1: 0, x2: 6000, y2: 0, hoists: [{ pos: 1000, capacityKg: 500 }, { pos: 5000, capacityKg: 500 }] },
      { id: 'b', name: '1 Electric', x1: 0, y1: 1000, x2: 6000, y2: 1000 },
      { id: 'c', name: 'unused', x1: 0, y1: 2000, x2: 1000, y2: 2000 },
    ],
    fixtures: [{ id: 'f1', x: 100, y: 0, pipeId: 'a', weightKg: 8 }, { id: 'f2', x: 100, y: 1000, pipeId: 'b', weightKg: 6 }],
  };
  const a = analyzeRig(drawing, []);

  it('lists bars that carry something, sorted naturally, with totals', () => {
    expect(a.bars.map(b => b.name)).toEqual(['1 Electric', '2 Electric']);
    expect(a.totals.fixtures).toBe(2);
    expect(a.totals.hoists).toBe(2);
    expect(a.totals.fixtureKg).toBe(14);
  });

  it('exports a CSV with a row per hoist', () => {
    const lines = rigReportCsv(a).trim().split('\r\n');
    expect(lines[0].startsWith('Bar,Type')).toBe(true);
    expect(lines).toHaveLength(1 + 1 + 2);    // header + bar without hoists + 2 hoists
  });
});
