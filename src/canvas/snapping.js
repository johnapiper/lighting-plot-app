/**
 * Object snapping (OSNAP) engine.
 *
 * Given a cursor position and the drawing geometry, returns the best snap point
 * and its type (endpoint / midpoint / center / intersection / perpendicular /
 * nearest). Pure functions — no React, no rendering.
 *
 * World units are millimetres; callers pass a snap radius already converted to
 * world units (i.e. pixelRadius / zoom).
 */
import { distance, distanceToSegment, projectPointOntoLine } from './geometry';

// Higher priority wins when two candidates are within the snap radius.
export const SNAP_PRIORITY = {
  endpoint: 6,
  intersection: 5,
  midpoint: 4,
  center: 3,
  perpendicular: 2,
  nearest: 1,
};

// Collect snap "points" (with a type) and "segments" (straight edges) from the
// drawing. Cheap enough to call per mouse-move for typical plot sizes.
export function gatherSnapTargets(drawing) {
  const points = [];   // { x, y, type }
  const segments = [];  // { x1, y1, x2, y2 }
  if (!drawing) return { points, segments };

  const addSeg = (x1, y1, x2, y2) => {
    segments.push({ x1, y1, x2, y2 });
    points.push({ x: x1, y: y1, type: 'endpoint' });
    points.push({ x: x2, y: y2, type: 'endpoint' });
    points.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, type: 'midpoint' });
  };

  (drawing.pipes || []).forEach(p => addSeg(p.x1, p.y1, p.x2, p.y2));
  (drawing.lines || []).forEach(l => addSeg(l.x1, l.y1, l.x2, l.y2));
  (drawing.dimensions || []).forEach(d => addSeg(d.x1, d.y1, d.x2, d.y2));

  (drawing.rectangles || []).forEach(r => {
    const { x, y, w, h } = r;
    addSeg(x, y, x + w, y);
    addSeg(x + w, y, x + w, y + h);
    addSeg(x + w, y + h, x, y + h);
    addSeg(x, y + h, x, y);
    points.push({ x: x + w / 2, y: y + h / 2, type: 'center' });
  });

  (drawing.polylines || []).forEach(pl => {
    const pts = pl.points || [];
    for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (pl.closed && pts.length > 2) addSeg(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
  });

  (drawing.circles || []).forEach(c => {
    points.push({ x: c.cx, y: c.cy, type: 'center' });
    // Quadrant points
    points.push({ x: c.cx + c.r, y: c.cy, type: 'endpoint' });
    points.push({ x: c.cx - c.r, y: c.cy, type: 'endpoint' });
    points.push({ x: c.cx, y: c.cy + c.r, type: 'endpoint' });
    points.push({ x: c.cx, y: c.cy - c.r, type: 'endpoint' });
  });

  (drawing.arcs || []).forEach(a => {
    points.push({ x: a.cx, y: a.cy, type: 'center' });
    points.push({ x: a.cx + a.r * Math.cos(a.a0), y: a.cy + a.r * Math.sin(a.a0), type: 'endpoint' });
    points.push({ x: a.cx + a.r * Math.cos(a.a1), y: a.cy + a.r * Math.sin(a.a1), type: 'endpoint' });
  });

  (drawing.fixtures || []).forEach(f => points.push({ x: f.x, y: f.y, type: 'center' }));
  (drawing.infrastructure || []).forEach(i => points.push({ x: i.x, y: i.y, type: 'center' }));

  return { points, segments };
}

// Intersection of two segments, or null if they don't cross within both spans.
function segIntersection(a, b) {
  const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
  const x3 = b.x1, y3 = b.y1, x4 = b.x2, y4 = b.y2;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * Find the best snap near (wx, wy).
 * @param fromPoint  optional {x,y} — the anchor of the line being drawn, used
 *                   for perpendicular snaps.
 * Returns { x, y, type } or null.
 */
export function computeOsnap(wx, wy, targets, radius, fromPoint) {
  if (!targets) return null;
  const { points, segments } = targets;
  let best = null; // { x, y, type, score }

  const consider = (x, y, type) => {
    const d = distance(wx, wy, x, y);
    if (d > radius) return;
    // Score: priority first, then closeness.
    const score = SNAP_PRIORITY[type] * 100000 - d;
    if (!best || score > best.score) best = { x, y, type, score };
  };

  // Vertex / midpoint / center candidates.
  for (const p of points) consider(p.x, p.y, p.type);

  // Intersections (pairwise). Skip on very large drawings to keep mouse-move
  // responsive (O(n²) — only worthwhile up to a couple hundred segments).
  if (segments.length <= 160) {
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const ip = segIntersection(segments[i], segments[j]);
        if (ip) consider(ip.x, ip.y, 'intersection');
      }
    }
  }

  // Perpendicular foot from the anchor point onto each segment.
  if (fromPoint) {
    for (const s of segments) {
      const foot = projectPointOntoLine(fromPoint.x, fromPoint.y, s.x1, s.y1, s.x2, s.y2);
      // Only accept if the foot lies on the segment span and is near the cursor.
      const onSpan = distanceToSegment(foot.x, foot.y, s.x1, s.y1, s.x2, s.y2) < 1e-6;
      if (onSpan) consider(foot.x, foot.y, 'perpendicular');
    }
  }

  // Nearest point on a segment (weakest snap — only if nothing better found).
  if (!best) {
    for (const s of segments) {
      const foot = projectPointOntoLine(wx, wy, s.x1, s.y1, s.x2, s.y2);
      const onSpan = distanceToSegment(foot.x, foot.y, s.x1, s.y1, s.x2, s.y2) < 1e-6;
      if (onSpan) consider(foot.x, foot.y, 'nearest');
    }
  }

  return best ? { x: best.x, y: best.y, type: best.type } : null;
}

// Constrain a point to ortho / polar angles relative to an anchor.
// increment in degrees (e.g. 45). Returns the constrained {x,y}.
export function constrainAngle(ax, ay, px, py, increment = 45) {
  const dx = px - ax, dy = py - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: px, y: py };
  const ang = Math.atan2(dy, dx);
  const step = (increment * Math.PI) / 180;
  const snapped = Math.round(ang / step) * step;
  return { x: ax + len * Math.cos(snapped), y: ay + len * Math.sin(snapped) };
}
