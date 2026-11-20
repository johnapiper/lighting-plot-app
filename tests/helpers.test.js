import { describe, it, expect } from 'vitest';
import { arcPath, getLayerId, fixtureLabel, LABEL_MODES, LAYER_DEFAULTS } from '../src/canvas/canvasHelpers';
import { getAllObjectsFromDrawing, setGroupIdInDrawing } from '../src/canvas/groups';

describe('fixtureLabel', () => {
  const f = { channel: '12', unit: '3', dmxAddress: '1/12', position: 'FOH', colour: 'R26', purpose: 'Front', dmxMode: '16ch' };
  it('auto prefers channel, else unit', () => {
    expect(fixtureLabel(f, 'auto')).toBe('Ch.12');
    expect(fixtureLabel({ unit: '3' }, 'auto')).toBe('3');
    expect(fixtureLabel({}, 'auto')).toBeNull();
  });
  it('shows the chosen field', () => {
    expect(fixtureLabel(f, 'address')).toBe('1/12');
    expect(fixtureLabel(f, 'unit')).toBe('3');
    expect(fixtureLabel(f, 'position')).toBe('FOH');
    expect(fixtureLabel(f, 'colour')).toBe('R26');
    expect(fixtureLabel(f, 'purpose')).toBe('Front');
    expect(fixtureLabel(f, 'mode')).toBe('16ch');
    expect(fixtureLabel(f, 'none')).toBeNull();
  });
  it('treats blank strings as empty', () => {
    expect(fixtureLabel({ channel: '  ' }, 'channel')).toBeNull();
  });
  it('lists every mode with a label', () => {
    expect(LABEL_MODES.map(m => m[0])).toContain('auto');
    LABEL_MODES.forEach(([, label]) => expect(label).toBeTruthy());
  });
});

describe('getLayerId', () => {
  it('uses the object layer, then the kind default, then architecture', () => {
    expect(getLayerId({ layerId: 'x' }, 'pipe')).toBe('x');
    expect(getLayerId({}, 'fixture')).toBe(LAYER_DEFAULTS.fixture);
    expect(getLayerId({}, 'mystery')).toBe('layer-arch');
  });
});

describe('arcPath', () => {
  it('builds a positive-sweep SVG arc and flags large arcs', () => {
    expect(arcPath(0, 0, 10, 0, Math.PI / 2)).toMatch(/^M 10 0 A 10 10 0 0 1 /);
    expect(arcPath(0, 0, 10, 0, Math.PI * 1.5)).toMatch(/A 10 10 0 1 1 /);
  });
  it('wraps a negative sweep', () => {
    expect(arcPath(0, 0, 10, Math.PI / 2, 0)).toMatch(/A 10 10 0 1 1 /);
  });
});

describe('groups', () => {
  it('collects objects across kinds and sets / clears group ids', () => {
    const d = { fixtures: [{ id: 'a' }], pipes: [{ id: 'b' }], lines: [{ id: 'c' }], rectangles: [], texts: [{ id: 'd' }] };
    expect(getAllObjectsFromDrawing(d).map(o => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    setGroupIdInDrawing(d, ['a', 'c'], 'g1');
    expect(d.fixtures[0].groupId).toBe('g1');
    expect(d.pipes[0].groupId).toBeUndefined();
    setGroupIdInDrawing(d, ['a'], null);
    expect(d.fixtures[0].groupId).toBeUndefined();
  });
});
