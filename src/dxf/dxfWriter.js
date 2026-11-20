/**
 * ASCII DXF (R12 / AC1009 — opens everywhere) export of a plot drawing.
 *
 * Units are millimetres (1 world unit = 1 mm), Y is flipped (canvas is Y-down,
 * DXF is Y-up). Fixtures are written as a circle plus a channel/unit label;
 * for the full fixture data (types, patch, positions) use MVR export.
 */

const KIND_LAYER = {
  fixture: 'layer-lighting', pipe: 'layer-lighting', line: 'layer-arch', rect: 'layer-arch', text: 'layer-arch',
  circle: 'layer-arch', arc: 'layer-arch', polyline: 'layer-arch', dimension: 'layer-dimensions',
};

// AutoCAD colour index for a handful of common hues (nearest match).
const ACI = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]],
  [6, [255, 0, 255]], [7, [255, 255, 255]], [8, [128, 128, 128]], [9, [192, 192, 192]],
];
function hexToAci(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 7;
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = 7, bd = Infinity;
  for (const [idx, rgb] of ACI) {
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = idx; }
  }
  return best;
}

export function safeLayerName(name) {
  const s = String(name || '0').replace(/[<>/\\":;?*|=`,]/g, '_').trim();
  return s || '0';
}

const f = (n) => (Math.round(n * 1000) / 1000).toString();
const deg = (r) => ((r * 180) / Math.PI);
const norm360 = (d) => ((d % 360) + 360) % 360;

class Out {
  constructor() { this.l = []; }
  g(code, value) { this.l.push(String(code), String(value)); return this; }
  toString() { return this.l.join('\r\n') + '\r\n'; }
}

/**
 * @param {object} drawing  a project drawing ({pipes, fixtures, lines, rectangles, circles, arcs, polylines, texts, dimensions})
 * @param {Array}  layers   project layers [{id,name,color}]
 * @returns {string} DXF text
 */
export function exportDXF(drawing, layers = []) {
  const layerName = (obj, kind) => {
    const id = obj.layerId || KIND_LAYER[kind] || 'layer-arch';
    const l = layers.find(l => l.id === id);
    return safeLayerName(l?.name || id);
  };
  const used = new Map();   // name → aci
  const noteLayer = (name, id) => { if (!used.has(name)) used.set(name, hexToAci(layers.find(l => l.id === id)?.color)); return name; };

  const ents = new Out();
  const lay = (obj, kind) => noteLayer(layerName(obj, kind), obj.layerId || KIND_LAYER[kind]);
  const Y = (y) => -y;

  const line = (layer, x1, y1, x2, y2) => ents.g(0, 'LINE').g(8, layer).g(10, f(x1)).g(20, f(Y(y1))).g(30, 0).g(11, f(x2)).g(21, f(Y(y2))).g(31, 0);
  const poly = (layer, pts, closed) => {
    ents.g(0, 'POLYLINE').g(8, layer).g(66, 1).g(70, closed ? 1 : 0);
    pts.forEach(p => ents.g(0, 'VERTEX').g(8, layer).g(10, f(p.x)).g(20, f(Y(p.y))).g(30, 0));
    ents.g(0, 'SEQEND').g(8, layer);
  };
  const text = (layer, x, y, h, str, rot = 0) => {
    ents.g(0, 'TEXT').g(8, layer).g(10, f(x)).g(20, f(Y(y))).g(30, 0).g(40, f(h)).g(1, String(str).replace(/[\r\n]+/g, ' '));
    if (rot) ents.g(50, f(norm360(-rot)));
  };

  (drawing.pipes || []).forEach(p => line(lay(p, 'pipe'), p.x1, p.y1, p.x2, p.y2));
  (drawing.lines || []).forEach(l => {
    if (l.rotation) {
      const cx = (l.x1 + l.x2) / 2, cy = (l.y1 + l.y2) / 2, c = Math.cos((l.rotation * Math.PI) / 180), s = Math.sin((l.rotation * Math.PI) / 180);
      const R = (x, y) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c });
      const a = R(l.x1, l.y1), b = R(l.x2, l.y2);
      line(lay(l, 'line'), a.x, a.y, b.x, b.y);
    } else line(lay(l, 'line'), l.x1, l.y1, l.x2, l.y2);
  });
  (drawing.dimensions || []).forEach(d => line(lay(d, 'dimension'), d.x1, d.y1, d.x2, d.y2));
  (drawing.rectangles || []).forEach(r => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, a = ((r.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const R = (x, y) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c });
    poly(lay(r, 'rect'), [R(r.x, r.y), R(r.x + r.w, r.y), R(r.x + r.w, r.y + r.h), R(r.x, r.y + r.h)], true);
  });
  (drawing.circles || []).forEach(c => ents.g(0, 'CIRCLE').g(8, lay(c, 'circle')).g(10, f(c.cx)).g(20, f(Y(c.cy))).g(30, 0).g(40, f(c.r)));
  (drawing.arcs || []).forEach(a => {
    // Canvas arc: positive sweep a0→a1 with Y down  ==  CCW arc from -a1 to -a0 with Y up.
    ents.g(0, 'ARC').g(8, lay(a, 'arc')).g(10, f(a.cx)).g(20, f(Y(a.cy))).g(30, 0).g(40, f(a.r)).g(50, f(norm360(-deg(a.a1)))).g(51, f(norm360(-deg(a.a0))));
  });
  (drawing.polylines || []).forEach(p => poly(lay(p, 'polyline'), p.points || [], !!p.closed));
  (drawing.texts || []).forEach(t => text(lay(t, 'text'), t.x, t.y, t.fontSize || 14, t.label || '', t.rotation || 0));

  const fxLayer = noteLayer(safeLayerName('Fixtures'), 'layer-lighting');
  const lblLayer = noteLayer(safeLayerName('Fixture labels'), 'layer-lighting');
  (drawing.fixtures || []).forEach(fx => {
    ents.g(0, 'CIRCLE').g(8, fxLayer).g(10, f(fx.x)).g(20, f(Y(fx.y))).g(30, 0).g(40, 150);
    const lbl = fx.channel || fx.unit;
    if (lbl) text(lblLayer, fx.x + 180, fx.y, 100, lbl);
  });

  const out = new Out();
  out.g(0, 'SECTION').g(2, 'HEADER').g(9, '$ACADVER').g(1, 'AC1009').g(9, '$INSUNITS').g(70, 4).g(0, 'ENDSEC');
  out.g(0, 'SECTION').g(2, 'TABLES').g(0, 'TABLE').g(2, 'LAYER').g(70, used.size + 1);
  out.g(0, 'LAYER').g(2, '0').g(70, 0).g(62, 7).g(6, 'CONTINUOUS');
  for (const [name, aci] of used) out.g(0, 'LAYER').g(2, name).g(70, 0).g(62, aci).g(6, 'CONTINUOUS');
  out.g(0, 'ENDTAB').g(0, 'ENDSEC');
  out.g(0, 'SECTION').g(2, 'ENTITIES');
  return out.toString() + ents.toString() + new Out().g(0, 'ENDSEC').g(0, 'EOF').toString();
}
