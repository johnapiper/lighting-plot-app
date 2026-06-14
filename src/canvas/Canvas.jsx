import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import FixtureSymbol from '../fixtures/FixtureSymbol';
import {
  snapPointToGrid, distance, projectPointOntoLine,
  distanceToSegment, pipeAngle, generateId,
} from './geometry';
import InfraLayer from './InfraLayer';
import CablingLayer from './CablingLayer';
import { findNearestStructure } from '../cabling/routing';
import { formatLength, formatCoord, toDisplayValue, UNIT_LABELS, MM_PER_UNIT } from './units';
import { gatherSnapTargets, computeOsnap, constrainAngle } from './snapping';

const RULER_SIZE = 20;
const HIT_RADIUS = 8;
const PIPE_SNAP_RADIUS = 40;
const HANDLE_R = 6;
const BOX_THRESHOLD = 5;
const OSNAP_RADIUS = 12; // screen px within which object snaps engage

const LAYER_DEFAULTS = {
  fixture: 'layer-lighting', pipe: 'layer-lighting',
  line: 'layer-arch', rect: 'layer-arch', text: 'layer-arch',
  image: 'layer-bg', annotation: 'layer-arch', dimension: 'layer-arch',
  circle: 'layer-arch', arc: 'layer-arch', polyline: 'layer-arch',
};

