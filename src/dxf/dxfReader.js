/**
 * Minimal ASCII DXF reader → plan geometry.
 *
 * Supported entities: LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE/VERTEX, ELLIPSE
 * (as a polyline), SPLINE (through fit/control points, as a polyline), TEXT,
 * MTEXT, and INSERT (block references, nested up to 4 levels, with translation,
 * rotation and scale). Everything else is counted in `skipped`.
 *
 * Output coordinates are millimetres with Y flipped (DXF is Y-up, the canvas is
 * Y-down), ready to drop into a drawing.
 */

// $INSUNITS → millimetres per drawing unit. 0 = unitless → assume millimetres.
const UNIT_TO_MM = { 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100 };
const UNIT_NAMES = { 0: 'unitless', 1: 'inches', 2: 'feet', 3: 'miles', 4: 'mm', 5: 'cm', 6: 'm', 10: 'yards', 14: 'dm' };

const rad = (d) => (d * Math.PI) / 180;

/** Raw group-code pairs. */
export function readPairs(text) {
  const lines = String(text).split(/\r\n|\n|\r/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (isNaN(code)) continue;
    pairs.push([code, lines[i + 1].replace(/\s+$/, '')]);
  }
  return pairs;
}

/** Split pairs into top-level entities: { type, pairs } (code 0 starts one). */
function splitEntities(pairs) {
  const out = []; let cur = null;
  for (const [c, v] of pairs) {
    if (c === 0) { cur = { type: v.trim(), pairs: [] }; out.push(cur); }
    else if (cur) cur.pairs.push([c, v]);
  }
  return out;
}

function sections(pairs) {
  // Returns { HEADER: [pairs], BLOCKS: [pairs], ENTITIES: [pairs] } (pairs between SECTION/ENDSEC)
  const out = {};
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      const name = pairs[i + 1][1].trim();
      let j = i + 2; const body = [];
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1].trim() === 'ENDSEC')) { body.push(pairs[j]); j++; }
      out[name] = body; i = j;
    }
  }
  return out;
}

const first = (pairs, code, d) => { const p = pairs.find(p => p[0] === code); return p ? p[1] : d; };
const firstNum = (pairs, code, d = 0) => { const p = pairs.find(p => p[0] === code); const n = p ? parseFloat(p[1]) : NaN; return isNaN(n) ? d : n; };
const all = (pairs, code) => pairs.filter(p => p[0] === code).map(p => parseFloat(p[1]));

function stripMtext(s) {
  return String(s)
    .replace(/\\P/gi, '\n')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')   // \fArial|b0;  \H2.5;  \C1; …
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\');
}

