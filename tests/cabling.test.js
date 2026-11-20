import { describe, it, expect } from 'vitest';
import { calcCableRoute, findNearestStructure, nearestOnSeg, formatLength, waypointsToPath } from '../src/cabling/routing';
import { calcCircuitLoad, wattsToAmps, ampsToWatts, CABLE_TYPES, POWER_CABLE_TYPES } from '../src/cabling/ratings';

const pipe = { id: 'p1', x1: 0, y1: 0, x2: 1000, y2: 0 };

describe('nearestOnSeg', () => {
  it('clamps to the segment ends', () => {
    expect(nearestOnSeg(-50, 10, 0, 0, 100, 0)).toMatchObject({ x: 0, y: 0, t: 0 });
    expect(nearestOnSeg(150, 10, 0, 0, 100, 0)).toMatchObject({ x: 100, y: 0, t: 1 });
    expect(nearestOnSeg(40, 10, 0, 0, 100, 0)).toMatchObject({ x: 40, y: 0 });
  });
  it('handles a zero-length segment', () => {
    expect(nearestOnSeg(5, 5, 3, 3, 3, 3)).toEqual({ x: 3, y: 3, t: 0 });
  });
});

describe('calcCableRoute', () => {
  it('floor to floor is just the straight distance', () => {
    const r = calcCableRoute({ x: 0, y: 0, onStructureId: null }, { x: 3000, y: 4000, onStructureId: null }, []);
    expect(r.lengthMm).toBe(5000);
    expect(r.riseMm).toBe(0);
  });
  it('same structure runs along it with no rise or drop', () => {
    const r = calcCableRoute({ x: 100, y: 0, onStructureId: 'p1' }, { x: 600, y: 0, onStructureId: 'p1' }, [pipe]);
    expect(r.lengthMm).toBe(500);
    expect(r.dropPoints).toEqual([]);
  });
  it('rig to floor adds the rise and the drop from grid height', () => {
    const r = calcCableRoute({ x: 200, y: 0, onStructureId: 'p1' }, { x: 200, y: 1000, onStructureId: null }, [pipe], 5500, 6000);
    expect(r.riseMm).toBe(500);
    expect(r.dropMm).toBe(6000);
    expect(r.lengthMm).toBe(1000 + 500 + 6000);
  });
  it('prefers a per-pipe height (metres) over the global rig height', () => {
    const tall = { ...pipe, height: 4 };
    const r = calcCableRoute({ x: 0, y: 0, onStructureId: 'p1' }, { x: 0, y: 0, onStructureId: null }, [tall], 5500, 6000);
    expect(r.riseMm).toBe(2000);
  });
  it('includes user waypoints in the run', () => {
    const direct = calcCableRoute({ x: 0, y: 0 }, { x: 1000, y: 0 }, []);
    const bent = calcCableRoute({ x: 0, y: 0 }, { x: 1000, y: 0 }, [], 5500, 6000, [{ x: 500, y: 500 }]);
    expect(bent.lengthMm).toBeGreaterThan(direct.lengthMm);
  });
});

describe('findNearestStructure', () => {
  it('returns the closest structure within the snap radius', () => {
    expect(findNearestStructure(500, 10, [pipe], 25)).toBe(pipe);
    expect(findNearestStructure(500, 100, [pipe], 25)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats lengths', () => {
    expect(formatLength(0)).toBe('—');
    expect(formatLength(450)).toBe('450mm');
    expect(formatLength(2500)).toBe('2.5m');
    expect(formatLength(12400)).toBe('12m');
  });
  it('builds an svg path', () => {
    expect(waypointsToPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe('M0,0 L5,5');
    expect(waypointsToPath([{ x: 0, y: 0 }])).toBe('');
  });
});

describe('power ratings', () => {
  it('converts watts and amps at 230V', () => {
    expect(wattsToAmps(2300)).toBe(10);
    expect(ampsToWatts(10)).toBe(2300);
  });
  it('sums wattage from instances, falling back to the fixture type', () => {
    const types = [{ id: 't', powerW: 750 }];
    const load = calcCircuitLoad([{ wattage: 575 }, { fixtureTypeId: 't' }], 'powercon', types);
    expect(load.totalWatts).toBe(1325);
    expect(load.overloaded).toBe(false);
  });
  it('flags overloads against the cable rating', () => {
    const load = calcCircuitLoad(Array(10).fill({ wattage: 750 }), '13A');
    expect(load.maxAmps).toBe(13);
    expect(load.overloaded).toBe(true);
    expect(load.utilizationPct).toBeGreaterThan(100);
  });
  it('exposes the power cable types', () => {
    expect(POWER_CABLE_TYPES).toContain('powercon');
    POWER_CABLE_TYPES.forEach(k => expect(CABLE_TYPES[k].category).toBe('power'));
  });
});
