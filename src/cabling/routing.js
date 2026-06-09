/**
 * Cable routing — computes 2D display waypoints and estimates physical 3D length.
 *
 * Rules:
 *   • Items ON a pipe/truss → cable runs along the structure, then drops to floor.
 *     Drop height = rigHeight (rig trim) → 0 (floor).
 *   • Items at floor level  → cable routes directly along the floor.
 *   • Network switches/ports snapped to a pipe are treated the same as items on a pipe.
 *
 * The 2D waypoints array drives both the SVG display line and the animation path.
 */

// ── Geometry helpers ────────────────────────────────────────────────────────

function dist2d(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/**
 * Returns the nearest point on segment [ax,ay]→[bx,by] to point [px,py].
 */
function nearestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Calculate cable route.
 *
 * @param {{ x:number, y:number, onStructureId:string|null }} from
 * @param {{ x:number, y:number, onStructureId:string|null }} to
 * @param {Array}  structs    - array of pipe/truss objects [{id, x1, y1, x2, y2}]
 * @param {number} rigHeight  - trim height in world units (mm), height of trusses
 * @param {number} gridHeight - grid/ceiling height (mm), cables route up to this before dropping
 * @returns {{ waypoints, lengthMm, dropPoints, riseMm, dropMm }}
 *   riseMm / dropMm are the vertical components for the Cable Drop column in reports.
 */
export function calcCableRoute(from, to, structs, rigHeight = 5500, gridHeight = 6000) {
  const fromStruct = from.onStructureId ? structs.find(p => p.id === from.onStructureId) : null;
  const toStruct   = to.onStructureId   ? structs.find(p => p.id === to.onStructureId)   : null;

  const waypoints  = [];
  const dropPoints = [];   // {x,y} where cable drops from rig — drawn as tick marks
  let length = 0;
  let riseMm = 0;   // upward vertical component (for Cable Drop report column)
  let dropMm = 0;   // downward vertical component

  // Cable routing uses gridHeight as the ceiling level through which cables travel.
  // Fixtures on a truss are at rigHeight; floor items are at 0.
  // Route: item_at_height → up to gridHeight → horizontal → down to dest_height.

  if (fromStruct && toStruct && fromStruct.id === toStruct.id) {
    // ── Same structure: run along it ───────────────────────────────────────
    waypoints.push({ x: from.x, y: from.y });
    waypoints.push({ x: to.x,   y: to.y });
    length = dist2d(from.x, from.y, to.x, to.y);

  } else if (fromStruct && !toStruct) {
    // ── From rig, to floor ─────────────────────────────────────────────────
    // Cable leaves fixture at rigHeight, rises to gridHeight, drops to floor (0)
    const drop = nearestOnSeg(to.x, to.y, fromStruct.x1, fromStruct.y1, fromStruct.x2, fromStruct.y2);
    waypoints.push({ x: from.x,  y: from.y });
    waypoints.push({ x: drop.x,  y: drop.y });  // along rig
    waypoints.push({ x: drop.x,  y: drop.y });  // drop tick
    waypoints.push({ x: to.x,    y: to.y });    // floor run
    dropPoints.push({ x: drop.x, y: drop.y });
    riseMm = gridHeight - rigHeight;             // rise from rig level up to ceiling grid
    dropMm = gridHeight;                         // drop from ceiling grid down to floor
    length = dist2d(from.x, from.y, drop.x, drop.y) // along rig
           + riseMm + dropMm                          // vertical: up to grid, then down to floor
           + dist2d(drop.x, drop.y, to.x, to.y);     // floor run to dest

  } else if (!fromStruct && toStruct) {
    // ── From floor, up to rig ─────────────────────────────────────────────
    // Cable leaves floor (0), rises to gridHeight, drops to rigHeight
    const drop = nearestOnSeg(from.x, from.y, toStruct.x1, toStruct.y1, toStruct.x2, toStruct.y2);
    waypoints.push({ x: from.x,  y: from.y });
    waypoints.push({ x: drop.x,  y: drop.y });  // floor run
    waypoints.push({ x: drop.x,  y: drop.y });  // rise tick
    waypoints.push({ x: to.x,    y: to.y });    // along rig
    dropPoints.push({ x: drop.x, y: drop.y });
    riseMm = gridHeight;                         // rise from floor up to ceiling grid
    dropMm = gridHeight - rigHeight;             // drop from ceiling grid down to rig
    length = dist2d(from.x, from.y, drop.x, drop.y)
           + riseMm + dropMm
           + dist2d(drop.x, drop.y, to.x, to.y);

  } else if (fromStruct && toStruct) {
    // ── Both on rig (different structures) ────────────────────────────────
    const dropF = nearestOnSeg(to.x, to.y, fromStruct.x1, fromStruct.y1, fromStruct.x2, fromStruct.y2);
    const dropT = nearestOnSeg(from.x, from.y, toStruct.x1, toStruct.y1, toStruct.x2, toStruct.y2);
    waypoints.push({ x: from.x,   y: from.y });
    waypoints.push({ x: dropF.x,  y: dropF.y });
    waypoints.push({ x: dropT.x,  y: dropT.y });
    waypoints.push({ x: to.x,     y: to.y });
    dropPoints.push({ x: dropF.x, y: dropF.y });
    dropPoints.push({ x: dropT.x, y: dropT.y });
    riseMm = gridHeight - rigHeight;  // up from first rig to grid
    dropMm = gridHeight - rigHeight;  // down from grid to second rig
    length = dist2d(from.x, from.y, dropF.x, dropF.y)
           + (gridHeight - rigHeight)                          // up from first rig
           + dist2d(dropF.x, dropF.y, dropT.x, dropT.y)      // horizontal at ceiling
           + (gridHeight - rigHeight)                          // down to second rig
           + dist2d(dropT.x, dropT.y, to.x, to.y);

  } else {
    // ── Both on floor ─────────────────────────────────────────────────────
    waypoints.push({ x: from.x, y: from.y });
    waypoints.push({ x: to.x,   y: to.y });
    length = dist2d(from.x, from.y, to.x, to.y);
  }

  return {
    waypoints,
    dropPoints,
    lengthMm: Math.round(length),
    riseMm: Math.round(riseMm),
    dropMm: Math.round(dropMm),
  };
}

/**
 * Find which pipe/truss a world point is closest to, within snapRadius.
 */
export function findNearestStructure(x, y, structs, snapRadius = 25) {
  let best = null, bestDist = Infinity;
  for (const p of structs) {
    const near = nearestOnSeg(x, y, p.x1, p.y1, p.x2, p.y2);
    const d = dist2d(x, y, near.x, near.y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return bestDist <= snapRadius ? best : null;
}

/**
 * Build an SVG polyline points string from waypoints.
 */
export function waypointsToPoints(waypoints) {
  return waypoints.map(p => `${p.x},${p.y}`).join(' ');
}

/**
 * Format mm length as human-readable string.
 */
export function formatLength(mm) {
  if (!mm || mm <= 0) return '—';
  if (mm < 1000) return `${mm}mm`;
  if (mm < 10000) return `${(mm / 1000).toFixed(1)}m`;
  return `${Math.round(mm / 1000)}m`;
}

/**
 * Convert waypoints to an SVG path `d` string for animateMotion.
 */
export function waypointsToPath(waypoints) {
  if (!waypoints || waypoints.length < 2) return '';
  return waypoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');
}
