/**
 * Elevation / section projection.
 *
 * The plot is a plan (x right, y down, millimetres) but pipes carry a height and
 * fixtures hang from them, so the rig is really 3D. This projects it onto a
 * vertical plane to get a front/side ELEVATION; an optional depth band turns it
 * into a SECTION (only what lies inside the slice is shown).
 *
 * Output is in view coordinates in millimetres: u = horizontal (to the viewer's
 * right), v = vertical with SVG orientation (v = -height, floor at v = 0), so it
 * can be dropped straight into the same viewport transform as a plan.
 *
 * The viewer faces a direction ON THE PLAN:
 *   'up'    faces the top edge  (north) — viewer's right is +x
 *   'down'  faces the bottom    (south) — right is -x
 *   'right' faces the right     (east)  — right is +y
 *   'left'  faces the left      (west)  — right is -y
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const ELEV_DIRS = {
  up:    { label: 'Facing top of plan ↑',    f: [0, -1], r: [1, 0] },
  down:  { label: 'Facing bottom of plan ↓', f: [0, 1],  r: [-1, 0] },
  right: { label: 'Facing right →',          f: [1, 0],  r: [0, 1] },
  left:  { label: 'Facing left ←',           f: [-1, 0], r: [0, -1] },
};
export const DEFAULT_ELEV_DIR = 'up';

/** Project a plan point to view coordinates: u (to the viewer's right) and depth (distance away from the viewer). */
export function projectPlan(x, y, dir = DEFAULT_ELEV_DIR) {
  const d = ELEV_DIRS[dir] || ELEV_DIRS[DEFAULT_ELEV_DIR];
  return { u: x * d.r[0] + y * d.r[1], depth: x * d.f[0] + y * d.f[1] };
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

// Typical body size (mm) for the elevation silhouette, by fixture type.
export function bodySize(type) {
  const k = `${type?.category || ''} ${type?.name || ''}`.toLowerCase();
  if (/moving|spot|beam|profile\s*moving/.test(k)) return { w: 320, h: 430 };
  if (/profile|ellips|source/.test(k)) return { w: 250, h: 420 };
  if (/fresnel|pc\b/.test(k)) return { w: 240, h: 300 };
  if (/par/.test(k)) return { w: 220, h: 260 };
  if (/flood|cyc/.test(k)) return { w: 330, h: 260 };
  if (/led|wash/.test(k)) return { w: 290, h: 300 };
  return { w: 250, h: 330 };
}

const YOKE_MM = 130;      // pipe underside to the body's trunnion
const PIPE_R_MM = 24;     // 48 mm barrel

/**
 * Apparent (projected) tilt of a fixture's axis and the apparent half-angle of
 * its beam cone, as seen by a viewer facing `dir`.
 * Fixture axis in 3D: tilt t from straight down, thrown toward the plan direction
 * given by `rotationDeg` (0° throws toward +y; see canvas/beam.js).
 */
export function apparentBeam({ tiltDeg = 0, rotationDeg = 0, beamDeg = 0 }, dir = DEFAULT_ELEV_DIR) {
  const d = ELEV_DIRS[dir] || ELEV_DIRS[DEFAULT_ELEV_DIR];
  const rot = (rotationDeg + 180) * RAD;
  const tx = Math.sin(rot), ty = -Math.cos(rot);                  // horizontal throw direction on the plan
  const t = tiltDeg * RAD;
  const along = Math.sin(t) * (tx * d.f[0] + ty * d.f[1]);        // axis component away from the viewer
  const side = Math.sin(t) * (tx * d.r[0] + ty * d.r[1]);         // axis component to the viewer's right
  const down = Math.cos(t);
  const alpha = Math.atan2(side, down) * DEG;                     // apparent angle from straight down, + toward the right
  const sinPhi = Math.sqrt(Math.max(0, 1 - along * along));       // phi = angle between axis and viewing direction
  const beta = (beamDeg / 2) * RAD;
  let half = null;
  if (beamDeg > 0) {
    // Cone outline seen at an angle: tan(gamma) = tan(beta) / sin(phi); a cone pointing at the viewer fans out wide.
    half = sinPhi <= Math.sin(beta) + 1e-6 ? 85 : Math.min(85, Math.atan(Math.tan(beta) / sinPhi) * DEG);
  }
  return { alphaDeg: alpha, halfDeg: half };
}

/**
 * Build the elevation / section model.
 * @param {object} drawing
 * @param {Array}  fixtureTypes
 * @param {object} meta  { rigHeight, gridHeight } (mm)
 * @param {{ dir?: string, band?: {min:number,max:number}|null, visible?: (obj:object, kind:string)=>boolean }} opts
 *        band is in depth coordinates (mm away from the viewer, see projectPlan).
 */
export function buildElevation(drawing, fixtureTypes = [], meta = {}, opts = {}) {
  const dir = ELEV_DIRS[opts.dir] ? opts.dir : DEFAULT_ELEV_DIR;
  const band = opts.band && Number.isFinite(opts.band.min) && Number.isFinite(opts.band.max)
    ? { min: Math.min(opts.band.min, opts.band.max), max: Math.max(opts.band.min, opts.band.max) } : null;
  const visible = opts.visible || (() => true);
  const rigMm = num(meta.rigHeight) ?? 5500;
  const gridMm = num(meta.gridHeight) ?? 6000;
  const types = new Map((fixtureTypes || []).map(t => [t.id, t]));
  const inBand = (a, b = a) => !band || (Math.max(a, b) >= band.min && Math.min(a, b) <= band.max);

  const pipeH = (p) => { const m = num(p.height); return m !== undefined && m > 0 ? m * 1000 : rigMm; };
  const pipesById = new Map((drawing.pipes || []).map(p => [p.id, p]));

  const pipes = [];
  for (const p of drawing.pipes || []) {
    if (!visible(p, 'pipe')) continue;
    const a = projectPlan(p.x1, p.y1, dir), b = projectPlan(p.x2, p.y2, dir);
    if (!inBand(a.depth, b.depth)) continue;
    const z = pipeH(p);
    pipes.push({
      id: p.id, name: p.name || '', type: p.type === 'truss' ? 'truss' : 'pipe', heightMm: z,
      u1: a.u, u2: b.u, v: -z, endOn: Math.abs(a.u - b.u) < 40, depth: (a.depth + b.depth) / 2,
    });
  }

  const fixtures = [];
  for (const f of drawing.fixtures || []) {
    if (!visible(f, 'fixture')) continue;
    const pr = projectPlan(f.x, f.y, dir);
    if (!inBand(pr.depth)) continue;
    const pipe = f.pipeId ? pipesById.get(f.pipeId) : null;
    const z = pipe ? pipeH(pipe) : rigMm;
    const type = types.get(f.fixtureTypeId);
    const body = bodySize(type);
    const beamDeg = num(f.beamAngle) ?? num(type?.beamAngle) ?? 0;
    const ab = apparentBeam({ tiltDeg: num(f.tiltAngle) ?? 0, rotationDeg: num(f.rotation) ?? 0, beamDeg }, dir);

    const P = { u: pr.u, v: -z + PIPE_R_MM };                         // clamp, under the pipe
    const T = { u: P.u, v: P.v + YOKE_MM };                            // trunnion
    const a = ab.alphaDeg * RAD;
    const axis = { u: Math.sin(a), v: Math.cos(a) };                   // throw direction in view (v down)
    const lens = { u: T.u + axis.u * body.h * 0.5, v: T.v + axis.v * body.h * 0.5 };

    let beam = null;
    if (ab.halfDeg != null) {
      const rays = [-1, 1].map(sgn => {
        const ang = a + sgn * ab.halfDeg * RAD;
        const du = Math.sin(ang), dv = Math.cos(ang);
        // Run to the floor (v = 0) when heading down, otherwise a short stub.
        const s = dv > 0.05 && lens.v < 0 ? Math.min(-lens.v / dv, 20000) : 2500;
        return { u: lens.u + du * s, v: lens.v + dv * s };
      });
      beam = { apex: lens, rays };
    }
    fixtures.push({
      id: f.id, u: pr.u, depth: pr.depth, P, T, lens, alphaDeg: ab.alphaDeg, bodyW: body.w, bodyH: body.h, beam,
      label: String(f.channel || f.unit || '').trim(), colourHex: f.colourHex && f.colourHex !== 'null' ? f.colourHex : null,
      type: f.type || type?.name || '',
    });
  }

  const infra = [];
  for (const i of drawing.infrastructure || []) {
    if (!visible(i, 'infra')) continue;
    const pr = projectPlan(i.x, i.y, dir);
    if (!inBand(pr.depth)) continue;
    infra.push({ id: i.id, u: pr.u, v: 0, depth: pr.depth, label: i.name || i.label || '' });
  }

  // Far objects first, so nearer ones paint over them.
  pipes.sort((a, b) => b.depth - a.depth);
  fixtures.sort((a, b) => b.depth - a.depth);

  const bounds = elevationBounds({ pipes, fixtures, infra }, { gridMm });
  return { dir, band, rigMm, gridMm, pipes, fixtures, infra, bounds, counts: { pipes: pipes.length, fixtures: fixtures.length } };
}

/** u/v extents of the model, with the floor and a little headroom. Null when empty. */
export function elevationBounds({ pipes = [], fixtures = [], infra = [] }, { gridMm = 6000 } = {}) {
  const us = [], vs = [0];
  pipes.forEach(p => { us.push(p.u1, p.u2); vs.push(p.v); });
  fixtures.forEach(f => {
    us.push(f.u - f.bodyW / 2, f.u + f.bodyW / 2, f.lens.u);
    vs.push(f.P.v, f.lens.v);
    if (f.beam) f.beam.rays.forEach(r => us.push(r.u));
  });
  infra.forEach(i => { us.push(i.u - 300, i.u + 300); vs.push(-600); });
  if (!us.length) return null;
  const minU = Math.min(...us), maxU = Math.max(...us);
  const minV = Math.min(...vs), maxV = 0;
  return { minU, maxU, minV: Math.min(minV, -Math.min(gridMm, -minV + 800)), maxV };
}
