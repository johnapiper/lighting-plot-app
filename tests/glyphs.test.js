import { describe, it, expect } from 'vitest';
import { glyphKey, glyphShapes, GLYPH_KEYS, GLYPH_SPEC } from '../src/elevation/glyphs';
import { buildElevation } from '../src/elevation/elevation';

describe('glyphKey', () => {
  it('maps the built-in symbol ids', () => {
    expect(glyphKey({ symbolId: 'FresnelBD' })).toBe('fresnel');
    expect(glyphKey({ symbolId: 'Profile' })).toBe('profile');
    expect(glyphKey({ symbolId: 'Par64' })).toBe('par');
    expect(glyphKey({ symbolId: 'Flood' })).toBe('flood');
    expect(glyphKey({ symbolId: 'Wash' })).toBe('wash');
    expect(glyphKey({ symbolId: 'MovingHead' })).toBe('moving');
  });
  it('falls back to category and name, then generic', () => {
    expect(glyphKey({ category: 'Moving', name: 'Spot 700' })).toBe('moving');
    expect(glyphKey({ name: 'Source Four 19' })).toBe('profile');
    expect(glyphKey({ name: 'LED PAR' })).toBe('par');
    expect(glyphKey({ name: 'Cyc strip' })).toBe('flood');
    expect(glyphKey({ name: 'Mystery' })).toBe('generic');
    expect(glyphKey(undefined)).toBe('generic');
  });
});

describe('glyphShapes', () => {
  it('every glyph yields finite, non-empty path data', () => {
    for (const key of GLYPH_KEYS) {
      const { w, h, yoke } = GLYPH_SPEC[key];
      const shapes = glyphShapes(key, w, h, yoke);
      expect(shapes.length).toBeGreaterThan(1);
      for (const sh of shapes) {
        expect(sh.d).toMatch(/^M/);
        expect(sh.d).not.toMatch(/NaN|Infinity|undefined/);
        expect(['none', 'body', 'lens', 'ink']).toContain(sh.fill);
        expect(['main', 'fine']).toContain(sh.weight);
      }
    }
  });
  it('has a lens shape to take the gel colour', () => {
    for (const key of GLYPH_KEYS) expect(glyphShapes(key, 250, 330, 130).some(s => s.fill === 'lens')).toBe(true);
  });
  it('the moving head hangs from a base block near the pipe and the fork reaches the head', () => {
    const { w, h, yoke } = GLYPH_SPEC.moving;
    expect(yoke).toBeGreaterThan(GLYPH_SPEC.profile.yoke);
    const shapes = glyphShapes('moving', w, h, yoke);
    const ys = [...shapes.map(s => s.d).join(' ').matchAll(/[ML] ?(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map(m => Number(m[2]));
    expect(Math.min(...ys)).toBeLessThan(-yoke + 100);      // reaches up toward the clamp
  });
});

describe('elevation uses glyphs', () => {
  it('fixtures carry their glyph and yoke; moving heads hang lower', () => {
    const types = [{ id: 'm', symbolId: 'MovingHead' }, { id: 'p', symbolId: 'Profile' }];
    const d = {
      pipes: [{ id: 'a', x1: 0, y1: 0, x2: 4000, y2: 0, height: '5' }],
      fixtures: [{ id: 'f1', x: 500, y: 0, pipeId: 'a', fixtureTypeId: 'm' }, { id: 'f2', x: 2000, y: 0, pipeId: 'a', fixtureTypeId: 'p' }],
    };
    const m = buildElevation(d, types, {}, {});
    const mh = m.fixtures.find(f => f.id === 'f1'), pf = m.fixtures.find(f => f.id === 'f2');
    expect(mh.glyph).toBe('moving'); expect(pf.glyph).toBe('profile');
    expect(mh.T.v - mh.P.v).toBe(GLYPH_SPEC.moving.yoke);
    expect(pf.T.v - pf.P.v).toBe(GLYPH_SPEC.profile.yoke);
  });
});
