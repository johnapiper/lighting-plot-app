import { describe, it, expect } from 'vitest';
import { snapToGrid, distance, distanceToSegment, projectPointOntoLine } from '../src/canvas/geometry';
import { gatherSnapTargets, computeOsnap, constrainAngle } from '../src/canvas/snapping';
import { translateObject, mirrorObject, rotateObject, cloneWithId } from '../src/canvas/transforms';
import { formatLength, formatCoord, toDisplayValue } from '../src/canvas/units';

describe('geometry', () => {
  it('snaps to grid', () => {
    expect(snapToGrid(1450, 1372)).toBe(1372);
    expect(snapToGrid(2100, 1372)).toBe(2744);
  });
  it('measures distances', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(projectPointOntoLine(5, 3, 0, 0, 10, 0)).toMatchObject({ x: 5, y: 0, t: 0.5 });
  });
});

describe('snapping', () => {
  const drawing = {
    pipes: [{ x1: 0, y1: 0, x2: 1000, y2: 0 }],
    lines: [{ x1: 500, y1: -500, x2: 500, y2: 500 }],
    fixtures: [{ x: 200, y: 0 }],
  };
  const targets = gatherSnapTargets(drawing);

  it('gathers endpoints, midpoints and fixture centres', () => {
    expect(targets.segments).toHaveLength(2);
    expect(targets.points.some(p => p.type === 'midpoint' && p.x === 500 && p.y === 0)).toBe(true);
    expect(targets.points.some(p => p.type === 'center' && p.x === 200)).toBe(true);
  });
  it('snaps to the nearest high-priority point inside the radius', () => {
    expect(computeOsnap(5, 5, targets, 30)).toMatchObject({ x: 0, y: 0, type: 'endpoint' });
  });
  it('finds the intersection of two crossing segments', () => {
    const only = { points: [], segments: targets.segments };
    expect(computeOsnap(505, 5, only, 30)).toMatchObject({ x: 500, y: 0, type: 'intersection' });
  });
  it('returns null when nothing is in range', () => {
    expect(computeOsnap(9000, 9000, targets, 30)).toBeNull();
  });
  it('constrains to 45 degree increments', () => {
    const p = constrainAngle(0, 0, 100, 10, 45);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.x).toBeGreaterThan(99);
  });
});

describe('transforms', () => {
  it('translates a pipe without mutating the original', () => {
    const o = { id: 'p', x1: 0, y1: 0, x2: 10, y2: 0 };
    const n = translateObject(o, 'pipe', 5, 7);
    expect(n).toMatchObject({ x1: 5, y1: 7, x2: 15, y2: 7 });
    expect(o.x1).toBe(0);
  });
  it('mirrors a fixture across a vertical axis and flips its rotation', () => {
    const n = mirrorObject({ x: 100, y: 50, rotation: 30 }, 'fixture', 'v', 0);
    expect(n).toMatchObject({ x: -100, y: 50, rotation: 150 });
  });
  it('rotates a fixture 90 degrees about a pivot', () => {
    const n = rotateObject({ x: 10, y: 0, rotation: 0 }, 'fixture', 0, 0, Math.PI / 2);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(10, 6);
    expect(n.rotation).toBeCloseTo(90, 6);
  });
  it('clones with a fresh id and drops the group', () => {
    const c = cloneWithId({ id: 'a', groupId: 'g', x: 1 });
    expect(c.id).not.toBe('a');
    expect(c.groupId).toBeUndefined();
    expect(c.x).toBe(1);
  });
});

describe('units', () => {
  it('treats world units as millimetres and formats for display', () => {
    expect(formatLength(1372, 'mm')).toBe('1372mm');
    expect(formatLength(1372, 'ft')).toBe('4.50ft');
    expect(formatLength(-2000, 'm')).toBe('-2.00m');
    expect(formatLength(5000, 'm', { noUnit: true })).toBe('5.00');
    expect(formatCoord(1000, 2000, 'm')).toBe('1.00m, 2.00m');
    expect(toDisplayValue(2540, 'in')).toBe(100);
  });
});
