import { describe, it, expect } from 'vitest';
import { autoPlaceHoists } from '../src/rigging/autoplace';
import { analyzeBar } from '../src/rigging/loads';

const pipe = (extra = {}) => ({ id: 'p', name: 'Bar', x1: 0, y1: 0, x2: 10000, y2: 0, ...extra });
const fx = (id, x, kg) => ({ id, x, y: 0, pipeId: 'p', weightKg: kg });
const ids = () => { let i = 0; return () => 'h' + i++; };

describe('autoPlaceHoists', () => {
  it('puts two hoists near the fifth points for an evenly loaded bar and shares the load equally', () => {
    const d = { fixtures: [] };
    const r = autoPlaceHoists(pipe(), d, [], { count: 2, makeId: ids() });
    expect(r.count).toBe(2);
    expect(r.hoists[0].pos).toBeGreaterThan(1500); expect(r.hoists[0].pos).toBeLessThan(2500);
    expect(r.hoists[1].pos).toBeGreaterThan(7500); expect(r.hoists[1].pos).toBeLessThan(8500);
    expect(r.reactions[0]).toBeCloseTo(r.reactions[1], 1);
    expect(r.feasible).toBe(true);
  });

  it('shifts hoists toward a heavy end: lower peak than the evenly spaced default, no uplift, sane overhang', () => {
    const d = { fixtures: [fx('a', 8500, 40), fx('b', 9000, 30), fx('c', 500, 5)] };
    const r = autoPlaceHoists(pipe(), d, [], { count: 2, makeId: ids() });
    const nominal = analyzeBar(pipe({ hoists: [{ pos: 2000 }, { pos: 8000 }] }), d, []);
    const nominalMax = Math.max(...nominal.supports.map(s => s.reactionKg));
    expect(r.maxReactionKg).toBeLessThan(nominalMax);
    expect(r.reactions.every(x => x > 0)).toBe(true);
    expect(r.hoists[1].pos).toBeGreaterThan(8000);        // pulled toward the heavy right end
    expect(r.hoists[0].pos).toBeLessThanOrEqual(2600);    // left overhang stays within ~25%
  });

  it('is exactly what the load report then computes', () => {
    const d = { fixtures: [fx('a', 3000, 20), fx('b', 7000, 35)] };
    const r = autoPlaceHoists(pipe(), d, [], { count: 3, makeId: ids() });
    const check = analyzeBar(pipe({ hoists: r.hoists }), d, []);
    check.supports.forEach((s, i) => expect(s.reactionKg).toBeCloseTo(r.reactions[i], 0));
  });

  it('adds hoists in auto mode until each is under 80% of its rating', () => {
    const d = { fixtures: Array.from({ length: 12 }, (_, i) => fx('f' + i, 500 + i * 800, 30)) };
    const r = autoPlaceHoists(pipe({ x2: 12000 }), d, [], { capacityKg: 150, makeId: ids() });
    expect(r.count).toBeGreaterThanOrEqual(4);
    expect(r.maxReactionKg).toBeLessThanOrEqual(150 * 0.8 + 1e-6);
    expect(r.feasible).toBe(true);
  });

  it('reports when no number of hoists can meet the rating', () => {
    const d = { fixtures: Array.from({ length: 8 }, (_, i) => fx('f' + i, 500 + i * 1000, 50)) };
    const r = autoPlaceHoists(pipe(), d, [], { capacityKg: 40, maxCount: 4, makeId: ids() });
    expect(r.feasible).toBe(false);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('a single hoist goes to the centre of gravity', () => {
    const d = { fixtures: [fx('a', 8000, 100)] };
    const a = analyzeBar(pipe(), d, []);
    const r = autoPlaceHoists(pipe(), d, [], { count: 1, makeId: ids() });
    expect(Math.abs(r.hoists[0].pos - a.centroidMm)).toBeLessThanOrEqual(10);
  });

  it('keeps existing hoist ids and ratings when re-placing', () => {
    const p = pipe({ hoistCapacityKg: 500, hoists: [{ id: 'keep1', pos: 100, capacityKg: 250 }, { id: 'keep2', pos: 9000 }] });
    const r = autoPlaceHoists(p, { fixtures: [] }, [], { count: 2, makeId: ids() });
    expect(r.hoists.map(h => h.id)).toEqual(['keep1', 'keep2']);
    expect(r.hoists.map(h => h.capacityKg)).toEqual([250, 500]);
  });

  it('uses one hoist on a very short bar', () => {
    const r = autoPlaceHoists(pipe({ x2: 500 }), { fixtures: [] }, [], { makeId: ids() });
    expect(r.count).toBe(1);
  });
});
