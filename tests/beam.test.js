import { describe, it, expect } from 'vitest';
import { beamFootprint, footprintPolygon } from '../src/canvas/beam';

describe('beamFootprint', () => {
  it('straight down gives a circle centred under the fixture', () => {
    const fp = beamFootprint({ beamDeg: 30, tiltDeg: 0, rotationDeg: 0, height: 5000 });
    expect(fp.cx).toBeCloseTo(0, 6);
    expect(fp.cy).toBeCloseTo(0, 6);
    expect(fp.rMajor).toBeCloseTo(fp.rMinor, 6);
    expect(fp.rMinor).toBeCloseTo(5000 * Math.tan((15 * Math.PI) / 180), 6);
  });

  it('tilting throws the pool away from the fixture along its facing direction', () => {
    // Rotation 0 faces down the plan (+Y).
    const fp = beamFootprint({ beamDeg: 20, tiltDeg: 30, rotationDeg: 0, height: 5000 });
    expect(fp.cx).toBeCloseTo(0, 6);
    expect(fp.cy).toBeGreaterThan(0);
    expect(fp.rMajor).toBeGreaterThan(fp.rMinor * 0.99);   // stretched along the throw
    // Rotating 90° moves the throw sideways.
    const side = beamFootprint({ beamDeg: 20, tiltDeg: 30, rotationDeg: 90, height: 5000 });
    expect(Math.abs(side.cx)).toBeGreaterThan(1000);
    expect(side.cy).toBeCloseTo(0, 6);
  });

  it('far side spreads more than near side (tan is convex)', () => {
    const fp = beamFootprint({ beamDeg: 30, tiltDeg: 40, rotationDeg: 0, height: 5000 });
    expect(fp.farDist - fp.centreDist).toBeCloseTo(fp.centreDist - fp.nearDist, 6);
    expect(fp.centreDist).toBeGreaterThan(5000 * Math.tan((40 * Math.PI) / 180));
  });

  it('returns null without a beam angle or height', () => {
    expect(beamFootprint({ beamDeg: 0, height: 5000 })).toBeNull();
    expect(beamFootprint({ beamDeg: 20, height: 0 })).toBeNull();
    expect(beamFootprint({ height: 5000 })).toBeNull();
  });

  it('stays finite for a grazing beam', () => {
    const fp = beamFootprint({ beamDeg: 40, tiltDeg: 80, height: 5000 });
    expect(Number.isFinite(fp.farDist)).toBe(true);
  });
});

describe('footprintPolygon', () => {
  it('traces the ellipse around its centre', () => {
    const fp = beamFootprint({ beamDeg: 30, tiltDeg: 20, rotationDeg: 0, height: 4000 });
    const poly = footprintPolygon(fp, 16);
    expect(poly).toHaveLength(16);
    const mx = poly.reduce((s, p) => s + p.x, 0) / 16, my = poly.reduce((s, p) => s + p.y, 0) / 16;
    expect(mx).toBeCloseTo(fp.cx, 4);
    expect(my).toBeCloseTo(fp.cy, 4);
    expect(footprintPolygon(null)).toEqual([]);
  });
});