// Interpret one entity into primitives in its own coordinate space (DXF units, Y-up).
function interpret(e, vertexRun) {
  const p = e.pairs;
  switch (e.type) {
    case 'LINE':
      return [{ type: 'line', x1: firstNum(p, 10), y1: firstNum(p, 20), x2: firstNum(p, 11), y2: firstNum(p, 21) }];
    case 'CIRCLE':
      return [{ type: 'circle', cx: firstNum(p, 10), cy: firstNum(p, 20), r: firstNum(p, 40) }];
    case 'ARC':
      return [{ type: 'arc', cx: firstNum(p, 10), cy: firstNum(p, 20), r: firstNum(p, 40), a0: firstNum(p, 50), a1: firstNum(p, 51) }];
    case 'LWPOLYLINE': {
      const xs = all(p, 10), ys = all(p, 20);
      const pts = xs.map((x, i) => ({ x, y: ys[i] })).filter(pt => !isNaN(pt.y));
      return pts.length > 1 ? [{ type: 'poly', pts, closed: (firstNum(p, 70, 0) & 1) === 1 }] : [];
    }
    case 'POLYLINE': {
      const pts = (vertexRun || []).map(v => ({ x: firstNum(v.pairs, 10), y: firstNum(v.pairs, 20) }));
      return pts.length > 1 ? [{ type: 'poly', pts, closed: (firstNum(p, 70, 0) & 1) === 1 }] : [];
    }
    case 'ELLIPSE': {
      const cx = firstNum(p, 10), cy = firstNum(p, 20), mx = firstNum(p, 11), my = firstNum(p, 21);
      const ratio = firstNum(p, 40, 1), t0 = firstNum(p, 41, 0), t1 = firstNum(p, 42, Math.PI * 2);
      const major = Math.hypot(mx, my), ang = Math.atan2(my, mx);
      let sweep = t1 - t0; if (sweep <= 0) sweep += Math.PI * 2;
      const n = Math.max(12, Math.ceil(48 * sweep / (Math.PI * 2)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + (sweep * i) / n;
        const ex = major * Math.cos(t), ey = major * ratio * Math.sin(t);
        pts.push({ x: cx + ex * Math.cos(ang) - ey * Math.sin(ang), y: cy + ex * Math.sin(ang) + ey * Math.cos(ang) });
      }
      const full = Math.abs(sweep - Math.PI * 2) < 1e-6;
      if (full) pts.pop();
      return [{ type: 'poly', pts, closed: full }];
    }
    case 'SPLINE': {
      const fx = all(p, 11), fy = all(p, 21);
      const xs = fx.length ? fx : all(p, 10), ys = fx.length ? fy : all(p, 20);
      const pts = xs.map((x, i) => ({ x, y: ys[i] })).filter(pt => !isNaN(pt.y));
      return pts.length > 1 ? [{ type: 'poly', pts, closed: (firstNum(p, 70, 0) & 1) === 1 }] : [];
    }
    case 'TEXT': case 'MTEXT': {
      const raw = (e.type === 'MTEXT' ? p.filter(x => x[0] === 3 || x[0] === 1).map(x => x[1]).join('') : first(p, 1, ''));
      const str = (e.type === 'MTEXT' ? stripMtext(raw) : raw).trim();
      if (!str) return [];
      return [{ type: 'text', x: firstNum(p, 10), y: firstNum(p, 20), h: firstNum(p, 40, 2.5) || 2.5, str, rot: firstNum(p, 50, 0) }];
    }
    default:
      return null;   // unsupported (caller counts it)
  }
}

// ── Transforms (for INSERT) ─────────────────────────────────────────────────
function xf(pt, m) {
  const x = (pt.x - m.bx) * m.sx, y = (pt.y - m.by) * m.sy;
  const c = Math.cos(rad(m.rot)), s = Math.sin(rad(m.rot));
  return { x: m.tx + x * c - y * s, y: m.ty + x * s + y * c };
}
function arcToPoly(a) {
  let sweep = a.a1 - a.a0; while (sweep <= 0) sweep += 360;
  const n = Math.max(6, Math.ceil(sweep / 7.5));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = rad(a.a0 + (sweep * i) / n); pts.push({ x: a.cx + a.r * Math.cos(t), y: a.cy + a.r * Math.sin(t) }); }
  return { type: 'poly', pts, closed: false };
}
function transformPrim(pr, m) {
  const sAbs = Math.abs(m.sx);
  switch (pr.type) {
    case 'line': { const a = xf({ x: pr.x1, y: pr.y1 }, m), b = xf({ x: pr.x2, y: pr.y2 }, m); return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
    case 'poly': return { ...pr, pts: pr.pts.map(pt => xf(pt, m)) };
    case 'circle': { const c = xf({ x: pr.cx, y: pr.cy }, m); return { type: 'circle', cx: c.x, cy: c.y, r: pr.r * sAbs }; }
    case 'arc': {
      if (m.sx * m.sy < 0 || Math.abs(Math.abs(m.sx) - Math.abs(m.sy)) > 1e-9) return transformPrim(arcToPoly(pr), m);
      const c = xf({ x: pr.cx, y: pr.cy }, m);
      return { type: 'arc', cx: c.x, cy: c.y, r: pr.r * sAbs, a0: pr.a0 + m.rot, a1: pr.a1 + m.rot };
    }
    case 'text': { const t = xf({ x: pr.x, y: pr.y }, m); return { ...pr, x: t.x, y: t.y, h: pr.h * sAbs, rot: pr.rot + m.rot }; }
    default: return pr;
  }
}

/**
 * Parse DXF text.
 * @returns {{ prims: object[], units: number, unitName: string, unitsKnown: boolean, scale: number, skipped: Record<string, number> }}
 */
export function parseDXF(text) {
  const pairs = readPairs(text);
  const sec = sections(pairs);

  // Units
  let units = 0;
  const h = sec.HEADER || [];
  for (let i = 0; i < h.length; i++) if (h[i][0] === 9 && h[i][1].trim() === '$INSUNITS' && h[i + 1]) units = parseInt(h[i + 1][1], 10) || 0;
  const scale = UNIT_TO_MM[units] ?? 1;

  // Blocks
  const blocks = {};
  const blockEnts = splitEntities(sec.BLOCKS || []);
  let curBlock = null;
  for (const e of blockEnts) {
    if (e.type === 'BLOCK') { curBlock = { name: first(e.pairs, 2, ''), bx: firstNum(e.pairs, 10), by: firstNum(e.pairs, 20), ents: [] }; blocks[curBlock.name] = curBlock; }
    else if (e.type === 'ENDBLK') curBlock = null;
    else if (curBlock) curBlock.ents.push(e);
  }

  const skipped = {};
  const skip = (t) => { skipped[t] = (skipped[t] || 0) + 1; };

  function expand(ents, depth) {
    const out = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.type === 'POLYLINE') {
        const run = []; let j = i + 1;
        while (j < ents.length && ents[j].type === 'VERTEX') { run.push(ents[j]); j++; }
        if (ents[j]?.type === 'SEQEND') j++;
        out.push(...(interpret(e, run) || []));
        i = j - 1; continue;
      }
      if (e.type === 'INSERT') {
        const b = blocks[first(e.pairs, 2, '')];
        if (!b || depth >= 4) { skip('INSERT'); continue; }
        const m = {
          tx: firstNum(e.pairs, 10), ty: firstNum(e.pairs, 20), sx: firstNum(e.pairs, 41, 1) || 1, sy: firstNum(e.pairs, 42, 1) || 1,
          rot: firstNum(e.pairs, 50, 0), bx: b.bx, by: b.by,
        };
        out.push(...expand(b.ents, depth + 1).map(pr => transformPrim(pr, m)));
        continue;
      }
      if (e.type === 'VERTEX' || e.type === 'SEQEND') continue;
      const prims = interpret(e);
      if (prims === null) skip(e.type); else out.push(...prims);
    }
    return out;
  }

  const prims = expand(splitEntities(sec.ENTITIES || pairs), 0);
  return { prims, units, unitName: UNIT_NAMES[units] || `code ${units}`, unitsKnown: units !== 0, scale, skipped };
}

