import { describe, it, expect } from 'vitest';
import { projectPlan, apparentBeam, buildElevation, bodySize, ELEV_DIRS } from '../src/elevation/elevation';

describe('projectPlan', () => {
  it('maps the plan onto the viewer\'s right-hand axis for each facing direction', () => {
    // plan point east (+x) and south (+y) of origin
    expect(projectPlan(100, 0, 'up')).toEqual({ u: 100, depth: 0 });       // facing north: east is on the right
    expect(projectPlan(100, 0, 'down')).toEqual({ u: -100, depth: 0 });    // facing south: east is on the left
    expect(projectPlan(0, 100, 'right')).toEqual({ u: 100, depth: 0 });    // facing east: south is on the right
    expect(projectPlan(0, 100, 'left')).toEqual({ u: -100, depth: 0 });    // facing west: south is on the left
  });
  it('depth grows away from the viewer', () => {
    expect(projectPlan(0, -500, 'up').depth).toBe(500);
    expect(projectPlan(0, 500, 'down').depth).toBe(500);
    expect(projectPlan(500, 0, 'right').depth).toBe(500);
    expect(projectPlan(-500, 0, 'left').depth).toBe(500);
  });
  it('right and facing axes are perpendicular unit vectors', () => {
    Object.values(ELEV_DIRS).forEach(({ f, r }) => {
      expect(f[0] * r[0] + f[1] * r[1]).toBeCloseTo(0, 9);
      expect(Math.hypot(...f)).toBe(1);
      expect(Math.hypot(...r)).toBe(1);
    });
  });
});

describe('apparentBeam', () => {
  it('a fixture pointing straight down looks straight down with its true half-angle', () => {
    const a = apparentBeam({ tiltDeg: 0, rotationDeg: 0, beamDeg: 30 }, 'up');
    expect(a.alphaDeg).toBeCloseTo(0, 6);
    expect(a.halfDeg).toBeCloseTo(15, 6);
  });

  it('tilting across the view shows the full tilt and true half-angle', () => {
    // rotation 90 throws toward -x (west); facing north, right = +x → leans to the LEFT (negative)
    const a = apparentBeam({ tiltDeg: 30, rotationDeg: 90, beamDeg: 20 }, 'up');
    expect(a.alphaDeg).toBeCloseTo(-30, 6);
    expect(a.halfDeg).toBeCloseTo(10, 5);
  });

  it('tilting toward/away from the viewer foreshortens the tilt and widens the cone', () => {
    // rotation 0 throws +y; facing north that is straight at the viewer? -> along the facing axis
    const a = apparentBeam({ tiltDeg: 40, rotationDeg: 0, beamDeg: 20 }, 'up');
    expect(Math.abs(a.alphaDeg)).toBeLessThan(1e-9);
    expect(a.halfDeg).toBeGreaterThan(10);
  });

  it('has no beam when no angle is given', () => {
    expect(apparentBeam({ tiltDeg: 10 }, 'up').halfDeg).toBeNull();
  });
});

describe('bodySize', () => {
  it('varies by fixture category', () => {
    expect(bodySize({ category: 'Moving' }).h).toBeGreaterThan(bodySize({ name: 'Fresnel' }).h);
    expect(bodySize(undefined)).toEqual({ w: 250, h: 330 });
  });
});

