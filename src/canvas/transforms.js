/**
 * Geometry transforms for CAD objects (translate / mirror / rotate / offset).
 * Each function takes an object + its kind and returns a NEW transformed object
 * (deep-cloned). Callers assign fresh ids when creating copies.
 */
import { generateId } from './geometry';

const norm360 = (a) => ((a % 360) + 360) % 360;

export function cloneWithId(o) {
  const n = JSON.parse(JSON.stringify(o));
  n.id = generateId();
  delete n.groupId;
  return n;
}

// ── Translate ───────────────────────────────────────────────────────────────
export function translateObject(o, kind, dx, dy) {
  const n = JSON.parse(JSON.stringify(o));
  switch (kind) {
    case 'fixture': case 'text': case 'infra':
      n.x += dx; n.y += dy; break;
    case 'pipe': case 'line': case 'dimension':
      n.x1 += dx; n.y1 += dy; n.x2 += dx; n.y2 += dy; break;
    case 'rect': case 'image': case 'annotation':
      n.x += dx; n.y += dy; break;
    case 'circle': case 'arc':
      n.cx += dx; n.cy += dy; break;
    case 'polyline':
      n.points = (o.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })); break;
    default: break;
  }
  return n;
}

// ── Mirror across a vertical (axis='v', x=c) or horizontal (axis='h', y=c) line ─
export function mirrorObject(o, kind, axis, c) {
  const P = (x, y) => axis === 'v' ? { x: 2 * c - x, y } : { x, y: 2 * c - y };
  const n = JSON.parse(JSON.stringify(o));
  switch (kind) {
    case 'fixture': {
      const p = P(o.x, o.y); n.x = p.x; n.y = p.y;
      n.rotation = norm360(axis === 'v' ? 180 - (o.rotation || 0) : 360 - (o.rotation || 0));
      break;
    }
    case 'text': { const p = P(o.x, o.y); n.x = p.x; n.y = p.y; break; }
    case 'pipe': case 'line': case 'dimension': {
      const a = P(o.x1, o.y1), b = P(o.x2, o.y2);
      n.x1 = a.x; n.y1 = a.y; n.x2 = b.x; n.y2 = b.y; break;
    }
    case 'rect': case 'image': case 'annotation': {
      const w = o.w || 0, h = o.h || 0;
      const tl = P(o.x, o.y), br = P(o.x + w, o.y + h);
      n.x = Math.min(tl.x, br.x); n.y = Math.min(tl.y, br.y);
      n.w = Math.abs(br.x - tl.x); n.h = Math.abs(br.y - tl.y); break;
    }
    case 'circle': { const p = P(o.cx, o.cy); n.cx = p.x; n.cy = p.y; break; }
    case 'arc': {
      const p = P(o.cx, o.cy); n.cx = p.x; n.cy = p.y;
      const reflect = (ang) => axis === 'v' ? Math.PI - ang : -ang;
      n.a0 = reflect(o.a1); n.a1 = reflect(o.a0); break;   // swap to keep sweep direction
    }
    case 'polyline': { n.points = (o.points || []).map(pt => P(pt.x, pt.y)); break; }
    default: break;
  }
  return n;
}

// ── Rotate about a pivot (radians) ──────────────────────────────────────────
export function rotateObject(o, kind, px, py, rad) {
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const R = (x, y) => {
    const dx = x - px, dy = y - py;
    return { x: px + dx * cos - dy * sin, y: py + dx * sin + dy * cos };
  };
  const degDelta = rad * 180 / Math.PI;
  const n = JSON.parse(JSON.stringify(o));
  switch (kind) {
    case 'fixture': { const p = R(o.x, o.y); n.x = p.x; n.y = p.y; n.rotation = norm360((o.rotation || 0) + degDelta); break; }
    case 'text': { const p = R(o.x, o.y); n.x = p.x; n.y = p.y; n.rotation = (o.rotation || 0) + degDelta; break; }
    case 'pipe': case 'line': case 'dimension': {
      const a = R(o.x1, o.y1), b = R(o.x2, o.y2);
      n.x1 = a.x; n.y1 = a.y; n.x2 = b.x; n.y2 = b.y; break;
    }
    case 'rect': case 'image': case 'annotation': {
      const p = R(o.x, o.y); n.x = p.x; n.y = p.y; n.rotation = (o.rotation || 0) + degDelta; break;
    }
    case 'circle': { const p = R(o.cx, o.cy); n.cx = p.x; n.cy = p.y; break; }
    case 'arc': { const p = R(o.cx, o.cy); n.cx = p.x; n.cy = p.y; n.a0 = o.a0 + rad; n.a1 = o.a1 + rad; break; }
    case 'polyline': { n.points = (o.points || []).map(pt => R(pt.x, pt.y)); break; }
    default: break;
  }
  return n;
}

// ── Offset (parallel copy at perpendicular distance) ────────────────────────
// Supports line/pipe (shift perpendicular), circle/arc (grow/shrink radius),
// polyline (shift each vertex along the averaged adjacent-segment normal).
export function offsetObject(o, kind, dist) {
  const n = JSON.parse(JSON.stringify(o));
  const segNormal = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    return { nx: -dy / len, ny: dx / len };
  };
  switch (kind) {
    case 'pipe': case 'line': {
      const { nx, ny } = segNormal(o.x1, o.y1, o.x2, o.y2);
      n.x1 = o.x1 + nx * dist; n.y1 = o.y1 + ny * dist;
      n.x2 = o.x2 + nx * dist; n.y2 = o.y2 + ny * dist; break;
    }
    case 'circle': { n.r = Math.max(1, o.r + dist); break; }
    case 'arc': { n.r = Math.max(1, o.r + dist); break; }
    case 'polyline': {
      const pts = o.points || [];
      n.points = pts.map((p, i) => {
        const prev = pts[i - 1], next = pts[i + 1];
        let nx = 0, ny = 0;
        if (prev) { const s = segNormal(prev.x, prev.y, p.x, p.y); nx += s.nx; ny += s.ny; }
        if (next) { const s = segNormal(p.x, p.y, next.x, next.y); nx += s.nx; ny += s.ny; }
        const len = Math.hypot(nx, ny) || 1;
        return { x: p.x + (nx / len) * dist, y: p.y + (ny / len) * dist };
      });
      break;
    }
    default: return null; // not offsettable
  }
  return n;
}

// Bounding box of an object (for align/distribute).
export function objectBounds(o, kind) {
  switch (kind) {
    case 'fixture': case 'text': case 'infra': return { minX: o.x, minY: o.y, maxX: o.x, maxY: o.y };
    case 'pipe': case 'line': case 'dimension':
      return { minX: Math.min(o.x1, o.x2), minY: Math.min(o.y1, o.y2), maxX: Math.max(o.x1, o.x2), maxY: Math.max(o.y1, o.y2) };
    case 'rect': case 'image': case 'annotation':
      return { minX: o.x, minY: o.y, maxX: o.x + (o.w || 0), maxY: o.y + (o.h || 0) };
    case 'circle': case 'arc':
      return { minX: o.cx - o.r, minY: o.cy - o.r, maxX: o.cx + o.r, maxY: o.cy + o.r };
    case 'polyline': {
      const xs = (o.points || []).map(p => p.x), ys = (o.points || []).map(p => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    default: return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}
