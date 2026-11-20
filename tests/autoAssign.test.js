import { describe, it, expect } from 'vitest';
import { orderFixtures, selectScope, planNumbering, planPatch, describeChanges } from '../src/patch/autoAssign';

// Two pipes, fixtures deliberately out of order.
const fx = [
  { id: 'c', position: '2 Electric', x: 300, y: 1000, unit: '' },
  { id: 'a', position: '1 Electric', x: 100, y: 0 },
  { id: 'd', position: '2 Electric', x: 100, y: 1010 },
  { id: 'b', position: '1 Electric', x: 400, y: 20 },
];
const ids = (list) => list.map(f => f.id);

describe('orderFixtures', () => {
  it('reading order groups rows (100mm bands) then goes left to right', () => {
    expect(ids(orderFixtures(fx, 'reading'))).toEqual(['a', 'b', 'd', 'c']);
  });
  it('by position then x', () => {
    expect(ids(orderFixtures(fx, 'position'))).toEqual(['a', 'b', 'd', 'c']);
  });
  it('x and y orders', () => {
    expect(ids(orderFixtures(fx, 'x'))).toEqual(['a', 'd', 'c', 'b']);
    expect(ids(orderFixtures(fx, 'y'))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not mutate the input', () => {
    const before = ids(fx); orderFixtures(fx, 'x'); expect(ids(fx)).toEqual(before);
  });
});

describe('selectScope', () => {
  it('filters to selected or unset', () => {
    expect(ids(selectScope(fx, { scope: 'selected', selectedIds: ['a', 'c'] }))).toEqual(['c', 'a']);
    expect(ids(selectScope([{ id: 1, unit: '5' }, { id: 2, unit: '' }, { id: 3 }], { scope: 'unset', field: 'unit' }))).toEqual([2, 3]);
  });
});

describe('planNumbering', () => {
  it('numbers sequentially with a start and step', () => {
    const m = planNumbering(fx, { start: 10, step: 5, order: 'reading' });
    expect([...m.entries()]).toEqual([['a', '10'], ['b', '15'], ['d', '20'], ['c', '25']]);
  });
  it('can restart on each position', () => {
    const m = planNumbering(fx, { start: 1, order: 'position', restartPerPosition: true });
    expect(m.get('a')).toBe('1'); expect(m.get('b')).toBe('2');
    expect(m.get('d')).toBe('1'); expect(m.get('c')).toBe('2');
  });
});

describe('planPatch', () => {
  const sizeOf = f => (f.id === 'b' ? 4 : 1);
  it('patches in order stepping by footprint, with an optional gap', () => {
    const { assignments } = planPatch(fx, { start: '1/1', order: 'reading', sizeOf, gap: 1 });
    expect(assignments.get('a')).toBe('1/1');   // size 1 +gap 1 → next 3
    expect(assignments.get('b')).toBe('1/3');   // size 4 + gap 1 → next 8
    expect(assignments.get('d')).toBe('1/8');
    expect(assignments.get('c')).toBe('1/10');
  });
  it('starts a new universe for each position when asked', () => {
    const { assignments } = planPatch(fx, { start: '1/1', order: 'position', newUniversePerPosition: true });
    expect(assignments.get('a')).toBe('1/1');
    expect(assignments.get('b')).toBe('1/2');
    expect(assignments.get('d')).toBe('2/1');
    expect(assignments.get('c')).toBe('2/2');
  });
  it('wraps to the next universe at 512', () => {
    const { assignments } = planPatch(fx, { start: '1/511', sizeOf: () => 1 });
    expect([...assignments.values()]).toEqual(['1/511', '1/512', '2/1', '2/2']);
  });
  it('routes around ranges used by fixtures that are not being re-patched', () => {
    const { assignments } = planPatch(fx, { start: '1/1', avoid: [{ u: 1, s: 2, e: 3 }] });
    expect(assignments.get('a')).toBe('1/1');
    expect(assignments.get('b')).toBe('1/4');
  });
  it('rejects a bad start address', () => {
    expect(planPatch(fx, { start: 'zzz' }).error).toBeTruthy();
  });
});

describe('describeChanges', () => {
  it('only lists fixtures whose value changes', () => {
    const plan = new Map([['a', '5'], ['b', '7']]);
    const rows = describeChanges([{ id: 'a', unit: '5' }, { id: 'b', unit: '2', position: 'P', type: 'S4' }], plan, 'unit');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'b', from: '2', to: '7' });
  });
});