/** Convert parsed primitives to drawing objects (mm, Y flipped). `newId()` supplies ids. */
export function dxfToDrawingObjects(parsed, { layerId = 'layer-arch', newId, scale } = {}) {
  const k = scale ?? parsed.scale ?? 1;
  const id = newId || (() => Math.random().toString(36).slice(2));
  const out = { lines: [], circles: [], arcs: [], polylines: [], texts: [] };
  const P = (x, y) => ({ x: x * k, y: -y * k });
  for (const pr of parsed.prims) {
    switch (pr.type) {
      case 'line': { const a = P(pr.x1, pr.y1), b = P(pr.x2, pr.y2); out.lines.push({ id: id(), kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, layerId }); break; }
      case 'circle': { const c = P(pr.cx, pr.cy); out.circles.push({ id: id(), kind: 'circle', cx: c.x, cy: c.y, r: pr.r * k, layerId }); break; }
      case 'arc': {
        const c = P(pr.cx, pr.cy);
        // CCW in Y-up becomes a positive sweep from -end to -start once Y is flipped.
        out.arcs.push({ id: id(), kind: 'arc', cx: c.x, cy: c.y, r: pr.r * k, a0: -rad(pr.a1), a1: -rad(pr.a0), layerId });
        break;
      }
      case 'poly': out.polylines.push({ id: id(), kind: 'polyline', points: pr.pts.map(pt => P(pt.x, pt.y)), closed: !!pr.closed, layerId }); break;
      case 'text': {
        const t = P(pr.x, pr.y);
        const o = { id: id(), kind: 'text', x: t.x, y: t.y, label: pr.str, fontSize: Math.max(2, Math.round(pr.h * k)), layerId };
        if (pr.rot) o.rotation = -pr.rot;
        out.texts.push(o); break;
      }
      default: break;
    }
  }
  return out;
}

export function countObjects(o) { return o.lines.length + o.circles.length + o.arcs.length + o.polylines.length + o.texts.length; }