describe('buildElevation', () => {
  const types = [{ id: 'prof', name: 'Profile', beamAngle: 20 }];
  const drawing = {
    pipes: [
      { id: 'a', name: '1 Electric', x1: -3000, y1: 1000, x2: 3000, y2: 1000, height: '5' },
      { id: 'b', name: '2 Electric', x1: -3000, y1: 4000, x2: 3000, y2: 4000 },          // default rig height
      { id: 'c', name: 'Boom', x1: 5000, y1: 0, x2: 5000, y2: 3000, height: '3' },       // runs along the facing axis
    ],
    fixtures: [
      { id: 'f1', x: -1000, y: 1000, pipeId: 'a', fixtureTypeId: 'prof', channel: '11', rotation: 0, tiltAngle: 0 },
      { id: 'f2', x: 1000, y: 4000, pipeId: 'b', fixtureTypeId: 'prof', unit: '7' },
    ],
    infrastructure: [{ id: 'i1', x: 0, y: 2500, name: 'Dimmer' }],
  };
  const meta = { rigHeight: 5500, gridHeight: 6500 };

  it('puts pipes at their height (default to the rig height) with the floor at v = 0', () => {
    const m = buildElevation(drawing, types, meta, { dir: 'up' });
    const a = m.pipes.find(p => p.id === 'a'), b = m.pipes.find(p => p.id === 'b');
    expect(a.v).toBe(-5000);
    expect(b.v).toBe(-5500);
    expect(a.endOn).toBe(false);
    expect(m.pipes.find(p => p.id === 'c').endOn).toBe(true);      // seen end-on → a dot
  });

  it('sorts far objects first so near ones paint on top', () => {
    const m = buildElevation(drawing, types, meta, { dir: 'up' });
    // facing north: depth = -y, so the pipe at y = 1000 (depth -1000) is NEARER than y = 4000 (depth -4000)? No — larger depth is farther.
    expect(m.pipes.map(p => p.depth)).toEqual([...m.pipes.map(p => p.depth)].sort((x, y) => y - x));
    expect(m.fixtures.map(f => f.depth)).toEqual([...m.fixtures.map(f => f.depth)].sort((x, y) => y - x));
  });

  it('hangs a fixture under its pipe with a floor-bound beam', () => {
    const m = buildElevation(drawing, types, meta, { dir: 'up' });
    const f = m.fixtures.find(f => f.id === 'f1');
    expect(f.P.v).toBeGreaterThan(-5000);                 // just under the pipe
    expect(f.T.v).toBeGreaterThan(f.P.v);                  // trunnion below the clamp
    expect(f.beam).toBeTruthy();
    f.beam.rays.forEach(r => expect(r.v).toBeCloseTo(0, 3)); // rays reach the floor
    expect(f.beam.rays[0].u).toBeLessThan(f.beam.rays[1].u);
    expect(f.label).toBe('11');
    expect(m.fixtures.find(f => f.id === 'f2').label).toBe('7');
  });

  it('mirrors horizontally when viewed from the other side', () => {
    const up = buildElevation(drawing, types, meta, { dir: 'up' }).fixtures.find(f => f.id === 'f1');
    const down = buildElevation(drawing, types, meta, { dir: 'down' }).fixtures.find(f => f.id === 'f1');
    expect(down.u).toBe(-up.u);
  });

  it('a section band keeps only what lies inside the slice', () => {
    // facing up, depth = -y: pipe a (y=1000) depth -1000, pipe b (y=4000) depth -4000
    const m = buildElevation(drawing, types, meta, { dir: 'up', band: { min: -1500, max: -500 } });
    expect(m.pipes.map(p => p.id).sort()).toEqual(['a', 'c']);   // the boom runs through the slice too
    expect(m.fixtures.map(f => f.id)).toEqual(['f1']);
    expect(m.infra).toHaveLength(0);
    // a pipe running through the slice is kept even if its end points are outside it
    const through = buildElevation(drawing, types, meta, { dir: 'up', band: { min: -2000, max: -1500 } });
    expect(through.pipes.map(p => p.id)).toEqual(['c']);
  });

  it('honours layer visibility and reports bounds including the floor', () => {
    const hidden = buildElevation(drawing, types, meta, { dir: 'up', visible: (o) => o.id !== 'f1' });
    expect(hidden.fixtures.map(f => f.id)).toEqual(['f2']);
    const m = buildElevation(drawing, types, meta, { dir: 'up' });
    expect(m.bounds.maxV).toBe(0);
    expect(m.bounds.minV).toBeLessThanOrEqual(-5500);
    expect(m.bounds.minU).toBeLessThanOrEqual(-3000);
    expect(m.bounds.maxU).toBeGreaterThanOrEqual(5000);
    expect(buildElevation({}, [], {}).bounds).toBeNull();
  });
});
