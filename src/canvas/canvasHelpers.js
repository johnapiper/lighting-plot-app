// Small pure helpers shared by the canvas — extracted from Canvas.jsx.

export const LAYER_DEFAULTS = {
  fixture: 'layer-lighting', pipe: 'layer-lighting',
  line: 'layer-arch', rect: 'layer-arch', text: 'layer-arch',
  image: 'layer-bg', annotation: 'layer-arch', dimension: 'layer-dimensions',
  circle: 'layer-arch', arc: 'layer-arch', polyline: 'layer-arch',
};

// SVG path for an arc centred at (cx,cy), radius r, from angle a0 to a1 (radians, CCW).
export function arcPath(cx, cy, r, a0, a1) {
  let sweep = a1 - a0;
  while (sweep < 0) sweep += Math.PI * 2;
  const large = sweep > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
export function getLayerId(obj, kind) { return obj.layerId || LAYER_DEFAULTS[kind] || 'layer-arch'; }

// Text shown under each fixture symbol, chosen from the status-bar Labels menu.
export const LABEL_MODES = [
  ['auto', 'Auto (channel, else unit)'], ['channel', 'Channel'], ['address', 'DMX address'],
  ['unit', 'Unit number'], ['position', 'Position'], ['colour', 'Colour / gel'],
  ['purpose', 'Purpose'], ['mode', 'DMX mode'], ['none', 'None'],
];
export function fixtureLabel(f, mode) {
  const v = (x) => (x == null ? '' : String(x).trim()) || null;
  switch (mode) {
    case 'channel':  return v(f.channel) ? `Ch.${v(f.channel)}` : null;
    case 'address':  return v(f.dmxAddress);
    case 'unit':     return v(f.unit);
    case 'position': return v(f.position);
    case 'colour':   return v(f.colour);
    case 'purpose':  return v(f.purpose);
    case 'mode':     return v(f.dmxMode);
    case 'none':     return null;
    default:         return v(f.channel) ? `Ch.${v(f.channel)}` : v(f.unit);
  }
}

// Pan (rotation) + tilt so a fixture at (fx,fy) hung h mm above the floor aims
// its beam axis at the floor point (tx,ty). Beam direction in the symbol is
// (-sin(rot), cos(rot)); tilt is the angle from vertical.
export function aimAt(fx, fy, tx, ty, h) {
  const dx = tx - fx, dy = ty - fy;
  const D = Math.hypot(dx, dy);
  return {
    rotation: Math.atan2(-dx, dy) * 180 / Math.PI,
    tilt: Math.atan2(D, h || 5500) * 180 / Math.PI,
  };
}