// SVG path for an arc centred at (cx,cy), radius r, from angle a0 to a1 (radians, CCW).
function arcPath(cx, cy, r, a0, a1) {
  let sweep = a1 - a0;
  while (sweep < 0) sweep += Math.PI * 2;
  const large = sweep > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
function getLayerId(obj, kind) { return obj.layerId || LAYER_DEFAULTS[kind] || 'layer-arch'; }

export default function Canvas({
  project, drawing, commit, softUpdate,
  activeTool, pendingFixture, onPendingFixturePlaced,
  selectedId, selectedIds, onSelect, onMultiSelect,
  showGrid, showRulers, fixtureTypes,
  zoom, pan, onZoomChange, onPanChange, snap,
  onToolDone, onToolChange, dragTargetLayerRef,
  activeLayerId,
  animating,
  activeMode = 'cad',
  fitRef,
  dmxConflicts = [],
  onSwapFixture,
  onDuplicateAlongPath,
  canEdit = true,
}) {
  const svgRef = useRef(null);
  // Unified snap config — defaults all-on. Held in a ref so the canvas mouse
  // handlers (useCallback) always read the live value, not a stale closure.
  const snapCfg = snap || { enabled: true, endpoint: true, midpoint: true, center: true, intersection: true, nearest: true, grid: true, pipe: true };
  const snapRef = useRef(snapCfg);
  useEffect(() => { snapRef.current = snapCfg; });
  const canEditRef = useRef(canEdit);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

  const [drawingState, setDrawingState] = useState(null);
  const drawingRef = useRef(null);
  useEffect(() => { drawingRef.current = drawingState; }, [drawingState]);

  // Transient measurement (Measure tool): null | {x1,y1} | {x1,y1,x2,y2,done}.
  // Persists on screen while the tool is active; a new click resets it; it is
  // cleared when the Measure tool is deselected.
  const [measure, setMeasure] = useState(null);
  const measureRef = useRef(null);
  useEffect(() => { measureRef.current = measure; }, [measure]);
  useEffect(() => { if (activeTool !== 'dimension') setMeasure(null); }, [activeTool]);

  // Multi-segment polyline in progress: { points: [{x,y}], closed } | null.
  const [polyDraw, setPolyDraw] = useState(null);
  const polyRef = useRef(null);
  useEffect(() => { polyRef.current = polyDraw; }, [polyDraw]);
  useEffect(() => { if (activeTool !== 'polyline') setPolyDraw(null); }, [activeTool]);

  // Arc construction (center → start → end): { stage, cx, cy, r, a0 } | null.
  const [arcDraw, setArcDraw] = useState(null);
  const arcRef = useRef(null);
  useEffect(() => { arcRef.current = arcDraw; }, [arcDraw]);
  useEffect(() => { if (activeTool !== 'arc') setArcDraw(null); }, [activeTool]);

  // AutoCAD-style dynamic numeric input. While drawing a line/pipe/rect/circle,
  // typing a number sets a dimension (length/angle, width/height, or radius),
  // updates the preview live, and Enter confirms.
  const dynValsRef = useRef({});   // { length, angle | width, height | radius }
  const dynActiveRef = useRef(0);  // index of the field currently being typed
  const [, setDynVersion] = useState(0);
  const bumpDyn = () => setDynVersion(v => v + 1);
  function resetDyn() { dynValsRef.current = {}; dynActiveRef.current = 0; bumpDyn(); }
  useEffect(() => { if (!drawingState) resetDyn(); }, [drawingState]);

  function dynFieldsFor(kind) {
    if (kind === 'line' || kind === 'pipe') return ['length', 'angle'];
    if (kind === 'rect') return ['width', 'height'];
    if (kind === 'circle') return ['radius'];
    return [];
  }
  // Compute the preview endpoint from the anchor, a reference cursor (ex,ey) for
  // direction, and any typed dimensions.
  function applyDyn(ds, ex, ey) {
    const v = dynValsRef.current;
    const units = meta?.units || 'mm';
    const toW = (s) => parseFloat(s) * (MM_PER_UNIT[units] || 1);
    const has = (s) => s !== undefined && s !== '' && !isNaN(parseFloat(s));
    if (ds.kind === 'line' || ds.kind === 'pipe') {
      const ang = has(v.angle) ? parseFloat(v.angle) * Math.PI / 180 : Math.atan2(-(ey - ds.y1), ex - ds.x1);
      const len = has(v.length) ? toW(v.length) : Math.hypot(ex - ds.x1, ey - ds.y1);
      return { x2: ds.x1 + Math.cos(ang) * len, y2: ds.y1 - Math.sin(ang) * len };
    }
    if (ds.kind === 'rect') {
      const sx = ex >= ds.x1 ? 1 : -1, sy = ey >= ds.y1 ? 1 : -1;
      const w = has(v.width) ? toW(v.width) : Math.abs(ex - ds.x1);
      const h = has(v.height) ? toW(v.height) : Math.abs(ey - ds.y1);
      return { x2: ds.x1 + sx * w, y2: ds.y1 + sy * h };
    }
    if (ds.kind === 'circle') {
      const ang = Math.atan2(ey - ds.y1, ex - ds.x1);
      const r = has(v.radius) ? toW(v.radius) : Math.hypot(ex - ds.x1, ey - ds.y1);
      return { x2: ds.x1 + Math.cos(ang) * r, y2: ds.y1 + Math.sin(ang) * r };
    }
    return { x2: ex, y2: ey };
  }

  const [dragging, setDragging] = useState(null);
  const draggingRef = useRef(null);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  const [selBox, setSelBox] = useState(null);
  const selBoxStart = useRef(null);
  const mouseDownScreen = useRef(null);

  const [contextMenu, setContextMenu] = useState(null);
  const [focusModeId, setFocusModeId] = useState(null);
  const [focusCursor, setFocusCursor] = useState(null);
  const [editingText, setEditingText] = useState(null);

  const [hoveredPipe, setHoveredPipe] = useState(null);
  const [cursorPos, setCursorPos] = useState(null);
  const [rawCursorPos, setRawCursorPos] = useState(null); // unsnapped world coords for calibrate hover
  const [clipboard, setClipboard] = useState(null); // [{...obj, _clipKind}]
  const clipboardRef = useRef(null);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  const pasteGeneration = useRef(0); // increments per paste so repeated Ctrl+V staggers
  const [pipePlaceAngle, setPipePlaceAngle] = useState(null);
  const [snapPoint, setSnapPoint] = useState(null); // { x, y, type } visual snap indicator
  const [alignGuides, setAlignGuides] = useState(null); // { vx, hy } alignment guide lines while dragging
  const shiftRef = useRef(false);   // ortho/angle constrain while held
  const bypassRef = useRef(false);  // Ctrl held → free placement, no snapping

  // Snap targets recomputed when the drawing geometry changes.
  const snapTargets = useMemo(() => gatherSnapTargets(drawing), [drawing]);
  // Cable waypoint editing: { cableId, wpIdx, baseWaypoints }
  const [wpDrag, setWpDrag] = useState(null);
  const wpDragRef = useRef(null);
  useEffect(() => { wpDragRef.current = wpDrag; }, [wpDrag]);
  const isPanning = useRef(false);
  const lastMouse = useRef(null);

  // Scale calibration state
  const [calibState, setCalibState] = useState(null); // null | {p1} | {p1, p2, showDialog}
  const [calibDist, setCalibDist] = useState('');
  const [calibUnit, setCalibUnit] = useState('m');

  // Fixture scale handle: null = hidden; { id, scope } = active
  // scope: 'one' | 'type' | 'all'
  const [scaleMode, setScaleMode] = useState(null);

  // Beam footprint visibility
  const [showBeams, setShowBeams] = useState(true);

  // Extract objects from active drawing
  const pipes = drawing?.pipes || [];
  const fixtures = drawing?.fixtures || [];
  const lines = drawing?.lines || [];
  const rectangles = drawing?.rectangles || [];
  const texts = drawing?.texts || [];
  const images = drawing?.images || [];
  const annotations = drawing?.annotations || [];
  const circles = drawing?.circles || [];
  const arcs = drawing?.arcs || [];
  const polylines = drawing?.polylines || [];
  const infrastructure = drawing?.infrastructure || [];
  const cables = drawing?.cables || [];
  const pdfBackground = drawing?.pdfBackground || null;
  const { meta, layers } = project;
  const gridSize = meta?.gridSize || 20;
  const rigHeight = meta?.rigHeight || 5500;
  const gridHeight = meta?.gridHeight || 6000;

  // ── Cable drawing state ────────────────────────────────────────────────
  const [cableFrom, setCableFrom] = useState(null); // {id, type, x, y} when mid-draw
  const [cableGhost, setCableGhost] = useState(null); // {x, y} cursor pos

  // ─── Drawing-level commit helpers ─────────────────────────────────────
  function commitToDrawing(updater, label) {
    commit(proj => {
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId) || proj.drawings[0];
      if (d) updater(d);
      return proj;
    }, label);
  }
  function softUpdateDrawing(updater) {
    softUpdate(proj => {
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId) || proj.drawings[0];
      if (d) updater(d);
      return proj;
    });
  }

  // ─── Layer helpers ────────────────────────────────────────────────────
  function isLayerVisible(layerId) {
    const layer = (layers || []).find(l => l.id === layerId);
    return !layer || layer.visible !== false;
  }
  function isLayerLocked(layerId) {
    return (layers || []).find(l => l.id === layerId)?.locked === true;
  }

  // ─── Coordinate helpers ───────────────────────────────────────────────
  function screenToWorld(sx, sy) {
    const rect = svgRef.current.getBoundingClientRect();
    const ox = showRulers ? RULER_SIZE : 0, oy = showRulers ? RULER_SIZE : 0;
    return {
      x: (sx - rect.left - ox - pan.x) / zoom,
      y: (sy - rect.top - oy - pan.y) / zoom,
    };
  }
  // Snap precedence: Ctrl bypasses everything; otherwise object snap (per the
  // enabled types) wins, then Shift-ortho constrain to the anchor, then grid
  // (if grid snap is enabled). `fromPoint` is the line anchor. Returns {x,y,snapType}.
  function getSnapped(sx, sy, fromPoint) {
    const w = screenToWorld(sx, sy);
    const cfg = snapRef.current || {};
    if (bypassRef.current) return { x: w.x, y: w.y, snapType: null };
    if (cfg.enabled) {
      const os = computeOsnap(w.x, w.y, snapTargets, OSNAP_RADIUS / zoom, fromPoint, cfg);
      if (os) return { x: os.x, y: os.y, snapType: os.type };
    }
    if (shiftRef.current && fromPoint) {
      const c = constrainAngle(fromPoint.x, fromPoint.y, w.x, w.y, 45);
      const g = cfg.grid ? snapPointToGrid(c.x, c.y, gridSize) : c;
      return { x: g.x, y: g.y, snapType: 'ortho' };
    }
    if (cfg.grid) { const g = snapPointToGrid(w.x, w.y, gridSize); return { x: g.x, y: g.y, snapType: null }; }
    return { x: w.x, y: w.y, snapType: null };
  }
  function findNearestPipe(wx, wy) {
    let best = null, bestDist = Infinity;
    for (const p of pipes) {
      const d = distanceToSegment(wx, wy, p.x1, p.y1, p.x2, p.y2);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return bestDist < PIPE_SNAP_RADIUS / zoom ? best : null;
  }

  // Snap to nearest pipe/truss endpoint (for pipe placement chaining)
  function findNearestPipeEndpoint(wx, wy) {
    let best = null, bestDist = Infinity;
    for (const p of pipes) {
      const d1 = distance(wx, wy, p.x1, p.y1);
      const d2 = distance(wx, wy, p.x2, p.y2);
      if (d1 < d2 && d1 < bestDist) { bestDist = d1; best = { x: p.x1, y: p.y1 }; }
      else if (d2 < d1 && d2 < bestDist) { bestDist = d2; best = { x: p.x2, y: p.y2 }; }
    }
    return bestDist < PIPE_SNAP_RADIUS / zoom ? best : null;
  }

  // Given a free endpoint and a constrained angle (deg), compute snapped endpoint
  function constrainToAngle(sx, sy, ex, ey, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const dx = ex - sx, dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: sx + Math.cos(rad) * len, y: sy + Math.sin(rad) * len };
  }

  // ─── Group helpers ────────────────────────────────────────────────────
  function getGroupMemberIds(groupId) {
    const ids = [];
    [...fixtures, ...pipes, ...lines, ...rectangles, ...texts, ...images, ...annotations].forEach(o => {
      if (o.groupId === groupId) ids.push(o.id);
    });
    return ids;
  }
  function getGroupMembersForDrag(groupId, excludeId) {
    const members = [];
    fixtures.forEach(f => { if (f.groupId === groupId && f.id !== excludeId) members.push({ id: f.id, kind: 'fixture', origX: f.x, origY: f.y }); });
    pipes.forEach(p => { if (p.groupId === groupId && p.id !== excludeId) members.push({ id: p.id, kind: 'pipe', origX: p.x1, origY: p.y1, origX2: p.x2, origY2: p.y2 }); });
    lines.forEach(l => { if (l.groupId === groupId && l.id !== excludeId) members.push({ id: l.id, kind: 'line', origX: l.x1, origY: l.y1, origX2: l.x2, origY2: l.y2 }); });
    rectangles.forEach(r => { if (r.groupId === groupId && r.id !== excludeId) members.push({ id: r.id, kind: 'rect', origX: r.x, origY: r.y, origW: r.w, origH: r.h }); });
    texts.forEach(t => { if (t.groupId === groupId && t.id !== excludeId) members.push({ id: t.id, kind: 'text', origX: t.x, origY: t.y }); });
    images.forEach(i => { if (i.groupId === groupId && i.id !== excludeId) members.push({ id: i.id, kind: 'image', origX: i.x, origY: i.y }); });
    annotations.forEach(a => { if (a.groupId === groupId && a.id !== excludeId) members.push({ id: a.id, kind: 'annotation', origX: a.x, origY: a.y }); });
    return members;
  }

  // ─── Hit testing ──────────────────────────────────────────────────────
  function hitTestAll(wx, wy, includeLocked = false) {
    const allObjs = [
      ...images.map(o => ({ ...o, _kind: 'image' })),
      ...(drawing?.dimensions||[]).map(o => ({ ...o, _kind: 'dimension' })),
      ...fixtures.map(o => ({ ...o, _kind: 'fixture' })),
      ...pipes.map(o => ({ ...o, _kind: 'pipe' })),
      ...lines.map(o => ({ ...o, _kind: 'line' })),
      ...rectangles.map(o => ({ ...o, _kind: 'rect' })),
      ...texts.map(o => ({ ...o, _kind: 'text' })),
      ...annotations.map(o => ({ ...o, _kind: 'annotation' })),
      ...circles.map(o => ({ ...o, _kind: 'circle' })),
      ...arcs.map(o => ({ ...o, _kind: 'arc' })),
      ...polylines.map(o => ({ ...o, _kind: 'polyline' })),
      ...infrastructure.map(o => ({ ...o, _kind: 'infra' })),
    ];

    for (const obj of allObjs) {
      const k = obj._kind;
      if (!includeLocked && obj.locked) continue;
      if (!isLayerVisible(getLayerId(obj, k))) continue;
      if (!includeLocked && isLayerLocked(getLayerId(obj, k))) continue;
      // Restrict selection to the active layer (infra objects are always selectable)
      if (activeLayerId && k !== 'infra' && getLayerId(obj, k) !== activeLayerId) continue;

      if (k === 'image') {
        if (wx >= obj.x && wx <= obj.x + obj.w && wy >= obj.y && wy <= obj.y + obj.h)
          return { kind: k, ...obj };
      } else if (k === 'fixture') {
        if (distance(wx, wy, obj.x, obj.y) < HIT_RADIUS / zoom * 1.8)
          return { kind: k, ...obj };
      } else if (k === 'pipe' || k === 'line') {
        if (distanceToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) < HIT_RADIUS / zoom)
          return { kind: k, ...obj };
      } else if (k === 'rect') {
        if (wx >= obj.x && wx <= obj.x + obj.w && wy >= obj.y && wy <= obj.y + obj.h)
          return { kind: k, ...obj };
      } else if (k === 'text' || k === 'annotation') {
        const fs = obj.fontSize || 14;
        const approxW = (obj.label || '').length * fs * 0.6 + 10;
        if (wx >= obj.x && wx <= obj.x + approxW && wy >= obj.y - fs && wy <= obj.y + (k === 'annotation' ? (obj.h || 40) : 0))
          return { kind: k, ...obj };
      } else if (k === 'infra') {
        if (distance(wx, wy, obj.x, obj.y) < 28 / zoom)
          return { kind: k, ...obj };
      } else if (k === 'dimension') {
        if (distanceToSegment(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) < HIT_RADIUS / zoom)
          return { kind: k, ...obj };
      } else if (k === 'circle') {
        if (Math.abs(distance(wx, wy, obj.cx, obj.cy) - obj.r) < HIT_RADIUS / zoom)
          return { kind: k, ...obj };
      } else if (k === 'arc') {
        if (Math.abs(distance(wx, wy, obj.cx, obj.cy) - obj.r) < HIT_RADIUS / zoom)
          return { kind: k, ...obj };
      } else if (k === 'polyline') {
        const pts = obj.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          if (distanceToSegment(wx, wy, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y) < HIT_RADIUS / zoom)
            return { kind: k, ...obj };
        }
      }
    }
    return null;
  }

  function getItemsInBox(bx1, by1, bx2, by2) {
    const minX = Math.min(bx1, bx2), maxX = Math.max(bx1, bx2);
    const minY = Math.min(by1, by2), maxY = Math.max(by1, by2);
    const ids = [];
    const check = (arr, kind, cx, cy) => arr.forEach(o => {
      if (o.locked || !isLayerVisible(getLayerId(o, kind)) || isLayerLocked(getLayerId(o, kind))) return;
      if (activeLayerId && getLayerId(o, kind) !== activeLayerId) return;
      const x = cx(o), y = cy(o);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) ids.push(o.id);
    });
    check(fixtures, 'fixture', o => o.x, o => o.y);
    check(pipes, 'pipe', o => (o.x1+o.x2)/2, o => (o.y1+o.y2)/2);
    check(lines, 'line', o => (o.x1+o.x2)/2, o => (o.y1+o.y2)/2);
    check(rectangles, 'rect', o => o.x+o.w/2, o => o.y+o.h/2);
    check(texts, 'text', o => o.x, o => o.y);
    check(annotations, 'annotation', o => o.x, o => o.y);
    return ids;
  }

  // ─── Object bounds for selection handles ─────────────────────────────
  function getObjectBounds(id) {
    const f = fixtures.find(o => o.id === id);
    if (f) { const r = 18; return { x: f.x-r, y: f.y-r, w: r*2, h: r*2, cx: f.x, cy: f.y, obj: f, kind: 'fixture' }; }
    const p = pipes.find(o => o.id === id);
    if (p) { const x = Math.min(p.x1,p.x2), y = Math.min(p.y1,p.y2); const w = Math.max(Math.abs(p.x2-p.x1),2), h = Math.max(Math.abs(p.y2-p.y1),2); return { x, y, w, h, cx: (p.x1+p.x2)/2, cy: (p.y1+p.y2)/2, obj: p, kind: 'pipe' }; }
    const l = lines.find(o => o.id === id);
    if (l) { const x = Math.min(l.x1,l.x2), y = Math.min(l.y1,l.y2); const w = Math.max(Math.abs(l.x2-l.x1),2), h = Math.max(Math.abs(l.y2-l.y1),2); return { x, y, w, h, cx: (l.x1+l.x2)/2, cy: (l.y1+l.y2)/2, obj: l, kind: 'line' }; }
    const r = rectangles.find(o => o.id === id);
    if (r) return { x: r.x, y: r.y, w: r.w, h: r.h, cx: r.x+r.w/2, cy: r.y+r.h/2, obj: r, kind: 'rect' };
    const t = texts.find(o => o.id === id);
    if (t) { const fs = t.fontSize||14; const tw = (t.label||'').length*fs*0.6; return { x: t.x, y: t.y-fs, w: Math.max(tw,20), h: fs, cx: t.x+tw/2, cy: t.y-fs/2, obj: t, kind: 'text' }; }
    const img = images.find(o => o.id === id);
    if (img) return { x: img.x, y: img.y, w: img.w, h: img.h, cx: img.x+img.w/2, cy: img.y+img.h/2, obj: img, kind: 'image' };
    const a = annotations.find(o => o.id === id);
    if (a) { const aw = a.w || 120; const ah = a.h || 50; return { x: a.x, y: a.y, w: aw, h: ah, cx: a.x+aw/2, cy: a.y+ah/2, obj: a, kind: 'annotation' }; }
    const inf = infrastructure.find(o => o.id === id);
    if (inf) { const r = 22; return { x: inf.x-r, y: inf.y-r, w: r*2, h: r*2, cx: inf.x, cy: inf.y, obj: inf, kind: 'infra' }; }
    return null;
  }

  // ─── Move helper ──────────────────────────────────────────────────────
  function moveObjectInDrawing(d, id, kind, origX, origY, origX2, origY2, dx, dy) {
    if (kind === 'fixture') { const f = d.fixtures.find(f => f.id === id); if (f) { f.x = origX+dx; f.y = origY+dy; } }
    else if (kind === 'pipe') { const o = d.pipes.find(o => o.id === id); if (o) { o.x1 = origX+dx; o.y1 = origY+dy; o.x2 = origX2+dx; o.y2 = origY2+dy; } }
    else if (kind === 'line') { const o = d.lines.find(o => o.id === id); if (o) { o.x1 = origX+dx; o.y1 = origY+dy; o.x2 = origX2+dx; o.y2 = origY2+dy; } }
    else if (kind === 'rect') { const o = d.rectangles.find(o => o.id === id); if (o) { o.x = origX+dx; o.y = origY+dy; } }
    else if (kind === 'text') { const o = d.texts.find(o => o.id === id); if (o) { o.x = origX+dx; o.y = origY+dy; } }
    else if (kind === 'image') { const o = (d.images||[]).find(o => o.id === id); if (o) { o.x = origX+dx; o.y = origY+dy; } }
    else if (kind === 'annotation') { const o = (d.annotations||[]).find(o => o.id === id); if (o) { o.x = origX+dx; o.y = origY+dy; } }
    else if (kind === 'infra')      { const o = (d.infrastructure||[]).find(o => o.id === id); if (o) { o.x = origX+dx; o.y = origY+dy; } }
  }

  // ─── Handle drag start ────────────────────────────────────────────────
  function startHandleDrag(e, point, kind, obj, cx, cy) {
    if (!canEdit) return;
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    setDragging({
      id: obj.id, kind, handlePoint: point,
      startX: w.x, startY: w.y,
      origX: obj.x ?? obj.x1, origY: obj.y ?? obj.y1,
      origX2: obj.x2 ?? (obj.x != null ? obj.x + (obj.w||0) : null),
      origY2: obj.y2 ?? (obj.y != null ? obj.y + (obj.h||0) : null),
      origW: obj.w, origH: obj.h,
      origRotation: obj.rotation || 0,
      origScale: obj.scale || 1,
      centerX: cx ?? obj.x, centerY: cy ?? obj.y,
    });
  }

  function applyHandleDrag(dg, snapped, world, shiftKey = false) {
    const hp = dg.handlePoint;
    const { origX, origY, origX2, origY2 } = dg;

    // Rotation
    if (hp === 'rotate') {
      let angle = Math.atan2(world.y - dg.centerY, world.x - dg.centerX) * 180 / Math.PI + 90;
      if (shiftKey) angle = Math.round(angle / 45) * 45; // snap to 45° increments
      softUpdateDrawing(d => {
        const setR = arr => { const o = arr.find(o => o.id === dg.id); if (o) o.rotation = angle; };
        if (dg.kind === 'fixture') setR(d.fixtures);
        else if (dg.kind === 'rect') setR(d.rectangles);
        else if (dg.kind === 'text') setR(d.texts);
        else if (dg.kind === 'image') setR(d.images);
        else if (dg.kind === 'annotation') setR(d.annotations || []);
      });
      return;
    }

    // Fixture/text scale
    if (hp === 'scale') {
      const dist = distance(world.x, world.y, dg.centerX, dg.centerY);
      const origDist = distance(dg.startX, dg.startY, dg.centerX, dg.centerY);
      const factor = origDist > 1 ? dist / origDist : 1;
      const newScale = Math.max(0.05, dg.origScale * factor);
      softUpdateDrawing(d => {
        const scope = scaleMode?.scope || 'one';
        const anchor = d.fixtures.find(f => f.id === dg.id);
        if (anchor) {
          d.fixtures.forEach(f => {
            if (scope === 'all') f.scale = newScale;
            else if (scope === 'type' && f.fixtureTypeId === anchor.fixtureTypeId) f.scale = newScale;
            else if (f.id === dg.id) f.scale = newScale;
          });
        }
        const t = d.texts.find(t => t.id === dg.id);
        if (t) t.fontSize = Math.max(2, Math.round((dg.origScale || 14) * factor));
      });
      return;
    }

    // Pipe / line endpoint handles
    if (dg.kind === 'pipe' || dg.kind === 'line') {
      const arr = dg.kind === 'pipe' ? 'pipes' : 'lines';
      softUpdateDrawing(d => {
        const obj = d[arr].find(o => o.id === dg.id);
        if (obj) {
          if (hp === 'p1') { obj.x1 = snapped.x; obj.y1 = snapped.y; }
          else { obj.x2 = snapped.x; obj.y2 = snapped.y; }
        }
      });
      return;
    }

    // Rect corner/edge handles
    if (dg.kind === 'rect') {
      softUpdateDrawing(d => {
        const r = d.rectangles.find(r => r.id === dg.id);
        if (!r) return;
        const sx = snapped.x, sy = snapped.y;
        if (hp === 'tl') { r.w = Math.abs(origX2-sx); r.h = Math.abs(origY2-sy); r.x = Math.min(sx,origX2); r.y = Math.min(sy,origY2); }
        else if (hp === 'tr') { r.w = Math.abs(sx-origX); r.h = Math.abs(origY2-sy); r.x = Math.min(sx,origX); r.y = Math.min(sy,origY2); }
        else if (hp === 'br') { r.w = Math.abs(sx-origX); r.h = Math.abs(sy-origY); r.x = Math.min(sx,origX); r.y = Math.min(sy,origY); }
        else if (hp === 'bl') { r.w = Math.abs(origX2-sx); r.h = Math.abs(sy-origY); r.x = Math.min(sx,origX2); r.y = Math.min(sy,origY); }
        else if (hp === 'top') { r.h = Math.abs(origY2-sy); r.y = Math.min(sy,origY2); }
        else if (hp === 'bottom') { r.h = Math.abs(sy-origY); r.y = Math.min(sy,origY); }
        else if (hp === 'left') { r.w = Math.abs(origX2-sx); r.x = Math.min(sx,origX2); }
        else if (hp === 'right') { r.w = Math.abs(sx-origX); r.x = Math.min(sx,origX); }
      });
      return;
    }

    // Image corner handles
    if (dg.kind === 'image') {
      softUpdateDrawing(d => {
        const img = (d.images||[]).find(i => i.id === dg.id);
        if (!img) return;
        const sx = snapped.x, sy = snapped.y;
        if (hp === 'tl') { img.w = Math.abs(origX2-sx); img.h = Math.abs(origY2-sy); img.x = Math.min(sx,origX2); img.y = Math.min(sy,origY2); }
        else if (hp === 'tr') { img.w = Math.abs(sx-origX); img.h = Math.abs(origY2-sy); img.x = Math.min(sx,origX); img.y = Math.min(sy,origY2); }
        else if (hp === 'br') { img.w = Math.abs(sx-origX); img.h = Math.abs(sy-origY); img.x = Math.min(sx,origX); img.y = Math.min(sy,origY); }
        else if (hp === 'bl') { img.w = Math.abs(origX2-sx); img.h = Math.abs(sy-origY); img.x = Math.min(sx,origX2); img.y = Math.min(sy,origY); }
      });
    }

    // Annotation resize (br corner)
    if (dg.kind === 'annotation') {
      softUpdateDrawing(d => {
        const a = (d.annotations||[]).find(a => a.id === dg.id);
        if (a && hp === 'br') { a.w = Math.max(40, snapped.x - origX); a.h = Math.max(20, snapped.y - origY); }
      });
    }
  }

  // ─── Mouse handlers ───────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    setContextMenu(null);
    shiftRef.current = e.shiftKey; bypassRef.current = e.ctrlKey || e.metaKey;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;

    const world = screenToWorld(e.clientX, e.clientY);
    const snapped = getSnapped(e.clientX, e.clientY);
    mouseDownScreen.current = { x: e.clientX, y: e.clientY };

    // Focus mode
    if (focusModeId) {
      const fx = fixtures.find(f => f.id === focusModeId);
      if (fx) {
        const angle = Math.atan2(world.y - fx.y, world.x - fx.x) * 180 / Math.PI + 90;
        commitToDrawing(d => { const f = d.fixtures.find(f => f.id === focusModeId); if (f) f.rotation = angle; });
      }
      setFocusModeId(null); setFocusCursor(null);
      return;
    }

    // Pending fixture — placement requires edit rights
    if (pendingFixture) {
      if (!canEdit) { onPendingFixturePlaced(); return; }
      const nearPipe = (snapRef.current.enabled && snapRef.current.pipe) ? findNearestPipe(world.x, world.y) : null;
      let fx = snapped.x, fy = snapped.y, position = '', pipeId = null, rotation = 0;
      if (nearPipe) {
        // Sit exactly ON the pipe line — do NOT grid-snap afterwards (that pulls it off the line).
        const pp = projectPointOntoLine(world.x, world.y, nearPipe.x1, nearPipe.y1, nearPipe.x2, nearPipe.y2);
        fx = pp.x; fy = pp.y; position = nearPipe.name; pipeId = nearPipe.id;
        rotation = pipeAngle(nearPipe) * 180 / Math.PI;
      }
      const usedUnits = fixtures.filter(f => pipeId ? f.pipeId === pipeId : true).map(f => Number(f.unit)).filter(Boolean);
      const nextUnit = usedUnits.length ? Math.max(...usedUnits) + 1 : 1;
      const newFixture = {
        id: generateId(), kind: 'fixture',
        fixtureTypeId: pendingFixture.id, type: pendingFixture.name,
        x: fx, y: fy, pipeId, position, unit: String(nextUnit),
        channel: '', dmxAddress: '', dmxMode: pendingFixture.defaultMode || '',
        dmxChannelCount: pendingFixture.defaultChannelCount || 1,
        colour: pendingFixture.defaultFields?.colour || 'Open',
        colourHex: pendingFixture.defaultColourHex || null,
        gobo: '', purpose: '', rotation, scale: 1,
        layerId: activeLayerId || 'layer-lighting',
      };
      commitToDrawing(d => d.fixtures.push(newFixture), `Add ${newFixture.type || 'fixture'}`);
      onPendingFixturePlaced();
      onSelect({ kind: 'fixture', ...newFixture });
      return;
    }

    if (activeTool === 'select') {
      const hit = hitTestAll(world.x, world.y);
      // Ctrl/Cmd-click adds to (or toggles within) the current selection.
      if (hit && (e.ctrlKey || e.metaKey)) {
        const cur = new Set([...(selectedIds || []), ...(selectedId ? [selectedId] : [])]);
        if (cur.has(hit.id)) cur.delete(hit.id); else cur.add(hit.id);
        onMultiSelect([...cur]);
        return; // no drag when modifying selection
      }
      if (hit) {
        const gm = hit.groupId ? getGroupMembersForDrag(hit.groupId, hit.id) : null;
        if (hit.groupId) onMultiSelect(getGroupMemberIds(hit.groupId));
        else onSelect(hit);
        // View-only (no edit rights): allow selection, but never start a drag.
        if (!canEdit) return;
        // Collect fixtures/infra snapped to this pipe/truss so they move with it
        let pipeFollowers = null;
        if (hit.kind === 'pipe') {
          pipeFollowers = [
            ...fixtures.filter(f => f.pipeId === hit.id || f.onStructureId === hit.id)
              .map(f => ({ id: f.id, kind: 'fixture', origX: f.x, origY: f.y })),
            ...(drawing?.infrastructure || []).filter(i => i.onStructureId === hit.id)
              .map(i => ({ id: i.id, kind: 'infra', origX: i.x, origY: i.y })),
          ];
        }
        setDragging({
          id: hit.id, kind: hit.kind, handlePoint: null,
          startX: world.x, startY: world.y,
          origX: hit.x ?? hit.x1, origY: hit.y ?? hit.y1,
          origX2: hit.x2 ?? (hit.x != null ? hit.x + (hit.w||0) : null),
          origY2: hit.y2 ?? (hit.y != null ? hit.y + (hit.h||0) : null),
          origW: hit.w, origH: hit.h,
          groupMembers: gm,
          pipeFollowers,
        });
      } else {
        // Also check direct infra hit (already covered by hitTestAll now)
        selBoxStart.current = { x: world.x, y: world.y };
        setSelBox(null);
      }
      return;
    }

    // Calibrate tool: two-point scale measurement
    if (activeTool === 'calibrate') {
      if (!calibState) {
        setCalibState({ p1: world });
      } else if (calibState.p1 && !calibState.p2) {
        setCalibState({ p1: calibState.p1, p2: world, showDialog: true });
      }
      return;
    }

    if (activeTool === 'dimension') {
      // Transient measurement: 1st click = start, 2nd click = finish (stays on
      // screen), next click resets and starts a fresh measurement.
      const cur = measureRef.current;
      if (!cur || cur.done) {
        setMeasure({ x1: snapped.x, y1: snapped.y });
      } else {
        setMeasure({ x1: cur.x1, y1: cur.y1, x2: snapped.x, y2: snapped.y, done: true });
      }
      return;
    }

    if (activeTool === 'line' || activeTool === 'rect') {
      const cur = drawingRef.current;
      if (!cur) {
        resetDyn();
        setDrawingState({ kind: activeTool, x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y });
      } else {
        commitDyn(snapped.x, snapped.y);   // second click finishes (honours typed dims)
      }
      return;
    }

    // Circle: click centre, click again for radius.
    if (activeTool === 'circle') {
      const cur = drawingRef.current;
      if (!cur) {
        resetDyn();
        setDrawingState({ kind: 'circle', x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y });
      } else {
        commitDyn(snapped.x, snapped.y);   // honours a typed radius
      }
      return;
    }

    // Arc: click centre, click start (radius + start angle), click end angle.
    if (activeTool === 'arc') {
      const cur = arcRef.current;
      if (!cur) {
        setArcDraw({ stage: 1, cx: snapped.x, cy: snapped.y });
      } else if (cur.stage === 1) {
        const r = distance(cur.cx, cur.cy, snapped.x, snapped.y);
        const a0 = Math.atan2(snapped.y - cur.cy, snapped.x - cur.cx);
        setArcDraw({ stage: 2, cx: cur.cx, cy: cur.cy, r, a0 });
      } else {
        const a1 = Math.atan2(snapped.y - cur.cy, snapped.x - cur.cx);
        commitToDrawing(d => { if (!d.arcs) d.arcs = []; d.arcs.push({ id: generateId(), kind: 'arc', cx: cur.cx, cy: cur.cy, r: cur.r, a0: cur.a0, a1, layerId: activeLayerId || 'layer-arch' }); }, 'Add arc');
        setArcDraw(null);
      }
      return;
    }

    // Polyline: click to add vertices; double-click / Enter / Esc finishes.
    if (activeTool === 'polyline') {
      const cur = polyRef.current;
      if (!cur) setPolyDraw({ points: [{ x: snapped.x, y: snapped.y }], closed: false });
      else setPolyDraw({ ...cur, points: [...cur.points, { x: snapped.x, y: snapped.y }] });
      return;
    }

    if (activeTool === 'pipe') {
      const cur = drawingRef.current;
      if (!cur) {
        // Snap start to nearest pipe endpoint when pipe snap is on
        const epSnap = snapRef.current.pipe ? findNearestPipeEndpoint(snapped.x, snapped.y) : null;
        const sx = epSnap ? epSnap.x : snapped.x;
        const sy = epSnap ? epSnap.y : snapped.y;
        setPipePlaceAngle(null);
        resetDyn();
        setDrawingState({ kind: 'pipe', x1: sx, y1: sy, x2: sx, y2: sy });
      } else {
        // Snap end to nearest pipe endpoint when pipe snap is on
        const epSnap = snapRef.current.pipe ? findNearestPipeEndpoint(snapped.x, snapped.y) : null;
        let ex = epSnap ? epSnap.x : snapped.x;
        let ey = epSnap ? epSnap.y : snapped.y;
        if (pipePlaceAngle !== null) {
          const c = constrainToAngle(cur.x1, cur.y1, ex, ey, pipePlaceAngle);
          ex = c.x; ey = c.y;
        }
        setPipePlaceAngle(null);
        commitDyn(ex, ey);   // commits + chains; honours a typed length/angle
      }
      return;
    }

    if (activeTool === 'text') {
      const nt = { id: generateId(), kind: 'text', x: snapped.x, y: snapped.y, label: 'Label', fontSize: 14, layerId: activeLayerId || 'layer-arch' };
      commitToDrawing(d => d.texts.push(nt), 'Add text');
      onSelect({ kind: 'text', ...nt });
      if (onToolDone) onToolDone();
      setEditingText({ ...nt });
      return;
    }

    if (activeTool === 'annotate') {
      const na = { id: generateId(), kind: 'annotation', x: snapped.x, y: snapped.y, label: 'Note', w: 120, h: 50, layerId: 'layer-arch' };
      commitToDrawing(d => { if (!d.annotations) d.annotations = []; d.annotations.push(na); }, 'Add annotation');
      onSelect({ kind: 'annotation', ...na });
      if (onToolDone) onToolDone();
      setEditingText({ ...na, isAnnotation: true });
    }

    // ── Truss tool (same as pipe but type='truss') ──────────────────────
    if (activeTool === 'truss') {
      const cur = drawingRef.current;
      if (!cur) {
        const epSnap = snapRef.current.pipe ? findNearestPipeEndpoint(snapped.x, snapped.y) : null;
        const sx = epSnap ? epSnap.x : snapped.x;
        const sy = epSnap ? epSnap.y : snapped.y;
        setPipePlaceAngle(null);
        setDrawingState({ kind: 'pipe', x1: sx, y1: sy, x2: sx, y2: sy });
      } else {
        const epSnap = snapRef.current.pipe ? findNearestPipeEndpoint(snapped.x, snapped.y) : null;
        let ex = epSnap ? epSnap.x : snapped.x;
        let ey = epSnap ? epSnap.y : snapped.y;
        if (pipePlaceAngle !== null) {
          const c = constrainToAngle(cur.x1, cur.y1, ex, ey, pipePlaceAngle);
          ex = c.x; ey = c.y;
        }
        if (distance(cur.x1, cur.y1, ex, ey) > 2) {
          const nt = { id: generateId(), kind: 'pipe', type: 'truss', x1: cur.x1, y1: cur.y1, x2: ex, y2: ey, name: 'Truss', height: '5.5', layerId: activeLayerId || 'layer-lighting' };
          commitToDrawing(d => d.pipes.push(nt), 'Add truss');
          onSelect({ kind: 'pipe', ...nt });
          // Chain: start next section from this endpoint (Escape to stop)
          setPipePlaceAngle(null);
          setDrawingState({ kind: 'pipe', x1: ex, y1: ey, x2: ex, y2: ey });
        } else {
          setDrawingState(null);
          setPipePlaceAngle(null);
        }
      }
      return;
    }

    // ── Infrastructure placement tools ─────────────────────────────────
    if (activeTool?.startsWith('infra-')) {
      const infraType = activeTool.replace('infra-', '');
      const struct = findNearestStructure(snapped.x, snapped.y, pipes, 30 / zoom);
      const defaults = infraType === 'distro'
        ? { circuits: [{ id: generateId(), label: 'Cct 1', rating: '16A' }] }
        : infraType === 'node'   ? { universeStart: 1, universeCount: 4 }
        : infraType === 'switch' ? { ports: 8 }
        : {};
      const ni = {
        id: generateId(), type: infraType, kind: 'infra',
        x: snapped.x, y: snapped.y,
        label: infraType === 'distro' ? 'PDU 1' : infraType === 'node' ? 'Node 1' : infraType === 'switch' ? 'Switch 1' : 'NP 1',
        onStructureId: struct?.id || null,
        layerId: activeLayerId || 'layer-lighting',
        ...defaults,
      };
      commitToDrawing(d => { if (!d.infrastructure) d.infrastructure = []; d.infrastructure.push(ni); }, `Add ${ni.label}`);
      onSelect({ kind: 'infra', ...ni });
      if (onToolDone) onToolDone();
      return;
    }

    // ── Cable drawing tools ────────────────────────────────────────────
    if (activeTool?.startsWith('cable-')) {
      const cableType = activeTool.replace('cable-', '');
      // Check hit on fixture or infra
      const hit = hitTestAll(world.x, world.y);
      const hitInfra = infrastructure.find(i => distance(world.x, world.y, i.x, i.y) < 30 / zoom);
      const fromItem = hitInfra || (hit?.kind === 'fixture' ? hit : null);

      if (!cableFrom) {
        // First click — pick source
        if (fromItem) {
          setCableFrom({ id: fromItem.id, type: hitInfra ? 'infra' : 'fixture', x: fromItem.x, y: fromItem.y });
        }
      } else {
        // Second click — pick destination, create cable
        const toItem = hitInfra || (hit?.kind === 'fixture' ? hit : null);
        if (toItem && toItem.id !== cableFrom.id) {
          const defaultSubtype = cableType === 'power' ? 'powercon' : cableType === 'dmx' ? 'dmx5' : 'ethercon';
          const nc = {
            id: generateId(), kind: 'cable',
            cableType, subtype: defaultSubtype,
            fromId: cableFrom.id, fromType: cableFrom.type,
            toId: toItem.id, toType: hitInfra ? 'infra' : 'fixture',
            label: '',
          };
          commitToDrawing(d => { if (!d.cables) d.cables = []; d.cables.push(nc); }, `Add ${cableType} cable`);
          onSelect({ kind: 'cable', ...nc });
        }
        setCableFrom(null);
        setCableGhost(null);
      }
      return;
    }
  }, [activeTool, pendingFixture, fixtures, pipes, lines, rectangles, texts, images, annotations, infrastructure, cables, zoom, pan, showRulers, gridSize, focusModeId, layers, cableFrom, selectedId, selectedIds, canEdit]);

  const onMouseMove = useCallback((e) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      onPanChange(p => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    // Cable waypoint drag
    if (wpDragRef.current) {
      const { cableId, wpIdx, baseWaypoints } = wpDragRef.current;
      const world = screenToWorld(e.clientX, e.clientY);
      const newWps = baseWaypoints.map((wp, i) => i === wpIdx ? { x: world.x, y: world.y } : wp);
      softUpdateDrawing(d => {
        const c = (d.cables || []).find(c => c.id === cableId);
        if (c) c.userWaypoints = newWps;
      });
      return;
    }

    shiftRef.current = e.shiftKey; bypassRef.current = e.ctrlKey || e.metaKey;
    const world = screenToWorld(e.clientX, e.clientY);
    // Anchor for ortho/perpendicular snaps (the point we're drawing from).
    const ds0 = drawingRef.current;
    const poly0 = polyRef.current;
    const anchor = ds0 ? { x: ds0.x1, y: ds0.y1 }
      : (measureRef.current && !measureRef.current.done) ? { x: measureRef.current.x1, y: measureRef.current.y1 }
      : (poly0?.points?.length) ? poly0.points[poly0.points.length - 1]
      : null;
    const snapped = getSnapped(e.clientX, e.clientY, anchor);
    setCursorPos(snapped);
    setRawCursorPos(world);
    // Unified snap glyph (object snap / ortho).
    setSnapPoint(snapped.snapType ? { x: snapped.x, y: snapped.y, type: snapped.snapType } : null);

    // Update cable ghost line while drawing
    if (cableFrom) { setCableGhost({ x: world.x, y: world.y }); }

    if (focusModeId) { setFocusCursor(world); return; }

    if (selBoxStart.current && !dragging) {
      const mdx = e.clientX - mouseDownScreen.current.x;
      const mdy = e.clientY - mouseDownScreen.current.y;
      if (Math.sqrt(mdx*mdx + mdy*mdy) > BOX_THRESHOLD)
        setSelBox({ x1: selBoxStart.current.x, y1: selBoxStart.current.y, x2: world.x, y2: world.y });
    }

    if (drawingState) {
      let ex = snapped.x, ey = snapped.y;
      // Angle constraint for R-key rotation (pipe/truss)
      if ((activeTool === 'pipe' || activeTool === 'truss') && pipePlaceAngle !== null) {
        const c = constrainToAngle(drawingState.x1, drawingState.y1, ex, ey, pipePlaceAngle);
        ex = c.x; ey = c.y;
      }
      // Apply any typed dimensions (length/angle/width/height/radius) over the cursor direction.
      const end = applyDyn(drawingState, ex, ey);
      setDrawingState(d => ({ ...d, x2: end.x2, y2: end.y2 }));
    }

    if (dragging?.handlePoint) {
      applyHandleDrag(dragging, snapped, world, e.shiftKey);
      return;
    }

    if (dragging) {
      const dx = world.x - dragging.startX;
      const dy = world.y - dragging.startY;

      if (dragTargetLayerRef) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        dragTargetLayerRef.current = el?.closest('[data-layer-id]')?.dataset?.layerId || null;
      }

      if (dragging.kind === 'fixture' && !dragging.groupMembers?.length) {
        if (snapRef.current.enabled && snapRef.current.pipe) {
          const nearPipe = findNearestPipe(world.x, world.y);
          if (nearPipe) {
            // Snap exactly onto the pipe line (no grid snap, which would offset it).
            const pp = projectPointOntoLine(world.x, world.y, nearPipe.x1, nearPipe.y1, nearPipe.x2, nearPipe.y2);
            softUpdateDrawing(d => { const f = d.fixtures.find(f => f.id === dragging.id); if (f) { f.x = pp.x; f.y = pp.y; f.pipeId = nearPipe.id; f.position = nearPipe.name; f.rotation = pipeAngle(nearPipe) * 180 / Math.PI; } });
            setHoveredPipe(nearPipe.id);
            return;
          }
        }
        setHoveredPipe(null);
      }

      // Smart alignment guides: snap a single dragged object's centre to other
      // objects' centres (x and y independently) and draw guide lines.
      let adx = dx, ady = dy, gx = null, gy = null;
      if (snapRef.current.enabled && !shiftRef.current && !bypassRef.current && !dragging.groupMembers?.length) {
        const cx0 = (dragging.kind === 'pipe' || dragging.kind === 'line')
          ? (dragging.origX + dragging.origX2) / 2
          : dragging.kind === 'rect' ? dragging.origX + (dragging.origW || 0) / 2 : dragging.origX;
        const cy0 = (dragging.kind === 'pipe' || dragging.kind === 'line')
          ? (dragging.origY + dragging.origY2) / 2
          : dragging.kind === 'rect' ? dragging.origY + (dragging.origH || 0) / 2 : dragging.origY;
        const cx = cx0 + dx, cy = cy0 + dy, thr = OSNAP_RADIUS / zoom;
        let bx = null, bxd = thr, by = null, byd = thr;
        const consider = (px, py) => {
          const ax = Math.abs(px - cx); if (ax < bxd) { bxd = ax; bx = px; }
          const ay = Math.abs(py - cy); if (ay < byd) { byd = ay; by = py; }
        };
        fixtures.forEach(f => { if (f.id !== dragging.id) consider(f.x, f.y); });
        pipes.forEach(p => { if (p.id !== dragging.id) consider((p.x1+p.x2)/2, (p.y1+p.y2)/2); });
        lines.forEach(l => { if (l.id !== dragging.id) consider((l.x1+l.x2)/2, (l.y1+l.y2)/2); });
        rectangles.forEach(r => { if (r.id !== dragging.id) consider(r.x+r.w/2, r.y+r.h/2); });
        circles.forEach(c => { if (c.id !== dragging.id) consider(c.cx, c.cy); });
        if (bx !== null) { adx += bx - cx; gx = bx; }
        if (by !== null) { ady += by - cy; gy = by; }
      }
      setAlignGuides((gx !== null || gy !== null) ? { vx: gx, hy: gy } : null);

      softUpdateDrawing(d => {
        moveObjectInDrawing(d, dragging.id, dragging.kind, dragging.origX, dragging.origY, dragging.origX2, dragging.origY2, adx, ady);
        (dragging.groupMembers || []).forEach(m => moveObjectInDrawing(d, m.id, m.kind, m.origX, m.origY, m.origX2, m.origY2, dx, dy));
        // When a fixture is freely moved (not snapping to a pipe this frame), clear pipeId
        // so cables re-route from the floor position rather than staying tacked to the old truss
        if (dragging.kind === 'fixture' && !dragging.groupMembers?.length) {
          const f = d.fixtures.find(f => f.id === dragging.id);
          if (f) { f.pipeId = null; f.position = ''; }
        }
        // Move fixtures and infra items attached to a dragged pipe/truss
        (dragging.pipeFollowers || []).forEach(f => {
          if (f.kind === 'fixture') {
            const fix = d.fixtures.find(fx => fx.id === f.id);
            if (fix) { fix.x = f.origX + adx; fix.y = f.origY + ady; }
          } else if (f.kind === 'infra') {
            const inf = (d.infrastructure || []).find(i => i.id === f.id);
            if (inf) { inf.x = f.origX + adx; inf.y = f.origY + ady; }
          }
        });
      });
    }

    if (pendingFixture && snapRef.current.enabled && snapRef.current.pipe) setHoveredPipe(findNearestPipe(world.x, world.y)?.id || null);
    else if (!dragging) setHoveredPipe(null);
  }, [drawingState, dragging, pendingFixture, pipes, images, zoom, pan, showRulers, gridSize, focusModeId, layers]);

  const onMouseUp = useCallback((e) => {
    isPanning.current = false;
    setAlignGuides(null);

    // Commit cable waypoint drag
    if (wpDragRef.current) {
      commit(p => p);
      setWpDrag(null);
      return;
    }

    if (selBoxStart.current) {
      if (selBox) onMultiSelect(getItemsInBox(selBox.x1, selBox.y1, selBox.x2, selBox.y2));
      else onSelect(null);
      selBoxStart.current = null;
      setSelBox(null);
      return;
    }

    if (dragging && dragTargetLayerRef?.current && !dragging.handlePoint) {
      const targetLayerId = dragTargetLayerRef.current;
      commitToDrawing(d => {
        const setL = arr => {
          const obj = arr.find(o => o.id === dragging.id); if (obj) obj.layerId = targetLayerId;
          (dragging.groupMembers || []).forEach(m => { const mo = arr.find(o => o.id === m.id); if (mo) mo.layerId = targetLayerId; });
        };
        setL(d.fixtures); setL(d.pipes); setL(d.lines); setL(d.rectangles); setL(d.texts); setL(d.images||[]); setL(d.annotations||[]);
      }, 'Move to layer');
      dragTargetLayerRef.current = null;
    }

    if (dragging) {
      // If we were dragging a fixture, explicitly commit pipeId based on final drop position
      if (dragging.kind === 'fixture' && !dragging.groupMembers?.length) {
        const upWorld = screenToWorld(e.clientX, e.clientY);
        const nearPipe = snapRef.current.pipe ? findNearestPipe(upWorld.x, upWorld.y) : null;
        if (!nearPipe) {
          // Dropped away from any pipe — commit with pipeId cleared
          commitToDrawing(d => {
            const f = d.fixtures.find(f => f.id === dragging.id);
            if (f) { f.pipeId = null; f.position = ''; }
          }, 'Move fixture');
        } else {
          commit(p => p, 'Move fixture');
        }
      } else {
        commit(p => p, `Move ${dragging.kind || 'object'}`);
      }
      setDragging(null);
      setHoveredPipe(null);
      return;
    }

    // Line, rect, pipe and circle are all click-click tools now (so you can type
    // dimensions between clicks) — mouse-up never commits or clears them.
  }, [drawingState, dragging, selBox, fixtures, pipes, lines, rectangles, texts, images, annotations, zoom, pan, showRulers, gridSize, layers]);

  // Finish the current polyline and commit it (≥2 points).
  function finishPolyline(close) {
    const cur = polyRef.current;
    if (cur && cur.points.length >= 2) {
      // Drop a trailing duplicate vertex (from the double-click that finishes).
      const pts = cur.points.filter((p, i, a) => i === 0 || distance(p.x, p.y, a[i-1].x, a[i-1].y) > 0.5);
      if (pts.length >= 2) {
        commitToDrawing(d => {
          if (!d.polylines) d.polylines = [];
          d.polylines.push({ id: generateId(), kind: 'polyline', points: pts, closed: !!close, layerId: activeLayerId || 'layer-arch' });
        }, 'Add polyline');
      }
    }
    setPolyDraw(null);
  }

  // Double-click: finish polyline, else edit text / annotation
  const onDblClick = useCallback((e) => {
    if (activeTool === 'polyline' && polyRef.current) { finishPolyline(false); return; }
    const world = screenToWorld(e.clientX, e.clientY);
    for (const t of [...texts, ...annotations]) {
      const fs = t.fontSize || 14;
      const approxW = (t.label || '').length * fs * 0.6 + 20;
      if (world.x >= t.x && world.x <= t.x + approxW && world.y >= t.y - fs - 4 && world.y <= t.y + (t.h || 4)) {
        setEditingText({ ...t, isAnnotation: t.kind === 'annotation' });
        return;
      }
    }
  }, [texts, annotations, zoom, pan, showRulers]);

  // Right-click: context menu for ALL objects; also rotates pipe/truss during placement
  const onContextMenu = useCallback((e) => {
    e.preventDefault();
    // The object context menu is entirely editing actions — suppress it without edit rights.
    if (!canEdit) return;
    // If actively drawing a pipe/truss, right-click rotates by 90° instead of context menu
    if (drawingRef.current && (activeTool === 'pipe' || activeTool === 'truss')) {
      setPipePlaceAngle(a => a === null ? 0 : (a + 90) % 360);
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = hitTestAll(world.x, world.y, true); // includeLocked=true for right-click
    if (hit) setContextMenu({ sx: e.clientX, sy: e.clientY, hit });
  }, [activeTool, fixtures, pipes, lines, rectangles, texts, images, annotations, zoom, pan, showRulers, layers, canEdit]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = svgRef.current.getBoundingClientRect();
    const ox = showRulers ? RULER_SIZE : 0, oy = showRulers ? RULER_SIZE : 0;
    const mx = e.clientX - rect.left - ox, my = e.clientY - rect.top - oy;
    onZoomChange(z => {
      const nz = Math.max(0.02, Math.min(20, z * factor));
      onPanChange(p => ({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }));
      return nz;
    });
  }, [showRulers]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  useEffect(() => {
    const handler = (e) => {
      const inInput = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
      // Dynamic numeric input takes priority while a shape is being drawn.
      if (!inInput && drawingRef.current && dynFieldsFor(drawingRef.current.kind).length) {
        if (handleDynKey(e)) { e.preventDefault(); return; }
      }
      if (e.key === 'Enter' && polyRef.current && document.activeElement.tagName !== 'INPUT') {
        finishPolyline(false); return;
      }
      if (e.key === 'Escape') {
        setDrawingState(null); setFocusModeId(null); setFocusCursor(null);
        setCalibState(null); setCableFrom(null); setCableGhost(null);
        setPipePlaceAngle(null); setScaleMode(null); setMeasure(null);
        setPolyDraw(null); setArcDraw(null);
        onSelect(null); onMultiSelect([]);
        onToolChange?.('select');
      }
      // All keyboard editing (delete, copy/paste, duplicate, rotate) requires edit rights.
      if (!canEditRef.current) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT') deleteSelected();
      // R key: rotate pipe/truss placement by 90°
      if ((e.key === 'r' || e.key === 'R') && drawingRef.current && document.activeElement.tagName !== 'INPUT') {
        setPipePlaceAngle(a => a === null ? 0 : (a + 90) % 360);
      }
      // Ctrl+C: copy selection (fixtures, pipes, lines, rects, texts, annotations)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && document.activeElement.tagName !== 'INPUT') {
        const ids = selectedIds?.length ? selectedIds : selectedId ? [selectedId] : [];
        if (ids.length) {
          const idSet = new Set(ids);
          const copied = [
            ...fixtures.filter(f => idSet.has(f.id)).map(f => ({ ...f, _clipKind: 'fixture' })),
            ...pipes.filter(p => idSet.has(p.id)).map(p => ({ ...p, _clipKind: 'pipe' })),
            ...lines.filter(l => idSet.has(l.id)).map(l => ({ ...l, _clipKind: 'line' })),
            ...rectangles.filter(r => idSet.has(r.id)).map(r => ({ ...r, _clipKind: 'rect' })),
            ...texts.filter(t => idSet.has(t.id)).map(t => ({ ...t, _clipKind: 'text' })),
            ...annotations.filter(a => idSet.has(a.id)).map(a => ({ ...a, _clipKind: 'annotation' })),
          ];
          if (copied.length) { setClipboard(copied); pasteGeneration.current = 1; }
        }
      }
      // Ctrl+V: paste clipboard with staggered offset per consecutive paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement.tagName !== 'INPUT') {
        const cb = clipboardRef.current;
        if (cb?.length) {
          const off = 30 * pasteGeneration.current;
          pasteGeneration.current += 1;
          pasteObjects(cb, off, off);
        }
      }
      // Ctrl+D: duplicate selection in place (+30,+30)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        const ids = selectedIds?.length ? selectedIds : selectedId ? [selectedId] : [];
        if (ids.length) {
          const idSet = new Set(ids);
          const toDup = [
            ...fixtures.filter(f => idSet.has(f.id)).map(f => ({ ...f, _clipKind: 'fixture' })),
            ...pipes.filter(p => idSet.has(p.id)).map(p => ({ ...p, _clipKind: 'pipe' })),
            ...lines.filter(l => idSet.has(l.id)).map(l => ({ ...l, _clipKind: 'line' })),
            ...rectangles.filter(r => idSet.has(r.id)).map(r => ({ ...r, _clipKind: 'rect' })),
            ...texts.filter(t => idSet.has(t.id)).map(t => ({ ...t, _clipKind: 'text' })),
            ...annotations.filter(a => idSet.has(a.id)).map(a => ({ ...a, _clipKind: 'annotation' })),
          ];
          pasteObjects(toDup, 30, 30);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectedIds, drawing, activeLayerId, meta]);

  // ── Zoom to fit all content ──────────────────────────────────────────────
  function fitView() {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // Collect all bounding points from every object type
    const pts = [];
    const PAD = 80; // world-unit padding around content

    fixtures.forEach(f => { pts.push({ x: f.x - 30, y: f.y - 30 }, { x: f.x + 30, y: f.y + 30 }); });
    pipes.forEach(p => { pts.push({ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }); });
    lines.forEach(l => { pts.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }); });
    rectangles.forEach(r => { pts.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }); });
    texts.forEach(t => { pts.push({ x: t.x, y: t.y }); });
    annotations.forEach(a => { pts.push({ x: a.x, y: a.y }, { x: a.x + (a.w || 120), y: a.y + (a.h || 50) }); });
    images.forEach(i => { pts.push({ x: i.x, y: i.y }, { x: i.x + i.w, y: i.y + i.h }); });
    infrastructure.forEach(i => { pts.push({ x: i.x - 20, y: i.y - 20 }, { x: i.x + 20, y: i.y + 20 }); });
    if (pdfBackground) pts.push(
      { x: pdfBackground.x, y: pdfBackground.y },
      { x: pdfBackground.x + pdfBackground.w, y: pdfBackground.y + pdfBackground.h }
    );

    if (pts.length === 0) {
      // Empty drawing — reset to origin
      onZoomChange(1); onPanChange({ x: 100, y: 100 }); return;
    }

    const minX = Math.min(...pts.map(p => p.x)) - PAD;
    const minY = Math.min(...pts.map(p => p.y)) - PAD;
    const maxX = Math.max(...pts.map(p => p.x)) + PAD;
    const maxY = Math.max(...pts.map(p => p.y)) + PAD;
    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const rulerOffset = showRulers ? RULER_SIZE : 0;
    const vpW = svgEl.clientWidth  - rulerOffset;
    const vpH = svgEl.clientHeight - rulerOffset;

    const newZoom = Math.max(0.02, Math.min(10, Math.min(vpW / contentW, vpH / contentH)));
    // Pan so content centre lands at viewport centre
    const panX = rulerOffset + vpW / 2 - (minX + contentW / 2) * newZoom;
    const panY = rulerOffset + vpH / 2 - (minY + contentH / 2) * newZoom;

    onZoomChange(newZoom);
    onPanChange({ x: panX, y: panY });
  }

  // Expose fitView to parent via ref
  useEffect(() => { if (fitRef) fitRef.current = fitView; });

  // ─── Copy / Paste / Duplicate ─────────────────────────────────────────
  function copySelection(ids) {
    const idSet = new Set(ids);
    const copied = [
      ...fixtures.filter(f => idSet.has(f.id)).map(f => ({ ...f, _clipKind: 'fixture' })),
      ...pipes.filter(p => idSet.has(p.id)).map(p => ({ ...p, _clipKind: 'pipe' })),
      ...lines.filter(l => idSet.has(l.id)).map(l => ({ ...l, _clipKind: 'line' })),
      ...rectangles.filter(r => idSet.has(r.id)).map(r => ({ ...r, _clipKind: 'rect' })),
      ...texts.filter(t => idSet.has(t.id)).map(t => ({ ...t, _clipKind: 'text' })),
      ...annotations.filter(a => idSet.has(a.id)).map(a => ({ ...a, _clipKind: 'annotation' })),
    ];
    if (copied.length) {
      setClipboard(copied);
      pasteGeneration.current = 1;
    }
    return copied.length > 0;
  }

  function pasteObjects(items, dx, dy) {
    if (!items?.length) return;
    const newIds = [];
    commitToDrawing(d => {
      items.forEach(o => {
        const { _clipKind: kind, ...obj } = o;
        const newId = generateId();
        newIds.push(newId);
        if (kind === 'fixture') {
          d.fixtures.push({ ...obj, id: newId, x: obj.x + dx, y: obj.y + dy, pipeId: null, position: '' });
        } else if (kind === 'pipe') {
          d.pipes.push({ ...obj, id: newId, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy });
        } else if (kind === 'line') {
          d.lines.push({ ...obj, id: newId, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy });
        } else if (kind === 'rect') {
          d.rectangles.push({ ...obj, id: newId, x: obj.x + dx, y: obj.y + dy });
        } else if (kind === 'text') {
          d.texts.push({ ...obj, id: newId, x: obj.x + dx, y: obj.y + dy });
        } else if (kind === 'annotation') {
          if (!d.annotations) d.annotations = [];
          d.annotations.push({ ...obj, id: newId, x: obj.x + dx, y: obj.y + dy });
        }
      });
    });
    if (newIds.length === 1) onSelect({ id: newIds[0] });
    else if (newIds.length > 1) onMultiSelect(newIds);
  }

  // Distribute fixtures evenly along a pipe/truss
  function distributeOnPipe(pipeId) {
    const pipe = pipes.find(p => p.id === pipeId);
    if (!pipe) return;
    const onPipe = fixtures.filter(f => f.pipeId === pipeId);
    if (onPipe.length < 2) return;
    const dx = pipe.x2 - pipe.x1, dy = pipe.y2 - pipe.y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return;
    const ux = dx/len, uy = dy/len;
    // project each fixture onto pipe axis, sort by position
    const withT = onPipe.map(f => {
      const t = (f.x - pipe.x1)*ux + (f.y - pipe.y1)*uy;
      return { f, t };
    }).sort((a,b) => a.t - b.t);
    const tMin = withT[0].t, tMax = withT[withT.length-1].t;
    const step = (tMax - tMin) / (withT.length - 1);
    commitToDrawing(d => {
      withT.forEach(({ f: orig }, i) => {
        const fix = d.fixtures.find(fx => fx.id === orig.id);
        if (!fix) return;
        const t = tMin + i * step;
        const perp = (orig.x - pipe.x1)*(-uy) + (orig.y - pipe.y1)*ux; // preserve offset from pipe
        fix.x = pipe.x1 + t*ux + perp*(-uy);
        fix.y = pipe.y1 + t*uy + perp*ux;
      });
    });
  }

  // Distribute selected fixtures evenly between their own bounding-box endpoints
  function distributeSelected() {
    const ids = selectedIds?.length ? selectedIds : selectedId ? [selectedId] : [];
    const sel = fixtures.filter(f => ids.includes(f.id));
    if (sel.length < 3) return; // need at least 3 to have anything to distribute
    // Determine primary axis: wider spread = that axis
    const xs = sel.map(f => f.x), ys = sel.map(f => f.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const axis = spanX >= spanY ? 'x' : 'y';
    const sorted = [...sel].sort((a,b) => a[axis] - b[axis]);
    const vMin = sorted[0][axis], vMax = sorted[sorted.length-1][axis];
    const step = (vMax - vMin) / (sorted.length - 1);
    commitToDrawing(d => {
      sorted.forEach((orig, i) => {
        const fix = d.fixtures.find(fx => fx.id === orig.id);
        if (!fix) return;
        fix[axis] = vMin + i * step;
      });
    });
  }

  function deleteSelected() {
    const toDelete = new Set(selectedIds?.length ? selectedIds : selectedId ? [selectedId] : []);
    if (!toDelete.size) return;
    commitToDrawing(d => {
      d.fixtures = d.fixtures.filter(f => !toDelete.has(f.id));
      d.pipes = d.pipes.filter(p => !toDelete.has(p.id));
      d.lines = d.lines.filter(l => !toDelete.has(l.id));
      d.rectangles = d.rectangles.filter(r => !toDelete.has(r.id));
      d.texts = d.texts.filter(t => !toDelete.has(t.id));
      d.images = (d.images||[]).filter(i => !toDelete.has(i.id));
      d.annotations = (d.annotations||[]).filter(a => !toDelete.has(a.id));
      if (d.dimensions) d.dimensions = d.dimensions.filter(dim => !toDelete.has(dim.id));
      if (d.circles) d.circles = d.circles.filter(c => !toDelete.has(c.id));
      if (d.arcs) d.arcs = d.arcs.filter(a => !toDelete.has(a.id));
      if (d.polylines) d.polylines = d.polylines.filter(p => !toDelete.has(p.id));
      if (d.infrastructure) d.infrastructure = d.infrastructure.filter(i => !toDelete.has(i.id));
      // Also remove cables connected to deleted items
      if (d.cables) d.cables = d.cables.filter(c => !toDelete.has(c.fromId) && !toDelete.has(c.toId) && !toDelete.has(c.id));
    });
    onSelect(null); onMultiSelect([]);
  }

  function toggleLock(id, kind) {
    commitToDrawing(d => {
      const setL = arr => { const o = arr.find(o => o.id === id); if (o) o.locked = !o.locked; };
      if (kind === 'fixture') setL(d.fixtures);
      else if (kind === 'pipe') setL(d.pipes);
      else if (kind === 'line') setL(d.lines);
      else if (kind === 'rect') setL(d.rectangles);
      else if (kind === 'text') setL(d.texts);
      else if (kind === 'image') setL(d.images||[]);
      else if (kind === 'annotation') setL(d.annotations||[]);
    });
  }

  // ─── Rendering ────────────────────────────────────────────────────────
  function renderGrid() {
    if (!showGrid) return null;
    const svgEl = svgRef.current;
    const svgW = svgEl ? svgEl.clientWidth : 1600;
    const svgH = svgEl ? svgEl.clientHeight : 900;
    const ro = showRulers ? RULER_SIZE : 0;
    // World-space bounds of the visible area
    const startX = Math.floor((-pan.x - ro) / zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor((-pan.y - ro) / zoom / gridSize) * gridSize - gridSize;
    const endX   = startX + (svgW + ro) / zoom + gridSize * 2;
    const endY   = startY + (svgH + ro) / zoom + gridSize * 2;
    // Grid lines are exactly `gridSize` apart so the spacing matches the studio
    // grid setting (and a measurement between two lines == grid size). Only when
    // lines would be denser than minPx on screen do we thin them out — and then
    // only by a whole multiple of gridSize, so spacing stays a clean multiple.
    const minPx = 8;
    const screenPx = gridSize * zoom;
    const mult = screenPx >= minPx ? 1 : Math.ceil(minPx / screenPx);
    const step = gridSize * mult;
    const v = [], h = [];
    const sx = Math.floor(startX / step) * step;
    const sy = Math.floor(startY / step) * step;
    for (let x = sx; x <= endX; x += step) v.push(<line key={`v${x}`} x1={x} y1={startY} x2={x} y2={endY} />);
    for (let y = sy; y <= endY; y += step) h.push(<line key={`h${y}`} x1={startX} y1={y} x2={endX} y2={y} />);
    return <g stroke="#1a2a4a" strokeWidth={1/zoom}>{v}{h}</g>;
  }

  function renderRulers(svgW, svgH) {
    if (!showRulers) return null;
    const step = gridSize;
    const ticksX = [], ticksY = [];
    const units = meta?.units || 'mm';
    const tickLabel = (wu) => String(+toDisplayValue(wu, units).toFixed(units === 'mm' ? 0 : 2));
    const si = Math.floor(-pan.x / zoom / step), ei = si + Math.ceil(svgW / zoom / step) + 1;
    for (let i = si; i <= ei; i++) {
      const sx = i * step * zoom + pan.x, major = i % 5 === 0;
      ticksX.push(<g key={`rx${i}`}>
        <line x1={sx+RULER_SIZE} y1={major?8:13} x2={sx+RULER_SIZE} y2={RULER_SIZE} stroke="#4a6080" strokeWidth={1} />
        {major && <text x={sx+RULER_SIZE+2} y={10} fontSize={8} fill="#4a6080">{tickLabel(i*step)}</text>}
      </g>);
    }
    const sj = Math.floor(-pan.y / zoom / step), ej = sj + Math.ceil(svgH / zoom / step) + 1;
    for (let j = sj; j <= ej; j++) {
      const sy = j * step * zoom + pan.y, major = j % 5 === 0;
      ticksY.push(<g key={`ry${j}`}>
        <line x1={major?8:13} y1={sy+RULER_SIZE} x2={RULER_SIZE} y2={sy+RULER_SIZE} stroke="#4a6080" strokeWidth={1} />
        {major && <text x={4} y={sy+RULER_SIZE+4} fontSize={8} fill="#4a6080" transform={`rotate(-90 4 ${sy+RULER_SIZE})`}>{tickLabel(j*step)}</text>}
      </g>);
    }
    // Unit indicator in the ruler corner
    ticksX.push(<text key="unit-corner" x={3} y={13} fontSize={7} fill="#5a7a9a" fontWeight="700">{UNIT_LABELS[units] || units}</text>);
    return (
      <g>
        <rect x={0} y={0} width={svgW} height={RULER_SIZE} fill="#111827" />
        <rect x={0} y={0} width={RULER_SIZE} height={svgH} fill="#111827" />
        <rect x={0} y={0} width={RULER_SIZE} height={RULER_SIZE} fill="#0d1117" />
        {ticksX}{ticksY}
      </g>
    );
  }

  // ─── Selection controls (rotation handle + shape handles) ─────────────
  function renderSelectionControls() {
    if (!selectedId) return null;
    if (!canEdit) return null; // no resize / rotate / move handles without edit rights
    const bounds = getObjectBounds(selectedId);
    if (!bounds) return null;

    const hr = HANDLE_R / zoom;
    const { x, y, w, h, cx, cy, obj, kind } = bounds;
    const rhDist = 28 / zoom;
    // Rotation handle follows the object's rotation so it sits above the visual "top"
    const rot = obj.rotation || 0;
    const rotRad = rot * Math.PI / 180;
    const rhX = cx + Math.sin(rotRad) * rhDist;  // positive → handle tracks clockwise drag
    const rhY = cy - Math.cos(rotRad) * rhDist;

    const cornerHandle = (hx, hy, hp, cursor) => (
      <circle key={hp} cx={hx} cy={hy} r={hr}
        fill={hp === 'scale' ? '#7b61ff' : '#00aaff'} stroke="white" strokeWidth={1/zoom}
        style={{ cursor }}
        onMouseDown={e => startHandleDrag(e, hp, kind, obj, cx, cy)} />
    );

    const edgeHandle = (hx, hy, hp, cursor) => (
      <circle key={hp} cx={hx} cy={hy} r={hr*0.7}
        fill="#4a90d9" stroke="white" strokeWidth={1/zoom}
        style={{ cursor }}
        onMouseDown={e => startHandleDrag(e, hp, kind, obj, cx, cy)} />
    );

    return (
      <g>
        {/* Bounding box */}
        <rect x={x} y={y} width={w} height={h}
          fill="none" stroke="#00aaff" strokeWidth={1/zoom}
          strokeDasharray={`${4/zoom} ${2/zoom}`} style={{ pointerEvents: 'none' }} />

        {/* Rotation stem + handle — stem from center to handle (tracks rotation) */}
        <line x1={cx} y1={cy} x2={rhX} y2={rhY}
          stroke="#00aaff" strokeWidth={1/zoom} strokeDasharray={`${3/zoom} ${2/zoom}`} style={{ pointerEvents: 'none' }} />
        <circle cx={rhX} cy={rhY} r={hr}
          fill="#16213e" stroke="#00aaff" strokeWidth={1.5/zoom}
          style={{ cursor: 'crosshair' }}
          onMouseDown={e => startHandleDrag(e, 'rotate', kind, obj, cx, cy)} />
        {/* Rotation icon arc */}
        <text x={rhX} y={rhY+hr*0.4} textAnchor="middle" fontSize={hr*1.4}
          fill="#00aaff" style={{ pointerEvents: 'none', userSelect: 'none' }}>↻</text>

        {/* Pipe / line endpoint handles */}
        {(kind === 'pipe' || kind === 'line') && (() => {
          const seg = kind === 'pipe' ? pipes.find(p => p.id === selectedId) : lines.find(l => l.id === selectedId);
          if (!seg) return null;
          return (
            <>
              <circle cx={seg.x1} cy={seg.y1} r={hr} fill="#00aaff" stroke="white" strokeWidth={1/zoom}
                style={{ cursor: 'move' }} onMouseDown={e => startHandleDrag(e, 'p1', kind, obj)} />
              <circle cx={seg.x2} cy={seg.y2} r={hr} fill="#00aaff" stroke="white" strokeWidth={1/zoom}
                style={{ cursor: 'move' }} onMouseDown={e => startHandleDrag(e, 'p2', kind, obj)} />
            </>
          );
        })()}

        {/* Rect corner + edge handles */}
        {kind === 'rect' && (<>
          {cornerHandle(x,   y,   'tl', 'nw-resize')}
          {cornerHandle(x+w, y,   'tr', 'ne-resize')}
          {cornerHandle(x+w, y+h, 'br', 'se-resize')}
          {cornerHandle(x,   y+h, 'bl', 'sw-resize')}
          {edgeHandle(x+w/2, y,   'top',    'n-resize')}
          {edgeHandle(x+w/2, y+h, 'bottom', 's-resize')}
          {edgeHandle(x,     y+h/2, 'left', 'w-resize')}
          {edgeHandle(x+w,   y+h/2, 'right','e-resize')}
        </>)}

        {/* Image corner handles */}
        {kind === 'image' && (<>
          {cornerHandle(x,   y,   'tl', 'nw-resize')}
          {cornerHandle(x+w, y,   'tr', 'ne-resize')}
          {cornerHandle(x+w, y+h, 'br', 'se-resize')}
          {cornerHandle(x,   y+h, 'bl', 'sw-resize')}
        </>)}

        {/* Annotation resize handle */}
        {kind === 'annotation' && cornerHandle(x+w, y+h, 'br', 'se-resize')}

        {/* Fixture scale handle — only visible when scale mode active for this fixture */}
        {kind === 'fixture' && scaleMode?.id === obj.id && (<>
          <circle cx={x+w} cy={y+h} r={hr*1.3}
            fill="#7b61ff" stroke="white" strokeWidth={1/zoom}
            style={{ cursor: 'se-resize' }}
            onMouseDown={e => startHandleDrag(e, 'scale', 'fixture', obj, cx, cy)} />
          <text x={x+w+hr*2} y={y+h+hr} fontSize={8/zoom} fill="#7b61ff" style={{ userSelect: 'none', pointerEvents: 'none' }}>
            {scaleMode.scope === 'all' ? 'ALL' : scaleMode.scope === 'type' ? 'TYPE' : '1'}
          </text>
        </>)}

        {/* Text scale handle */}
        {kind === 'text' && (
          <circle cx={x+w} cy={y+h} r={hr}
            fill="#7b61ff" stroke="white" strokeWidth={1/zoom}
            style={{ cursor: 'se-resize' }}
            onMouseDown={e => startHandleDrag(e, 'scale', 'text', obj, cx, cy)} />
        )}
      </g>
    );
  }

  // ─── Layer-ordered rendering ──────────────────────────────────────────
  const allSelected = new Set([...(selectedIds || []), ...(selectedId ? [selectedId] : [])]);
  const ftypes = {};
  fixtureTypes.forEach(f => { ftypes[f.id] = f; });
  const focusFixture = focusModeId ? fixtures.find(f => f.id === focusModeId) : null;
  const ro = showRulers ? RULER_SIZE : 0;

  const activeLayers = (layers && layers.length) ? layers
    : [{ id: 'layer-bg', visible: true }, { id: 'layer-arch', visible: true }, { id: 'layer-lighting', visible: true }];

  function renderForLayer(layerId) {
    const vis = activeLayers.find(l => l.id === layerId)?.visible !== false;
    if (!vis) return null;
    return (
      <g key={layerId}>
        {/* PDF Background (layer-bg) */}
        {layerId === 'layer-bg' && pdfBackground && isLayerVisible('layer-bg') && (
          <image href={pdfBackground.dataUrl} x={pdfBackground.x} y={pdfBackground.y}
            width={pdfBackground.w} height={pdfBackground.h} opacity={pdfBackground.opacity ?? 0.4} />
        )}
        {/* Images */}
        {images.filter(o => getLayerId(o,'image') === layerId).map(img => (
          <g key={img.id} style={{ opacity: img.locked ? 0.6 : 1 }}>
            <g transform={img.rotation ? `rotate(${img.rotation},${img.x+img.w/2},${img.y+img.h/2})` : undefined}>
              <image href={img.dataUrl} x={img.x} y={img.y} width={img.w} height={img.h} />
              {allSelected.has(img.id) && <rect x={img.x} y={img.y} width={img.w} height={img.h} fill="none" stroke="#00aaff" strokeWidth={2/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} />}
            </g>
            {img.locked && <text x={img.x+4/zoom} y={img.y+14/zoom} fontSize={14/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
          </g>
        ))}
        {/* Lines */}
        {lines.filter(o => getLayerId(o,'line') === layerId).map(l => (
          <g key={l.id} style={{ opacity: l.locked ? 0.6 : 1 }}>
            <g transform={l.rotation ? `rotate(${l.rotation},${(l.x1+l.x2)/2},${(l.y1+l.y2)/2})` : undefined}>
              <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={allSelected.has(l.id)?'#00aaff':'#607d8b'} strokeWidth={2/zoom} strokeLinecap="round" />
            </g>
            {l.locked && <text x={(l.x1+l.x2)/2} y={(l.y1+l.y2)/2} fontSize={12/zoom} textAnchor="middle" fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
          </g>
        ))}
        {/* Rectangles */}
        {rectangles.filter(o => getLayerId(o,'rect') === layerId).map(r => (
          <g key={r.id} style={{ opacity: r.locked ? 0.6 : 1 }}>
            <g transform={r.rotation ? `rotate(${r.rotation},${r.x+r.w/2},${r.y+r.h/2})` : undefined}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} stroke={allSelected.has(r.id)?'#00aaff':'#607d8b'} strokeWidth={2/zoom} fill="none" />
            </g>
            {r.locked && <text x={r.x+4/zoom} y={r.y+14/zoom} fontSize={12/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
          </g>
        ))}
        {/* Circles */}
        {circles.filter(o => getLayerId(o,'circle') === layerId).map(c => (
          <circle key={c.id} cx={c.cx} cy={c.cy} r={c.r} fill="none"
            stroke={allSelected.has(c.id)?'#00aaff':'#607d8b'} strokeWidth={2/zoom} style={{ opacity: c.locked ? 0.6 : 1 }} />
        ))}
        {/* Arcs */}
        {arcs.filter(o => getLayerId(o,'arc') === layerId).map(a => (
          <path key={a.id} d={arcPath(a.cx, a.cy, a.r, a.a0, a.a1)} fill="none"
            stroke={allSelected.has(a.id)?'#00aaff':'#607d8b'} strokeWidth={2/zoom} style={{ opacity: a.locked ? 0.6 : 1 }} />
        ))}
        {/* Polylines */}
        {polylines.filter(o => getLayerId(o,'polyline') === layerId).map(pl => (
          <polyline key={pl.id} points={(pl.points||[]).map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={allSelected.has(pl.id)?'#00aaff':'#607d8b'} strokeWidth={2/zoom}
            strokeLinejoin="round" strokeLinecap="round"
            style={{ opacity: pl.locked ? 0.6 : 1, ...(pl.closed ? {} : {}) }} />
        ))}
        {/* Texts */}
        {texts.filter(o => getLayerId(o,'text') === layerId).map(t => (
          <g key={t.id} transform={t.rotation ? `rotate(${t.rotation},${t.x},${t.y})` : undefined} style={{ opacity: t.locked ? 0.6 : 1 }}>
            <text x={t.x} y={t.y} fill={allSelected.has(t.id)?'#00aaff':'#a0aec0'} fontSize={(t.fontSize||14)/zoom} style={{ userSelect:'none', cursor:'pointer' }}>{t.label}</text>
            {t.locked && <text x={t.x} y={t.y-(t.fontSize||14)/zoom-2/zoom} fontSize={12/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
          </g>
        ))}
        {/* Annotations */}
        {annotations.filter(o => getLayerId(o,'annotation') === layerId).map(a => {
          const aw = a.w || 120, ah = a.h || 50;
          const sel = allSelected.has(a.id);
          return (
            <g key={a.id} style={{ cursor:'pointer', opacity: a.locked ? 0.6 : 1 }}>
              <rect x={a.x} y={a.y} width={aw} height={ah}
                fill="rgba(255,220,50,0.1)" stroke={sel?'#ffd032':'rgba(255,208,50,0.5)'}
                strokeWidth={(sel?2:1)/zoom} rx={4/zoom} />
              <text x={a.x+5/zoom} y={a.y+16/zoom} fontSize={11/zoom} fill="#ffd032" style={{ userSelect:'none', pointerEvents:'none' }}>
                {a.label}
              </text>
              {a.locked && <text x={a.x+4/zoom} y={a.y+ah-4/zoom} fontSize={12/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
            </g>
          );
        })}
        {/* Dimension lines */}
        {(drawing?.dimensions||[]).filter(o => getLayerId(o,'dimension') === layerId).map(d => {
          const sel = allSelected.has(d.id);
          const ddx = d.x2 - d.x1, ddy = d.y2 - d.y1;
          const dlen = Math.sqrt(ddx*ddx + ddy*ddy) || 1;
          const nx = -ddy/dlen, ny = ddx/dlen;
          const tick = 8/zoom;
          const dlbl = formatLength(dlen, meta?.units || 'mm');
          const stroke = sel ? '#00aaff' : '#a0c0e0';
          return (
            <g key={d.id} style={{ cursor: 'pointer' }} onClick={() => onSelect({ kind: 'dimension', ...d })}>
              <line x1={d.x1+nx*tick} y1={d.y1+ny*tick} x2={d.x1-nx*tick} y2={d.y1-ny*tick} stroke={stroke} strokeWidth={1/zoom} />
              <line x1={d.x2+nx*tick} y1={d.y2+ny*tick} x2={d.x2-nx*tick} y2={d.y2-ny*tick} stroke={stroke} strokeWidth={1/zoom} />
              <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={stroke} strokeWidth={1/zoom} />
              <text x={(d.x1+d.x2)/2} y={(d.y1+d.y2)/2 - 5/zoom} textAnchor="middle" fontSize={9/zoom} fill={stroke} style={{ userSelect:'none', pointerEvents:'none' }}>{dlbl}</text>
              <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="transparent" strokeWidth={8/zoom} />
            </g>
          );
        })}
        {/* Pipes and Trusses */}
        {pipes.filter(o => getLayerId(o,'pipe') === layerId).map(p => {
          const sel = allSelected.has(p.id), hov = hoveredPipe === p.id;
          const isTruss = p.type === 'truss';
          const baseColor = isTruss ? '#60a0d0' : '#e0c060';
          const color = sel ? '#00aaff' : hov ? '#4a90d9' : baseColor;
          const sw = (sel ? 5 : isTruss ? 5 : 3) / zoom;
          return (
            <g key={p.id} style={{ opacity: p.locked ? 0.6 : 1 }}>
              {isTruss ? (
                // Truss: double-line symbol with cross-members
                <>
                  <line x1={p.x1} y1={p.y1-3/zoom} x2={p.x2} y2={p.y2-3/zoom} stroke={color} strokeWidth={1.5/zoom} />
                  <line x1={p.x1} y1={p.y1+3/zoom} x2={p.x2} y2={p.y2+3/zoom} stroke={color} strokeWidth={1.5/zoom} />
                  {/* Cross-member ticks */}
                  {(() => {
                    const len = distance(p.x1, p.y1, p.x2, p.y2);
                    const n = Math.max(2, Math.floor(len / (20/zoom)));
                    const ticks = [];
                    for (let i = 1; i < n; i++) {
                      const t = i / n;
                      const tx = p.x1 + (p.x2 - p.x1) * t;
                      const ty = p.y1 + (p.y2 - p.y1) * t;
                      ticks.push(<line key={i} x1={tx} y1={ty-3/zoom} x2={tx} y2={ty+3/zoom} stroke={color} strokeWidth={1/zoom} />);
                    }
                    return ticks;
                  })()}
                </>
              ) : (
                <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
              )}
              {/* End caps */}
              <line x1={p.x1} y1={p.y1-6/zoom} x2={p.x1} y2={p.y1+6/zoom} stroke={color} strokeWidth={2/zoom} />
              <line x1={p.x2} y1={p.y2-6/zoom} x2={p.x2} y2={p.y2+6/zoom} stroke={color} strokeWidth={2/zoom} />
              <text x={(p.x1+p.x2)/2} y={(p.y1+p.y2)/2-10/zoom} textAnchor="middle" fontSize={10/zoom} fill={color} style={{ userSelect:'none', pointerEvents:'none' }}>
                {isTruss ? '⊞ ' : ''}{p.name}
              </text>
              {p.locked && <text x={(p.x1+p.x2)/2} y={(p.y1+p.y2)/2} textAnchor="middle" fontSize={12/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
            </g>
          );
        })}
        {/* Fixtures */}
        {fixtures.filter(o => getLayerId(o,'fixture') === layerId).map(f => {
          const ftype = ftypes[f.fixtureTypeId];
          const sel = allSelected.has(f.id);

          // ── Beam footprint ─────────────────────────────────────────────
          // The fixture hangs at rigHeight mm above the floor. tiltAngle (0=straight down,
          // positive = tilting toward the front of the symbol) controls the horizontal throw.
          // We project the cone edge onto the floor plan.
          const beamEl = (() => {
            if (!showBeams) return null;
            // Per-fixture override wins, else the fixture type's beam angle.
            const beamDeg = f.beamAngle ?? ftype?.beamAngle ?? 0;
            const halfBeamRad = (beamDeg / 2) * Math.PI / 180;
            if (halfBeamRad <= 0) return null;
            const tiltRad = (f.tiltAngle ?? 0) * Math.PI / 180; // 0 = straight down
            const h = rigHeight || 5500;                         // throw height (mm) above floor
            // Project the cone onto the floor. Near/far edges along the tilt axis
            // (no clamping — at tilt 0 these are symmetric, giving a circle).
            const nearDist = h * Math.tan(tiltRad - halfBeamRad);
            const farDist  = h * Math.tan(tiltRad + halfBeamRad);
            const centreDist = (nearDist + farDist) / 2;
            const rMajor = Math.abs(farDist - nearDist) / 2;             // along throw
            const rMinor = (h / Math.cos(tiltRad)) * Math.tan(halfBeamRad); // perpendicular
            // Beam shoots in the direction the symbol points (rotation; +180 so a
            // 0° fixture throws "down" the plan toward the stage).
            const rotDeg = (f.rotation || 0) + 180;
            const rotRad = rotDeg * Math.PI / 180;
            const dirX = Math.sin(rotRad), dirY = -Math.cos(rotRad);     // throw direction
            const cx = centreDist * dirX, cy = centreDist * dirY;
            // Edge points of the footprint (near & far along throw) for the cone lines.
            const nearX = nearDist * dirX, nearY = nearDist * dirY;
            const px = -dirY, py = dirX;                                  // perpendicular unit
            const colour = f.colourHex && f.colourHex !== 'null' ? f.colourHex : '#ffd86b';
            return (
              <g style={{ pointerEvents: 'none' }}>
                {/* Cone edges: fixture → the two sides of the footprint at the near plane offset */}
                <line x1={0} y1={0} x2={cx + px*rMinor} y2={cy + py*rMinor}
                  stroke={colour} strokeWidth={0.8/zoom} strokeOpacity={0.45} strokeDasharray={`${4/zoom} ${3/zoom}`} />
                <line x1={0} y1={0} x2={cx - px*rMinor} y2={cy - py*rMinor}
                  stroke={colour} strokeWidth={0.8/zoom} strokeOpacity={0.45} strokeDasharray={`${4/zoom} ${3/zoom}`} />
                {/* Footprint ellipse (major axis along the throw) */}
                <ellipse cx={cx} cy={cy} rx={rMinor} ry={rMajor}
                  transform={`rotate(${rotDeg} ${cx} ${cy})`}
                  fill={colour} fillOpacity={0.10}
                  stroke={colour} strokeWidth={1/zoom} strokeOpacity={0.55} />
              </g>
            );
          })();

          return (
            <g key={f.id} transform={`translate(${f.x},${f.y})`} style={{ cursor: f.locked ? 'not-allowed' : 'pointer', opacity: f.locked ? 0.6 : 1 }}>
              {beamEl}
              <g transform={`scale(${1/zoom})`}>
                <FixtureSymbol fixtureType={ftype} unit={f.channel?.trim() ? `Ch.${f.channel.trim()}` : (f.unit?.trim()||null)} channel={null} selected={sel} rotation={f.rotation||0} scale={f.scale||1} colourHex={f.colourHex||null} symbolOverride={f.symbolOverride||null} symbolColor={f.symbolColor||null} />
              </g>
              {dmxConflicts.includes(f.id) && <circle cx={0} cy={0} r={16/zoom} fill="none" stroke="#fc8181" strokeWidth={2/zoom} strokeOpacity={0.85} style={{ pointerEvents:'none' }} />}
              {f.id === focusModeId && <circle cx={0} cy={0} r={6/zoom} fill="none" stroke="#ffaa00" strokeWidth={2/zoom} strokeDasharray={`${3/zoom} ${2/zoom}`} />}
              {f.locked && <text x={0} y={-20/zoom} textAnchor="middle" fontSize={12/zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect:'none', pointerEvents:'none' }}>🔒</text>}
            </g>
          );
        })}
      </g>
    );
  }

  // All distinct layer IDs present in objects (to catch unlayered objects)
  const allLayerIds = [...new Set([
    ...activeLayers.map(l => l.id),
    'layer-bg', 'layer-arch', 'layer-lighting',
  ])];

  // ─── Group bounding box ───────────────────────────────────────────────
  const groupBounds = (() => {
    if ((selectedIds||[]).length < 2) return null;
    const all = [...fixtures, ...pipes, ...lines, ...rectangles, ...texts, ...images, ...annotations];
    const first = all.find(o => o.id === selectedIds[0]);
    if (!first?.groupId) return null;
    if (!selectedIds.every(id => all.find(o => o.id === id)?.groupId === first.groupId)) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedIds.forEach(id => {
      const o = all.find(o => o.id === id);
      if (!o) return;
      if (o.w !== undefined) { minX = Math.min(minX,o.x); minY = Math.min(minY,o.y); maxX = Math.max(maxX,o.x+o.w); maxY = Math.max(maxY,o.y+o.h); }
      else if (o.x1 !== undefined) { minX = Math.min(minX,o.x1,o.x2); minY = Math.min(minY,o.y1,o.y2); maxX = Math.max(maxX,o.x1,o.x2); maxY = Math.max(maxY,o.y1,o.y2); }
      else if (o.x !== undefined) { minX = Math.min(minX,o.x-15); minY = Math.min(minY,o.y-15); maxX = Math.max(maxX,o.x+15); maxY = Math.max(maxY,o.y+15); }
    });
    return isFinite(minX) ? { x: minX-10, y: minY-10, w: maxX-minX+20, h: maxY-minY+20 } : null;
  })();

  // ─── Inline text editor ───────────────────────────────────────────────
  // Commit the in-progress shape using its current preview endpoint (which
  // already reflects any typed dimensions). Returns true if committed.
  function commitDyn(refX, refY) {
    const ds = drawingRef.current;
    if (!ds) return false;
    const end = applyDyn(ds, refX ?? ds.x2, refY ?? ds.y2);
    if (ds.kind === 'line') {
      if (distance(ds.x1, ds.y1, end.x2, end.y2) > 2)
        commitToDrawing(d => d.lines.push({ id: generateId(), kind: 'line', x1: ds.x1, y1: ds.y1, x2: end.x2, y2: end.y2, layerId: activeLayerId || 'layer-arch' }), 'Add line');
      setDrawingState(null);
    } else if (ds.kind === 'pipe') {
      if (distance(ds.x1, ds.y1, end.x2, end.y2) <= 2) { setDrawingState(null); resetDyn(); return true; }
      const np = { id: generateId(), kind: 'pipe', x1: ds.x1, y1: ds.y1, x2: end.x2, y2: end.y2, name: 'New Pipe', height: '3.0', layerId: activeLayerId || 'layer-lighting' };
      commitToDrawing(d => d.pipes.push(np), 'Add pipe');
      onSelect({ kind: 'pipe', ...np });
      resetDyn();
      setDrawingState({ kind: 'pipe', x1: end.x2, y1: end.y2, x2: end.x2, y2: end.y2 }); // chain
      return true;
    } else if (ds.kind === 'rect') {
      const x = Math.min(ds.x1, end.x2), y = Math.min(ds.y1, end.y2);
      const w = Math.abs(end.x2 - ds.x1), h = Math.abs(end.y2 - ds.y1);
      if (w > 2 && h > 2)
        commitToDrawing(d => d.rectangles.push({ id: generateId(), kind: 'rect', x, y, w, h, layerId: activeLayerId || 'layer-arch' }), 'Add rectangle');
      setDrawingState(null);
    } else if (ds.kind === 'circle') {
      const r = distance(ds.x1, ds.y1, end.x2, end.y2);
      if (r > 1)
        commitToDrawing(d => { if (!d.circles) d.circles = []; d.circles.push({ id: generateId(), kind: 'circle', cx: ds.x1, cy: ds.y1, r, layerId: activeLayerId || 'layer-arch' }); }, 'Add circle');
      setDrawingState(null);
    }
    resetDyn();
    return true;
  }

  // Handle a key while a shape is being drawn (digits build a dimension).
  function handleDynKey(e) {
    const ds = drawingRef.current;
    if (!ds) return false;
    const fields = dynFieldsFor(ds.kind);
    if (!fields.length) return false;
    const k = e.key;
    if (/^[0-9.]$/.test(k) || (k === '-' && !dynValsRef.current[fields[dynActiveRef.current]])) {
      const f = fields[dynActiveRef.current];
      dynValsRef.current = { ...dynValsRef.current, [f]: (dynValsRef.current[f] || '') + k };
      const end = applyDyn(ds, ds.x2, ds.y2);
      setDrawingState(d => ({ ...d, x2: end.x2, y2: end.y2 }));
      bumpDyn();
      return true;
    }
    if (k === 'Backspace') {
      const f = fields[dynActiveRef.current];
      const cur = dynValsRef.current[f] || '';
      if (cur) {
        dynValsRef.current = { ...dynValsRef.current, [f]: cur.slice(0, -1) };
        const end = applyDyn(ds, ds.x2, ds.y2);
        setDrawingState(d => ({ ...d, x2: end.x2, y2: end.y2 }));
        bumpDyn();
        return true;
      }
      return false;
    }
    if (k === 'Tab' && fields.length > 1) {
      dynActiveRef.current = (dynActiveRef.current + 1) % fields.length;
      bumpDyn();
      return true;
    }
    if (k === 'Enter') {
      // Rectangle: first Enter after typing width moves focus to height.
      if (ds.kind === 'rect' && dynActiveRef.current === 0 && dynValsRef.current.width && !dynValsRef.current.height) {
        dynActiveRef.current = 1; bumpDyn(); return true;
      }
      commitDyn();
      return true;
    }
    return false;
  }

  let editOverlay = null;
  if (editingText) {
    const sx = editingText.x * zoom + pan.x + ro;
    const sy = editingText.y * zoom + pan.y + ro;
    const fs = (editingText.fontSize || 14) * zoom;
    editOverlay = (
      <input autoFocus
        style={{ position: 'fixed', left: sx, top: sy - fs - 2, fontSize: fs, fontFamily: 'inherit', background: 'rgba(13,27,42,0.95)', border: '1px solid #ffd032', borderRadius: 3, color: '#e0e0e0', padding: '0 4px', outline: 'none', minWidth: 60, zIndex: 200 }}
        value={editingText.label}
        onChange={e => setEditingText(p => ({ ...p, label: e.target.value }))}
        onBlur={() => {
          const label = editingText.label;
          const id = editingText.id;
          if (editingText.isAnnotation) commitToDrawing(d => { const a = (d.annotations||[]).find(a => a.id === id); if (a) a.label = label; });
          else commitToDrawing(d => { const t = d.texts.find(t => t.id === id); if (t) t.label = label; });
          setEditingText(null);
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingText(null); e.stopPropagation(); }}
      />
    );
  }

  function commitCalib() {
    if (!calibDist || !calibState?.p2) return;
    const worldDist = distance(calibState.p1.x, calibState.p1.y, calibState.p2.x, calibState.p2.y);
    const realDist = Number(calibDist);
    const unitToMm = { mm: 1, cm: 10, m: 1000, ft: 304.8, in: 25.4 };
    const realDistMm = realDist * (unitToMm[calibUnit] || 1);
    // Scale factor: how many mm per world unit after calibration
    const scaleFactor = realDistMm / worldDist;
    const p1 = calibState.p1;

    commitToDrawing(d => {
      // Scale a coordinate about an anchor.
      const sc = (v, o) => o + (v - o) * scaleFactor;
      const valid = scaleFactor > 0 && isFinite(scaleFactor);
      if (d.pdfBackground && valid) {
        // Background present: the geometry is the truth (1wu=1mm). Rescale the
        // imported background image so it matches, leaving fixtures/pipes put.
        const bg = d.pdfBackground;
        bg.x = sc(bg.x, p1.x); bg.y = sc(bg.y, p1.y);
        bg.w = bg.w * scaleFactor; bg.h = bg.h * scaleFactor;
      } else if (valid) {
        // No background: rescale ALL geometry about p1 so the measured feature
        // becomes its true millimetre size, restoring the 1wu=1mm invariant.
        const sp = (px, py) => ({ x: sc(px, p1.x), y: sc(py, p1.y) });
        (d.fixtures||[]).forEach(f => { const p = sp(f.x, f.y); f.x = p.x; f.y = p.y; });
        (d.pipes||[]).forEach(p => { const a = sp(p.x1,p.y1), b = sp(p.x2,p.y2); p.x1=a.x;p.y1=a.y;p.x2=b.x;p.y2=b.y; });
        (d.lines||[]).forEach(l => { const a = sp(l.x1,l.y1), b = sp(l.x2,l.y2); l.x1=a.x;l.y1=a.y;l.x2=b.x;l.y2=b.y; });
        (d.rectangles||[]).forEach(r => { const a = sp(r.x,r.y); r.x=a.x;r.y=a.y; r.w*=scaleFactor; r.h*=scaleFactor; });
        (d.texts||[]).forEach(t => { const a = sp(t.x,t.y); t.x=a.x;t.y=a.y; });
        (d.images||[]).forEach(im => { const a = sp(im.x,im.y); im.x=a.x;im.y=a.y; im.w*=scaleFactor; im.h*=scaleFactor; });
        (d.infrastructure||[]).forEach(i => { const a = sp(i.x,i.y); i.x=a.x;i.y=a.y; });
        (d.dimensions||[]).forEach(dm => { const a = sp(dm.x1,dm.y1), b = sp(dm.x2,dm.y2); dm.x1=a.x;dm.y1=a.y;dm.x2=b.x;dm.y2=b.y; });
      }
      // Calibration is now an annotation only — measurement uses 1wu=1mm.
      const p2s = valid ? { x: sc(calibState.p2.x, p1.x), y: sc(calibState.p2.y, p1.y) } : calibState.p2;
      d.calibration = { p1, p2: p2s, realDist, unit: calibUnit };
    }, 'Calibrate scale');
    setCalibState(null);
    setCalibDist('');
    if (onToolDone) onToolDone();
  }

  const cursorStyle = focusModeId ? 'crosshair' : activeTool === 'calibrate' ? 'crosshair' : pendingFixture ? 'crosshair'
    : activeTool === 'select' ? (dragging && !dragging.handlePoint ? 'grabbing' : 'default')
    : 'crosshair';

  return (
    <>
      <svg ref={svgRef}
        style={{ flex: 1, display: 'block', background: '#0d1117', cursor: cursorStyle, userSelect: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onDoubleClick={onDblClick} onContextMenu={onContextMenu}
        onMouseLeave={() => { setCursorPos(null); setFocusCursor(null); if (dragTargetLayerRef) dragTargetLayerRef.current = null; }}
      >
        <g transform={`translate(${ro},${ro})`}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {renderGrid()}

            {/* Layer-ordered objects */}
            {allLayerIds.map(lid => renderForLayer(lid))}

            {/* Focus line */}
            {focusFixture && focusCursor && (
              <line x1={focusFixture.x} y1={focusFixture.y} x2={focusCursor.x} y2={focusCursor.y}
                stroke="#ffaa00" strokeWidth={1.5/zoom} strokeDasharray={`${5/zoom} ${3/zoom}`} />
            )}

            {/* Drawing ghosts */}
            {drawingState?.kind === 'line' && <line x1={drawingState.x1} y1={drawingState.y1} x2={drawingState.x2} y2={drawingState.y2} stroke="#607d8b" strokeWidth={2/zoom} strokeDasharray={`${6/zoom} ${3/zoom}`} />}
            {measure && (() => {
              // In-progress: follow the cursor; completed: fixed endpoint.
              const x1 = measure.x1, y1 = measure.y1;
              const x2 = measure.done ? measure.x2 : (cursorPos ? cursorPos.x : measure.x1);
              const y2 = measure.done ? measure.y2 : (cursorPos ? cursorPos.y : measure.y1);
              const dx2 = x2 - x1, dy2 = y2 - y1;
              const len = Math.sqrt(dx2*dx2 + dy2*dy2) || 1;
              const nx = -dy2/len, ny = dx2/len;
              const tick = 6/zoom;
              const lbl = formatLength(len, meta?.units || 'mm');
              const col = measure.done ? '#68d391' : '#a0c0ff';
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={1.5/zoom} strokeDasharray={measure.done ? 'none' : `${4/zoom} ${2/zoom}`} />
                  <line x1={x1+nx*tick} y1={y1+ny*tick} x2={x1-nx*tick} y2={y1-ny*tick} stroke={col} strokeWidth={1/zoom} />
                  <line x1={x2+nx*tick} y1={y2+ny*tick} x2={x2-nx*tick} y2={y2-ny*tick} stroke={col} strokeWidth={1/zoom} />
                  <circle cx={x1} cy={y1} r={3/zoom} fill={col} />
                  {measure.done && <circle cx={x2} cy={y2} r={3/zoom} fill={col} />}
                  <text x={(x1+x2)/2} y={(y1+y2)/2 - 6/zoom} textAnchor="middle" fontSize={10/zoom} fill={col}
                    style={{ paintOrder: 'stroke', stroke: '#0d1117', strokeWidth: 3/zoom }}>{lbl}</text>
                </g>
              );
            })()}
            {drawingState?.kind === 'pipe' && (
              <g>
                <line x1={drawingState.x1} y1={drawingState.y1} x2={drawingState.x2} y2={drawingState.y2}
                  stroke={(activeTool === 'truss') ? '#60a0d0' : '#e0c060'} strokeWidth={3/zoom} strokeDasharray={`${6/zoom} ${3/zoom}`} />
                <circle cx={drawingState.x1} cy={drawingState.y1} r={4/zoom}
                  fill={(activeTool === 'truss') ? '#60a0d0' : '#e0c060'} />
                {/* Endpoint snap highlights */}
                {pipes.filter(p => {
                  const snap = PIPE_SNAP_RADIUS / zoom;
                  return (distance(drawingState.x2, drawingState.y2, p.x1, p.y1) < snap ||
                          distance(drawingState.x2, drawingState.y2, p.x2, p.y2) < snap);
                }).map(p => (
                  <g key={p.id}>
                    {distance(drawingState.x2, drawingState.y2, p.x1, p.y1) < PIPE_SNAP_RADIUS / zoom &&
                      <circle cx={p.x1} cy={p.y1} r={6/zoom} fill="none" stroke="#00ff88" strokeWidth={2/zoom} />}
                    {distance(drawingState.x2, drawingState.y2, p.x2, p.y2) < PIPE_SNAP_RADIUS / zoom &&
                      <circle cx={p.x2} cy={p.y2} r={6/zoom} fill="none" stroke="#00ff88" strokeWidth={2/zoom} />}
                  </g>
                ))}
              </g>
            )}
            {drawingState?.kind === 'rect' && <rect x={Math.min(drawingState.x1,drawingState.x2)} y={Math.min(drawingState.y1,drawingState.y2)} width={Math.abs(drawingState.x2-drawingState.x1)} height={Math.abs(drawingState.y2-drawingState.y1)} stroke="#607d8b" strokeWidth={2/zoom} fill="none" strokeDasharray={`${6/zoom} ${3/zoom}`} />}

            {/* Circle ghost */}
            {drawingState?.kind === 'circle' && (() => {
              const r = distance(drawingState.x1, drawingState.y1, drawingState.x2, drawingState.y2);
              return <g style={{ pointerEvents:'none' }}>
                <circle cx={drawingState.x1} cy={drawingState.y1} r={r} stroke="#7fb0ff" strokeWidth={1.5/zoom} fill="none" strokeDasharray={`${5/zoom} ${3/zoom}`} />
                <text x={drawingState.x1} y={drawingState.y1 - r - 6/zoom} textAnchor="middle" fontSize={10/zoom} fill="#7fb0ff">r {formatLength(r, meta?.units||'mm')}</text>
              </g>;
            })()}

            {/* Arc ghost */}
            {arcDraw && cursorPos && (() => {
              if (arcDraw.stage === 1) {
                const r = distance(arcDraw.cx, arcDraw.cy, cursorPos.x, cursorPos.y);
                return <circle cx={arcDraw.cx} cy={arcDraw.cy} r={r} stroke="#7fb0ff" strokeWidth={1/zoom} fill="none" strokeDasharray={`${4/zoom} ${3/zoom}`} style={{ pointerEvents:'none' }} />;
              }
              const a1 = Math.atan2(cursorPos.y - arcDraw.cy, cursorPos.x - arcDraw.cx);
              return <path d={arcPath(arcDraw.cx, arcDraw.cy, arcDraw.r, arcDraw.a0, a1)} stroke="#7fb0ff" strokeWidth={1.5/zoom} fill="none" style={{ pointerEvents:'none' }} />;
            })()}

            {/* Polyline ghost */}
            {polyDraw && (() => {
              const pts = [...polyDraw.points];
              const live = cursorPos ? [...pts, cursorPos] : pts;
              return <g style={{ pointerEvents:'none' }}>
                <polyline points={live.map(p => `${p.x},${p.y}`).join(' ')} stroke="#7fb0ff" strokeWidth={1.5/zoom} fill="none" strokeDasharray={`${5/zoom} ${3/zoom}`} strokeLinejoin="round" />
                {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={3/zoom} fill="#7fb0ff" />)}
              </g>;
            })()}

            {/* Box selection */}
            {selBox && <rect x={Math.min(selBox.x1,selBox.x2)} y={Math.min(selBox.y1,selBox.y2)} width={Math.abs(selBox.x2-selBox.x1)} height={Math.abs(selBox.y2-selBox.y1)} stroke="#00aaff" strokeWidth={1.5/zoom} fill="rgba(0,170,255,0.08)" strokeDasharray={`${4/zoom} ${2/zoom}`} />}

            {/* Group bounding box */}
            {groupBounds && <rect x={groupBounds.x} y={groupBounds.y} width={groupBounds.w} height={groupBounds.h} stroke="#7b61ff" strokeWidth={1.5/zoom} fill="rgba(123,97,255,0.06)" strokeDasharray={`${6/zoom} ${3/zoom}`} />}

            {/* Infrastructure items — cable mode only */}
            {activeMode === 'cable' && (
              <InfraLayer
                infrastructure={infrastructure}
                selectedId={selectedId}
                zoom={zoom}
                onMouseDown={(e, item) => {
                  if (activeTool !== 'select') return;
                  onSelect({ kind: 'infra', ...item });
                  const w = screenToWorld(e.clientX, e.clientY);
                  setDragging({ id: item.id, kind: 'infra', handlePoint: null, startX: w.x, startY: w.y, origX: item.x, origY: item.y });
                  e.stopPropagation();
                }}
              />
            )}

            {/* Cables — cable mode only */}
            {activeMode === 'cable' && <CablingLayer
              cables={cables}
              infrastructure={infrastructure}
              fixtures={fixtures}
              pipes={pipes}
              fixtureTypes={fixtureTypes}
              rigHeight={rigHeight}
              gridHeight={gridHeight}
              zoom={zoom}
              selectedIds={new Set(selectedId ? [selectedId, ...(selectedIds||[])] : (selectedIds||[]))}
              animating={animating}
              onCableClick={(cable, sx, sy) => {
                if (selectedId === cable.id) {
                  // Cable already selected: insert waypoint at nearest point on the existing route
                  const world = screenToWorld(sx, sy);
                  commitToDrawing(d => {
                    const c = (d.cables || []).find(c => c.id === cable.id);
                    if (!c) return;
                    const fromO = cable.fromType === 'fixture'
                      ? fixtures.find(f => f.id === cable.fromId)
                      : (drawing?.infrastructure || []).find(i => i.id === cable.fromId);
                    const toO = cable.toType === 'fixture'
                      ? fixtures.find(f => f.id === cable.toId)
                      : (drawing?.infrastructure || []).find(i => i.id === cable.toId);
                    const wps = c.userWaypoints ? [...c.userWaypoints] : [];
                    // Find best insert position: nearest segment in anchor list
                    const anchors = [fromO, ...wps, toO].filter(Boolean);
                    let bestIdx = wps.length, bestDist = Infinity;
                    for (let i = 0; i < anchors.length - 1; i++) {
                      const a = anchors[i], b = anchors[i + 1];
                      const dx = b.x - a.x, dy = b.y - a.y;
                      const lenSq = dx*dx + dy*dy;
                      if (lenSq === 0) continue;
                      const t = Math.max(0, Math.min(1, ((world.x - a.x)*dx + (world.y - a.y)*dy) / lenSq));
                      const nx = a.x + t*dx, ny = a.y + t*dy;
                      const d2 = (world.x-nx)**2 + (world.y-ny)**2;
                      if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
                    }
                    wps.splice(bestIdx, 0, { x: world.x, y: world.y });
                    c.userWaypoints = wps;
                  });
                } else {
                  onSelect({ kind: 'cable', ...cable });
                }
              }}
            />}

            {/* Cable waypoint editing handles (shown when a cable is selected, cable mode only) */}
            {activeMode === 'cable' && activeTool === 'select' && selectedId && (() => {
              const selCable = cables.find(c => c.id === selectedId);
              if (!selCable) return null;
              const fromObj = selCable.fromType === 'fixture'
                ? fixtures.find(f => f.id === selCable.fromId)
                : (drawing?.infrastructure || []).find(i => i.id === selCable.fromId);
              const toObj = selCable.toType === 'fixture'
                ? fixtures.find(f => f.id === selCable.toId)
                : (drawing?.infrastructure || []).find(i => i.id === selCable.toId);
              if (!fromObj || !toObj) return null;

              const userWps = selCable.userWaypoints || [];
              const hr = 8 / zoom;   // handle radius (larger = easier to grab)
              const mr = 5 / zoom;   // midpoint handle radius

              // Build midpoints between consecutive anchors (from → wps → to)
              const anchors = [fromObj, ...userWps.map(w => ({ x: w.x, y: w.y })), toObj];
              const midpoints = [];
              for (let i = 0; i < anchors.length - 1; i++) {
                midpoints.push({
                  x: (anchors[i].x + anchors[i+1].x) / 2,
                  y: (anchors[i].y + anchors[i+1].y) / 2,
                  insertIdx: i,
                });
              }

              function deleteWaypoint(idx) {
                commitToDrawing(d => {
                  const c = (d.cables || []).find(c => c.id === selCable.id);
                  if (c) c.userWaypoints = (c.userWaypoints || []).filter((_, j) => j !== idx);
                });
              }

              return (
                <g style={{ pointerEvents: 'all' }}>
                  {/* Midpoint insert handles */}
                  {midpoints.map((mp, i) => (
                    <g key={'mid-'+i} style={{ cursor: 'crosshair' }}
                      title="Click to insert waypoint"
                      onMouseDown={e => {
                        e.stopPropagation();
                        const world = screenToWorld(e.clientX, e.clientY);
                        const newWps = [...userWps];
                        newWps.splice(mp.insertIdx, 0, { x: world.x, y: world.y });
                        commitToDrawing(d => {
                          const c = (d.cables || []).find(c => c.id === selCable.id);
                          if (c) c.userWaypoints = newWps;
                        });
                        setWpDrag({ cableId: selCable.id, wpIdx: mp.insertIdx, baseWaypoints: newWps });
                      }}>
                      {/* Larger invisible hit area */}
                      <circle cx={mp.x} cy={mp.y} r={mr * 2} fill="transparent" stroke="none" />
                      <circle cx={mp.x} cy={mp.y} r={mr}
                        fill="rgba(0,170,255,0.18)" stroke="#00aaff"
                        strokeWidth={0.8/zoom} strokeDasharray={`${2/zoom} ${2/zoom}`} />
                      <text x={mp.x} y={mp.y + 0.4*mr} textAnchor="middle"
                        fontSize={mr * 1.4} fill="#00aaff"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>+</text>
                    </g>
                  ))}
                  {/* Drag handles for existing user waypoints */}
                  {userWps.map((wp, i) => (
                    <g key={'wp-'+i}>
                      {/* Invisible hit area */}
                      <circle cx={wp.x} cy={wp.y} r={hr * 1.6}
                        fill="transparent" stroke="none" style={{ cursor: 'move' }}
                        onMouseDown={e => { e.stopPropagation(); setWpDrag({ cableId: selCable.id, wpIdx: i, baseWaypoints: [...userWps] }); }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); deleteWaypoint(i); }}
                      />
                      <circle cx={wp.x} cy={wp.y} r={hr}
                        fill="#00aaff" stroke="white" strokeWidth={1.5/zoom}
                        style={{ cursor: 'move', pointerEvents: 'none' }}
                      />
                      {/* Index label */}
                      <text x={wp.x} y={wp.y - hr - 2/zoom}
                        textAnchor="middle" fontSize={8/zoom} fill="#00aaff"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {i + 1}
                      </text>
                    </g>
                  ))}
                  {/* Clear all button (shown when waypoints exist) */}
                  {userWps.length > 0 && (() => {
                    const cx = fromObj.x + 8/zoom, cy = fromObj.y - 12/zoom;
                    return (
                      <g style={{ cursor: 'pointer' }}
                        title="Clear all waypoints (reset to auto-route)"
                        onClick={e => {
                          e.stopPropagation();
                          commitToDrawing(d => {
                            const c = (d.cables || []).find(c => c.id === selCable.id);
                            if (c) c.userWaypoints = [];
                          });
                        }}>
                        <rect x={cx - 1/zoom} y={cy - 7/zoom} width={26/zoom} height={10/zoom}
                          rx={2/zoom} fill="#0d1b2a" stroke="#00aaff" strokeWidth={0.5/zoom} />
                        <text x={cx + 12/zoom} y={cy - 0.5/zoom}
                          textAnchor="middle" fontSize={6.5/zoom} fill="#00aaff"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          ↺ reset
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}

            {/* Cable ghost line while drawing */}
            {cableFrom && cableGhost && (
              <line
                x1={cableFrom.x} y1={cableFrom.y}
                x2={cableGhost.x} y2={cableGhost.y}
                stroke={activeTool === 'cable-power' ? '#f59e0b' : activeTool === 'cable-dmx' ? '#a78bfa' : '#34d399'}
                strokeWidth={2/zoom} strokeDasharray={`${6/zoom} ${3/zoom}`}
                style={{ pointerEvents: 'none' }}
              />
            )}
            {cableFrom && (
              <circle cx={cableFrom.x} cy={cableFrom.y} r={8/zoom}
                fill="none"
                stroke={activeTool === 'cable-power' ? '#f59e0b' : activeTool === 'cable-dmx' ? '#a78bfa' : '#34d399'}
                strokeWidth={2/zoom} strokeDasharray={`${3/zoom} ${2/zoom}`} />
            )}

            {/* Selection controls */}
            {renderSelectionControls()}

            {/* Pipe snap zone */}
            {pendingFixture && snapRef.current.pipe && hoveredPipe && (() => {
              const p = pipes.find(p => p.id === hoveredPipe);
              return p ? <circle cx={(p.x1+p.x2)/2} cy={(p.y1+p.y2)/2} r={PIPE_SNAP_RADIUS/zoom} stroke="#00aaff" strokeWidth={1/zoom} fill="none" opacity={0.3} strokeDasharray={`${4/zoom} ${4/zoom}`} /> : null;
            })()}
          </g>
        </g>

        {renderRulers(3000, 1500)}
        {cursorPos && !focusModeId && !calibState && <text x={ro+8} y={28} fontSize={9} fill="#4a6080">{formatCoord(cursorPos.x, cursorPos.y, meta?.units || 'mm')}</text>}
        {focusModeId && <text x={ro+8} y={28} fontSize={10} fill="#ffaa00">Click to set focus direction — Esc to cancel</text>}
        {activeTool === 'dimension' && <text x={ro+8} y={28} fontSize={10} fill="#a0c0ff">{measure && !measure.done ? '⟷ Click second point to finish' : measure?.done ? '⟷ Measurement shown — click to measure again, switch tool to clear' : '⟷ Click first point to measure'}</text>}
        {activeTool === 'calibrate' && !calibState && <text x={ro+8} y={28} fontSize={10} fill="#a0e0a0">📐 Click first calibration point — Esc to cancel</text>}
        {activeTool === 'calibrate' && calibState?.p1 && !calibState?.p2 && <text x={ro+8} y={28} fontSize={10} fill="#a0e0a0">📐 Click second calibration point</text>}
        {(activeTool === 'pipe' || activeTool === 'truss') && drawingRef.current && (
          <text x={ro+8} y={28} fontSize={10} fill="#e0c060">
            {pipePlaceAngle !== null ? `🔄 Angle: ${pipePlaceAngle}° (R=rotate 90°, Esc=stop)` : 'Click to place section — click again to chain next — R/right-click=rotate 90° — Esc=stop'}
          </text>
        )}
        {/* Snap indicator */}
        {alignGuides && (() => {
          const ext = 100000; // long enough to span the view
          return (
            <g style={{ pointerEvents:'none' }} stroke="#ff66cc" strokeWidth={0.8/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`}>
              {alignGuides.vx != null && <line x1={alignGuides.vx} y1={-ext} x2={alignGuides.vx} y2={ext} />}
              {alignGuides.hy != null && <line x1={-ext} y1={alignGuides.hy} x2={ext} y2={alignGuides.hy} />}
            </g>
          );
        })()}
        {snapPoint && (() => {
          const x = snapPoint.x, y = snapPoint.y, s = 6/zoom, sw = 1.5/zoom;
          const t = snapPoint.type;
          const col = (t === 'endpoint' || t === 'intersection') ? '#ffdd33' : t === 'ortho' ? '#ff66cc' : '#00ff88';
          let marker;
          if (t === 'endpoint')         marker = <rect x={x-s} y={y-s} width={s*2} height={s*2} fill="none" stroke={col} strokeWidth={sw} />;
          else if (t === 'midpoint')    marker = <polygon points={`${x},${y-s} ${x+s},${y+s} ${x-s},${y+s}`} fill="none" stroke={col} strokeWidth={sw} />;
          else if (t === 'center')      marker = <circle cx={x} cy={y} r={s} fill="none" stroke={col} strokeWidth={sw} />;
          else if (t === 'intersection')marker = <g stroke={col} strokeWidth={sw}><line x1={x-s} y1={y-s} x2={x+s} y2={y+s} /><line x1={x-s} y1={y+s} x2={x+s} y2={y-s} /></g>;
          else if (t === 'perpendicular')marker = <g stroke={col} strokeWidth={sw} fill="none"><path d={`M ${x-s} ${y-s} L ${x-s} ${y+s} L ${x+s} ${y+s}`} /><rect x={x-s} y={y} width={s} height={s} /></g>;
          else                          marker = <circle cx={x} cy={y} r={s*0.7} fill="none" stroke={col} strokeWidth={sw} />;
          const label = { endpoint:'END', midpoint:'MID', center:'CEN', intersection:'INT', perpendicular:'PERP', nearest:'NEAR', ortho:'ORTHO' }[t] || '';
          return (
            <g style={{ pointerEvents: 'none' }}>
              {marker}
              <text x={x + 9/zoom} y={y - 9/zoom} fontSize={9/zoom} fill={col} style={{ userSelect:'none' }}>{label}</text>
            </g>
          );
        })()}
        {/* In-progress calibration line (screen coords) */}
        {calibState?.p1 && (() => {
          const x1s = calibState.p1.x * zoom + pan.x + ro, y1s = calibState.p1.y * zoom + pan.y + ro;
          const p2 = calibState.p2 || rawCursorPos;
          const x2s = p2 ? p2.x * zoom + pan.x + ro : x1s, y2s = p2 ? p2.y * zoom + pan.y + ro : y1s;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={x1s} y1={y1s} x2={x2s} y2={y2s} stroke="#a0e0a0" strokeWidth={1.5} strokeDasharray="5 3" />
              <circle cx={x1s} cy={y1s} r={5} fill="#a0e0a0" />
              {calibState.p2 && <circle cx={x2s} cy={y2s} r={5} fill="#a0e0a0" />}
            </g>
          );
        })()}
        {/* Saved calibration annotation */}
        {drawing?.calibration && (() => {
          const c = drawing.calibration;
          const x1s = c.p1.x * zoom + pan.x + ro, y1s = c.p1.y * zoom + pan.y + ro;
          const x2s = c.p2.x * zoom + pan.x + ro, y2s = c.p2.y * zoom + pan.y + ro;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={x1s} y1={y1s} x2={x2s} y2={y2s} stroke="#68d39188" strokeWidth={1.5} strokeDasharray="4 4" />
              <circle cx={x1s} cy={y1s} r={4} fill="#68d391" />
              <circle cx={x2s} cy={y2s} r={4} fill="#68d391" />
              <text x={(x1s+x2s)/2} y={Math.min(y1s,y2s)-7} textAnchor="middle" fontSize={10} fill="#68d391">
                ✓ Calibrated · ref {c.realDist}{c.unit}
              </text>
            </g>
          );
        })()}
        <text x={ro+8} y={1000-8} fontSize={9} fill="#4a6080">1:{meta?.scale||25} · Grid {formatLength(gridSize, meta?.units || 'mm')}</text>
      </svg>

      {editOverlay}

      {/* Dynamic numeric input — just start typing a dimension while drawing.
          Read-only display; the canvas keydown handler captures the digits. */}
      {drawingState && dynFieldsFor(drawingState.kind).length > 0 && (() => {
        const ds = drawingState;
        const units = meta?.units || 'mm';
        const fields = dynFieldsFor(ds.kind);
        const live = {
          length: formatLength(distance(ds.x1, ds.y1, ds.x2, ds.y2), units, { noUnit: true }),
          angle: (Math.atan2(-(ds.y2 - ds.y1), ds.x2 - ds.x1) * 180 / Math.PI).toFixed(1),
          width: formatLength(Math.abs(ds.x2 - ds.x1), units, { noUnit: true }),
          height: formatLength(Math.abs(ds.y2 - ds.y1), units, { noUnit: true }),
          radius: formatLength(distance(ds.x1, ds.y1, ds.x2, ds.y2), units, { noUnit: true }),
        };
        const suffix = { angle: '°', length: UNIT_LABELS[units] || units, width: UNIT_LABELS[units] || units, height: UNIT_LABELS[units] || units, radius: UNIT_LABELS[units] || units };
        const labels = { length: 'Length', angle: 'Angle', width: 'Width', height: 'Height', radius: 'Radius' };
        return (
          <div style={{ position: 'fixed', left: '50%', bottom: 44, transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(13,27,42,0.97)', border: '1px solid #4a90d9', borderRadius: 6, padding: '6px 12px', zIndex: 200, pointerEvents: 'none' }}>
            {fields.map((f, i) => {
              const typed = dynValsRef.current[f];
              const isActive = dynActiveRef.current === i;
              return (
                <span key={f} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: '#718096' }}>{labels[f]}</span>
                  <span style={{ minWidth: 46, textAlign: 'right', fontFamily: 'monospace', fontSize: 13,
                    color: typed ? '#e0e0e0' : '#5a7a9a',
                    borderBottom: `2px solid ${isActive ? '#4a90d9' : 'transparent'}`, padding: '0 3px' }}>
                    {typed || live[f]}{suffix[f]}
                  </span>
                </span>
              );
            })}
            <span style={{ fontSize: 10, color: '#4a5568' }}>{fields.length > 1 ? 'Tab · ' : ''}Enter ⏎</span>
          </div>
        );
      })()}

      {/* Scale calibration dialog */}
      {calibState?.showDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800 }}>
          <div style={{ background: '#16213e', border: '1px solid #0f3460', borderRadius: 8, padding: 20, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4a90d9', marginBottom: 12 }}>📐 Scale Calibration</div>
            <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 12 }}>
              Current span: <strong style={{ color: '#e0e0e0' }}>{formatLength(distance(calibState.p1.x, calibState.p1.y, calibState.p2.x, calibState.p2.y), meta?.units || 'mm')}</strong><br/>
              Enter the real-world measurement for this line:
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input autoFocus type="number" min="0.001" step="0.1"
                style={{ flex: 1, background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 3, color: '#e0e0e0', fontSize: 13, padding: '6px 8px', outline: 'none' }}
                value={calibDist} onChange={e => setCalibDist(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && calibDist) commitCalib(); if (e.key === 'Escape') setCalibState(null); e.stopPropagation(); }}
                placeholder="e.g. 10" />
              <select value={calibUnit} onChange={e => setCalibUnit(e.target.value)}
                style={{ background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 3, color: '#e0e0e0', fontSize: 13, padding: '6px 8px' }}>
                <option value="m">m</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
                <option value="ft">ft</option>
                <option value="in">in</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1, background: '#0f3460', border: '1px solid #4a90d9', borderRadius: 4, color: '#4a90d9', cursor: 'pointer', padding: '7px', fontSize: 12 }}
                onClick={commitCalib} disabled={!calibDist}>Set Scale</button>
              <button style={{ background: '#3a1a1a', border: '1px solid #7a2a2a', borderRadius: 4, color: '#fc8181', cursor: 'pointer', padding: '7px 14px', fontSize: 12 }}
                onClick={() => setCalibState(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', left: contextMenu.sx, top: contextMenu.sy, background: '#16213e', border: '1px solid #0f3460', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 999, minWidth: 170 }}
          onMouseLeave={() => setContextMenu(null)}>
          {contextMenu.hit.kind === 'fixture' && (<>
            <div style={ctxStyle.item} onClick={() => {
              setFocusModeId(contextMenu.hit.id);
              onSelect(contextMenu.hit);
              setContextMenu(null);
            }}>🎯 Set Focus Direction…</div>
            <div style={ctxStyle.sep}>Scale Fixture</div>
            {[
              { scope: 'one',  label: 'Scale This Fixture' },
              { scope: 'type', label: 'Scale All of Same Type' },
              { scope: 'all',  label: 'Scale All Fixtures' },
            ].map(({ scope, label }) => (
              <div key={scope} style={{ ...ctxStyle.item, paddingLeft: 20, color: scaleMode?.id === contextMenu.hit.id && scaleMode?.scope === scope ? '#7b61ff' : '#e0e0e0' }}
                onClick={() => {
                  setScaleMode({ id: contextMenu.hit.id, scope });
                  onSelect(contextMenu.hit);
                  setContextMenu(null);
                }}>{label}</div>
            ))}
            {(() => {
              const onPipeFixes = fixtures.filter(f => f.pipeId === contextMenu.hit.pipeId && contextMenu.hit.pipeId);
              const pipeObj = pipes.find(p => p.id === contextMenu.hit.pipeId);
              return onPipeFixes.length >= 2 && pipeObj ? (
                <div style={{ ...ctxStyle.item }} onClick={() => {
                  distributeOnPipe(contextMenu.hit.pipeId);
                  setContextMenu(null);
                }}>↔ Distribute on {pipeObj.name || 'Pipe'}</div>
              ) : null;
            })()}
            {(selectedIds?.length >= 3 && selectedIds.includes(contextMenu.hit.id)) && (
              <div style={ctxStyle.item} onClick={() => {
                distributeSelected();
                setContextMenu(null);
              }}>↔ Distribute Selected Evenly</div>
            )}
            {onSwapFixture && (
              <div style={ctxStyle.item} onClick={() => {
                const ids = selectedIds?.includes(contextMenu.hit.id) ? selectedIds : [contextMenu.hit.id];
                onSwapFixture(ids);
                setContextMenu(null);
              }}>🔄 Swap Fixture Type…</div>
            )}
            <div style={ctxStyle.item} onClick={() => {
              onDuplicateAlongPath?.(contextMenu.hit.id);
              setContextMenu(null);
            }}>↗ Duplicate Along Path…</div>
            <div style={ctxStyle.item} onClick={() => {
              setShowBeams(v => !v);
              setContextMenu(null);
            }}>{showBeams ? '🔦 Hide Beam Footprints' : '🔦 Show Beam Footprints'}</div>
          </>)}
          {contextMenu.hit.kind === 'pipe' && (
            <div style={ctxStyle.item} onClick={() => {
              distributeOnPipe(contextMenu.hit.id);
              setContextMenu(null);
            }}>↔ Distribute Fixtures Evenly</div>
          )}
          <div style={ctxStyle.item} onClick={() => {
            toggleLock(contextMenu.hit.id, contextMenu.hit.kind);
            setContextMenu(null);
          }}>
            {contextMenu.hit.locked ? '🔓 Unlock Object' : '🔒 Lock Object'}
          </div>
          {/* Send to Layer */}
          {(project.layers||[]).length > 0 && (
            <>
              <div style={ctxStyle.sep}>Send to Layer</div>
              {(project.layers||[]).map(l => (
                <div key={l.id} style={{ ...ctxStyle.item, paddingLeft: 20, display: 'flex', alignItems: 'center', gap: 7 }}
                  onClick={() => {
                    const { id, kind } = contextMenu.hit;
                    commitToDrawing(d => {
                      const arrMap = { fixture: d.fixtures, pipe: d.pipes, line: d.lines, rect: d.rectangles, text: d.texts, image: d.images||[], annotation: d.annotations||[] };
                      const arr = arrMap[kind]; if (arr) { const obj = arr.find(o => o.id === id); if (obj) obj.layerId = l.id; }
                    });
                    setContextMenu(null);
                  }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, display: 'inline-block', flexShrink: 0 }} />
                  {l.name}
                </div>
              ))}
            </>
          )}
          <div style={ctxStyle.sep}>Edit</div>
          <div style={ctxStyle.item} onClick={() => {
            const hit = contextMenu.hit;
            // If item is part of multi-select, copy all selected; otherwise just this one
            const ids = (selectedIds?.length && selectedIds.includes(hit.id))
              ? selectedIds
              : [hit.id];
            copySelection(ids);
            setContextMenu(null);
          }}>📋 Copy  <span style={{ color: '#4a5568', fontSize: 10, marginLeft: 4 }}>Ctrl+C</span></div>
          <div style={ctxStyle.item} onClick={() => {
            const hit = contextMenu.hit;
            const ids = (selectedIds?.length && selectedIds.includes(hit.id))
              ? selectedIds
              : [hit.id];
            const idSet = new Set(ids);
            const toDup = [
              ...fixtures.filter(f => idSet.has(f.id)).map(f => ({ ...f, _clipKind: 'fixture' })),
              ...pipes.filter(p => idSet.has(p.id)).map(p => ({ ...p, _clipKind: 'pipe' })),
              ...lines.filter(l => idSet.has(l.id)).map(l => ({ ...l, _clipKind: 'line' })),
              ...rectangles.filter(r => idSet.has(r.id)).map(r => ({ ...r, _clipKind: 'rect' })),
              ...texts.filter(t => idSet.has(t.id)).map(t => ({ ...t, _clipKind: 'text' })),
              ...annotations.filter(a => idSet.has(a.id)).map(a => ({ ...a, _clipKind: 'annotation' })),
            ];
            pasteObjects(toDup, 30, 30);
            setContextMenu(null);
          }}>⧉ Duplicate  <span style={{ color: '#4a5568', fontSize: 10, marginLeft: 4 }}>Ctrl+D</span></div>
          {clipboard?.length > 0 && (
            <div style={ctxStyle.item} onClick={() => {
              const off = 30 * pasteGeneration.current;
              pasteGeneration.current += 1;
              pasteObjects(clipboardRef.current, off, off);
              setContextMenu(null);
            }}>📌 Paste  <span style={{ color: '#4a5568', fontSize: 10, marginLeft: 4 }}>Ctrl+V</span></div>
          )}
          <div style={{ ...ctxStyle.item, borderTop: '1px solid #0f3460', color: '#fc8181' }} onClick={() => {
            commitToDrawing(d => {
              const id = contextMenu.hit.id;
              d.fixtures = d.fixtures.filter(f => f.id !== id);
              d.pipes = d.pipes.filter(p => p.id !== id);
              d.lines = d.lines.filter(l => l.id !== id);
              d.rectangles = d.rectangles.filter(r => r.id !== id);
              d.texts = d.texts.filter(t => t.id !== id);
              d.images = (d.images||[]).filter(i => i.id !== id);
              d.annotations = (d.annotations||[]).filter(a => a.id !== id);
            });
            onSelect(null);
            setContextMenu(null);
          }}>🗑 Delete</div>
        </div>
      )}
    </>
  );
}

const ctxStyle = {
  item: { padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#e0e0e0', transition: 'background 0.1s' },
  sep:  { padding: '4px 14px 2px', fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid #0f3460', marginTop: 2 },
};
