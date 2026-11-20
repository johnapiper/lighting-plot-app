import { describe, it, expect } from 'vitest';
import { parseDXF, dxfToDrawingObjects, readPairs, countObjects } from '../src/dxf/dxfReader';
import { exportDXF, safeLayerName } from '../src/dxf/dxfWriter';

const pairsToText = (pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
const doc = ({ units, blocks = [], ents = [] }) => pairsToText([
  [0, 'SECTION'], [2, 'HEADER'], ...(units !== undefined ? [[9, '$INSUNITS'], [70, units]] : []), [0, 'ENDSEC'],
  [0, 'SECTION'], [2, 'BLOCKS'], ...blocks.flat(), [0, 'ENDSEC'],
  [0, 'SECTION'], [2, 'ENTITIES'], ...ents.flat(), [0, 'ENDSEC'], [0, 'EOF'],
]);

describe('readPairs', () => {
  it('reads code/value pairs and tolerates CRLF', () => {
    expect(readPairs('0\r\nSECTION\r\n2\r\nHEADER\r\n')).toEqual([[0, 'SECTION'], [2, 'HEADER']]);
  });
});

describe('parseDXF entities', () => {
  it('reads lines, flips Y and scales by units (feet)', () => {
    const p = parseDXF(doc({ units: 2, ents: [[[0, 'LINE'], [8, 'A'], [10, 1], [20, 2], [11, 3], [21, 4]]] }));
    expect(p.scale).toBeCloseTo(304.8);
    expect(p.unitsKnown).toBe(true);
    const o = dxfToDrawingObjects(p, { newId: () => 'x' });
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].x1).toBeCloseTo(304.8);
    expect(o.lines[0].y1).toBeCloseTo(-609.6);      // Y flipped
  });

  it('treats unitless drawings as millimetres but reports it', () => {
    const p = parseDXF(doc({ ents: [[[0, 'CIRCLE'], [10, 0], [20, 0], [40, 5]]] }));
    expect(p.unitsKnown).toBe(false);
    expect(p.scale).toBe(1);
  });

  it('reads LWPOLYLINE with the closed flag', () => {
    const p = parseDXF(doc({ ents: [[[0, 'LWPOLYLINE'], [70, 1], [10, 0], [20, 0], [10, 10], [20, 0], [10, 10], [20, 10]]] }));
    expect(p.prims[0]).toMatchObject({ type: 'poly', closed: true });
    expect(p.prims[0].pts).toHaveLength(3);
  });

  it('reads old-style POLYLINE/VERTEX/SEQEND', () => {
    const p = parseDXF(doc({ ents: [[[0, 'POLYLINE'], [70, 0]], [[0, 'VERTEX'], [10, 0], [20, 0]], [[0, 'VERTEX'], [10, 5], [20, 5]], [[0, 'SEQEND']]] }));
    expect(p.prims).toHaveLength(1);
    expect(p.prims[0].pts).toHaveLength(2);
  });

  it('converts a CCW arc to the canvas convention (positive sweep after Y flip)', () => {
    const p = parseDXF(doc({ ents: [[[0, 'ARC'], [10, 0], [20, 0], [40, 10], [50, 0], [51, 90]]] }));
    const [a] = dxfToDrawingObjects(p, { newId: () => 'x' }).arcs;
    // 0° → 90° CCW (Y-up) is the quarter from +X up to +Y; on screen (Y-down) that is -90° → 0.
    expect(a.a0).toBeCloseTo(-Math.PI / 2);
    expect(a.a1).toBeCloseTo(0);
  });

  it('strips MTEXT formatting', () => {
    const p = parseDXF(doc({ ents: [[[0, 'MTEXT'], [10, 0], [20, 0], [40, 3], [1, '{\\fArial|b0;Stage\\PLeft}']]] }));
    expect(p.prims[0].str).toBe('Stage\nLeft');
  });

  it('counts unsupported entities instead of failing', () => {
    const p = parseDXF(doc({ ents: [[[0, 'HATCH'], [8, 'X']], [[0, 'LINE'], [10, 0], [20, 0], [11, 1], [21, 1]]] }));
    expect(p.skipped).toEqual({ HATCH: 1 });
    expect(p.prims).toHaveLength(1);
  });
});

