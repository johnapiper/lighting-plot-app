import { describe, it, expect } from 'vitest';
import {
  EXAMPLE_PRESETS, getPresets, barPresets, hoistPresets, barPresetFields, hoistPresetFields, newPreset, sanitizePresets,
} from '../src/rigging/presets';

describe('presets', () => {
  it('ships labelled examples of both kinds', () => {
    expect(barPresets(EXAMPLE_PRESETS).length).toBeGreaterThan(0);
    expect(hoistPresets(EXAMPLE_PRESETS).length).toBeGreaterThan(0);
    EXAMPLE_PRESETS.forEach(p => expect(p.name.toLowerCase()).toContain('example'));
  });

  it('uses the project list when it has one, else the examples', () => {
    expect(getPresets({})).toBe(EXAMPLE_PRESETS);
    const mine = [{ id: 'a', kind: 'bar', name: 'Mine', weightKgPerM: 2, capacityKg: 99 }];
    expect(getPresets({ rigPresets: mine })).toBe(mine);
    expect(getPresets({ rigPresets: [] })).toEqual([]);
  });

  it('a bar preset sets weight and capacity; clearing keeps the numbers', () => {
    const p = EXAMPLE_PRESETS.find(p => p.kind === 'bar');
    expect(barPresetFields(p)).toEqual({ presetId: p.id, weightKgPerM: p.weightKgPerM, capacityKg: p.capacityKg });
    expect(barPresetFields(null)).toEqual({ presetId: undefined });
  });

  it('a hoist preset rates every existing hoist and becomes the default for new ones', () => {
    const pipe = { hoists: [{ id: 'a', pos: 1 }, { id: 'b', pos: 2, capacityKg: 10 }] };
    const f = hoistPresetFields(pipe, { id: 'h', kind: 'hoist', capacityKg: 500 });
    expect(f.hoistCapacityKg).toBe(500);
    expect(f.hoists.map(h => h.capacityKg)).toEqual([500, 500]);
    expect(f.hoists.map(h => h.pos)).toEqual([1, 2]);
    expect(hoistPresetFields({}, null).hoists).toEqual([]);
  });

  it('sanitizes editor rows', () => {
    const out = sanitizePresets([
      { id: 'x', kind: 'bar', name: '  Tube ', weightKgPerM: '2.5', capacityKg: '120' },
      { id: 'x', kind: 'hoist', name: 'Hoist', capacityKg: 500 },       // duplicate id
      { id: 'y', kind: 'bar', name: '', capacityKg: 10 },               // no name → dropped
      { id: 'z', kind: 'bar', name: 'Bad', capacityKg: 'abc' },         // bad number → dropped
      { id: 'w', kind: 'bar', name: 'NoWeight', capacityKg: 40 },
    ]);
    expect(out.map(p => p.name)).toEqual(['Tube', 'Hoist', 'NoWeight']);
    expect(new Set(out.map(p => p.id)).size).toBe(3);
    expect(out[0]).toMatchObject({ weightKgPerM: 2.5, capacityKg: 120 });
    expect(out[1].weightKgPerM).toBeUndefined();
    expect(out[2].weightKgPerM).toBe(0);
  });

  it('makes blank rows with unique ids', () => {
    const a = newPreset('bar'), b = newPreset('hoist');
    expect(a.id).not.toBe(b.id);
    expect(b.weightKgPerM).toBeUndefined();
  });
});
