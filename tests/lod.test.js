import { describe, it, expect } from 'vitest';
import { buildSymIds, cullFixtures, lodFor } from '../src/canvas/FixtureNode';

// FixtureNode imports React components; only the pure helpers are exercised here.
describe('cullFixtures', () => {
  const fx = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 5000, y: 5000 }, { id: 'c', x: -100, y: 200 }];
  const view = { x0: -500, y0: -500, x1: 500, y1: 500 };

  it('keeps fixtures inside the view, in order', () => {
    expect(cullFixtures(fx, view).map(f => f.id)).toEqual(['a', 'c']);
  });
  it('always keeps selected fixtures', () => {
    expect(cullFixtures(fx, view, new Set(['b'])).map(f => f.id)).toEqual(['a', 'b', 'c']);
  });
  it('does nothing without a view (size not measured yet)', () => {
    expect(cullFixtures(fx, null)).toBe(fx);
  });
});

describe('lodFor', () => {
  it('steps down the detail as more fixtures are on screen', () => {
    expect(lodFor(10)).toBe(0);
    expect(lodFor(900)).toBe(0);
    expect(lodFor(901)).toBe(1);
    expect(lodFor(2500)).toBe(1);
    expect(lodFor(2501)).toBe(2);
  });
});

describe('buildSymIds', () => {
  it('gives each type with a symbol a safe unique id', () => {
    const m = buildSymIds([{ id: 'Weird Name/1', symbol: '<g/>' }, { id: 'x' }, { id: 'y', symbol: '<g/>' }]);
    expect([...m.keys()]).toEqual(['Weird Name/1', 'y']);
    expect([...m.values()].every(v => /^fxsym-\d+$/.test(v))).toBe(true);
    expect(new Set(m.values()).size).toBe(2);
  });
});