describe('parseDXF blocks', () => {
  const block = [[0, 'BLOCK'], [2, 'B'], [10, 0], [20, 0], [0, 'LINE'], [10, 0], [20, 0], [11, 10], [21, 0], [0, 'ENDBLK']];
  it('expands INSERT with translation, rotation and scale', () => {
    const p = parseDXF(doc({ blocks: [block], ents: [[[0, 'INSERT'], [2, 'B'], [10, 100], [20, 50], [41, 2], [42, 2], [50, 90]]] }));
    expect(p.prims).toHaveLength(1);
    const l = p.prims[0];
    expect(l.x1).toBeCloseTo(100); expect(l.y1).toBeCloseTo(50);
    expect(l.x2).toBeCloseTo(100); expect(l.y2).toBeCloseTo(70);   // length 10 × scale 2, rotated 90°
  });
  it('ignores references to missing blocks', () => {
    const p = parseDXF(doc({ ents: [[[0, 'INSERT'], [2, 'NOPE'], [10, 0], [20, 0]]] }));
    expect(p.prims).toHaveLength(0);
    expect(p.skipped.INSERT).toBe(1);
  });
});

describe('exportDXF → parseDXF round trip', () => {
  const drawing = {
    pipes: [{ id: 'p', x1: 0, y1: 0, x2: 3000, y2: 0 }],
    lines: [{ id: 'l', x1: 0, y1: 100, x2: 0, y2: 900 }],
    rectangles: [{ id: 'r', x: 0, y: 0, w: 1000, h: 500 }],
    circles: [{ id: 'c', cx: 500, cy: 500, r: 250 }],
    arcs: [{ id: 'a', cx: 0, cy: 0, r: 1000, a0: -Math.PI / 2, a1: 0 }],
    polylines: [{ id: 'pl', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: false }],
    texts: [{ id: 't', x: 50, y: 60, label: 'USL', fontSize: 80 }],
    fixtures: [{ id: 'f', x: 1000, y: 2000, channel: '12' }],
  };
  const text = exportDXF(drawing, [{ id: 'layer-lighting', name: 'Lighting', color: '#e0c060' }]);

  it('writes a well-formed R12 file', () => {
    expect(text).toMatch(/AC1009/);
    expect(text.trim().endsWith('EOF')).toBe(true);
    expect(text).toMatch(/\nLighting\r?\n/);
  });

  it('reads back to the same geometry (mm, Y restored)', () => {
    const o = dxfToDrawingObjects(parseDXF(text), { newId: () => 'x' });
    // pipe + line + dimension-less → 2 lines
    expect(o.lines).toHaveLength(2);
    expect(o.lines.find(l => l.x2 === 3000)).toMatchObject({ x1: 0, y1: 0, y2: 0 });
    expect(o.lines.find(l => l.x1 === 0 && l.y2 === 900 || l.y1 === 900)).toBeTruthy();
    // rect + polyline = polylines
    expect(o.polylines).toHaveLength(2);
    expect(o.polylines.find(p => p.closed).points).toHaveLength(4);
    // circle + fixture circle
    expect(o.circles).toHaveLength(2);
    expect(o.circles.find(c => c.r === 250)).toMatchObject({ cx: 500, cy: 500 });
    // arc survives the Y flip both ways
    expect(o.arcs[0].a0).toBeCloseTo(-Math.PI / 2);
    expect(o.arcs[0].a1).toBeCloseTo(0);
    // text + fixture label
    expect(o.texts.map(t => t.label).sort()).toEqual(['12', 'USL']);
    expect(countObjects(o)).toBe(2 + 2 + 2 + 1 + 2);
  });

  it('sanitises layer names', () => {
    expect(safeLayerName('Rig/Truss: A?')).toBe('Rig_Truss_ A_');
    expect(safeLayerName('')).toBe('0');
  });
});
