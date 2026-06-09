/**
 * Cable routing — computes 2D display waypoints and estimates physical 3D length.
 *
 * Rules:
 *   - Items ON a pipe/truss → cable runs along the structure, then drops to floor.
 *   - Items at floor level  → cable routes directly along the floor.
 *   - User-inserted waypoints (userWaypoints) override the mid-section of the route.
 */

// ── Geometry helpers ────────────────────────────────────────────────────────

function dist2d(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/**
 * Returns the nearest point on segment [ax,ay]→[bx,by] to point [px,py].
 */
export function nearestOnSeg(px, py, ax, ay, bx, by) {
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
 * @param {Array}  structs       - array of pipe/truss objects [{id, x1, y1, x2, y2}]
 * @param {number} rigHeight     - trim height in world units (mm)
 * @param {number} gridHeight    - grid/ceiling height (mm)
 * @param {Array}  userWaypoints - user-inserted bend points [{x,y}] in world coords;
 *                                  these form the floor/ceiling run between drop points
 * @returns {{ waypoints, lengthMm, dropPoints, riseMm, dropMm }}
 */
export function calcCableRoute(from, to, structs, rigHeight = 5500, gridHeight = 6000, userWaypoints = null) {
  const fromStruct = from.onStructureId ? structs.find(p => p.id === from.onStructureId) : null;
  const toStruct   = to.onStructureId   ? structs.find(p => p.id === to.onStructureId)   : null;

  // Use per-pipe height (stored in metres) when available, fallback to global rigHeight
  const fromRigMm = (fromStruct && parseFloat(fromStruct.height) > 0) ? parseFloat(fromStruct.height) * 1000 : rigHeight;
  const toRigMm   = (toStruct   && parseFloat(toStruct.height)   > 0) ? parseFloat(toStruct.height)   * 1000 : rigHeight;

  const dropPoints = [];
  let waypoints    = [];
  let riseMm = 0, dropMm = 0;

  // User bend points for the floor/ceiling middle section
  const mid = userWaypoints && userWaypoints.length > 0 ? userWaypoints : [];

  if (fromStruct && toStruct && fromStruct.id === toStruct.id) {
    // ── Same structure: run along it ───────────────────────────────────────
    waypoints = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];

  } else if (fromStruct && !toStruct) {
    // ── From rig, to floor ─────────────────────────────────────────────────
    const drop = nearestOnSeg(to.x, to.y, fromStruct.x1, fromStruct.y1, fromStruct.x2, fromStruct.y2);
    dropPoints.push({ x: drop.x, y: drop.y });
    riseMm = gridHeight - fromRigMm;
    dropMm = gridHeight;
    waypoints = [
      { x: from.x, y: from.y },
      { x: drop.x, y: drop.y }, // along rig to drop
      { x: drop.x, y: drop.y }, // tick mark (duplicate = visual indicator)
      ...mid,
      { x: to.x, y: to.y },
    ];

  } else if (!fromStruct && toStruct) {
    // ── From floor, up to rig ─────────────────────────────────────────────
    const drop = nearestOnSeg(from.x, from.y, toStruct.x1, toStruct.y1, toStruct.x2, toStruct.y2);
    dropPoints.push({ x: drop.x, y: drop.y });
    riseMm = gridHeight;
    dropMm = gridHeight - toRigMm;
    waypoints = [
      { x: from.x, y: from.y },
      ...mid,
      { x: drop.x, y: drop.y }, // tick mark
      { x: drop.x, y: drop.y },
      { x: to.x, y: to.y },
    ];

  } else if (fromStruct && toStruct) {
    // ── Both on rig (different structures) ────────────────────────────────
    const dropF = nearestOnSeg(to.x, to.y, fromStruct.x1, fromStruct.y1, fromStruct.x2, fromStruct.y2);
    const dropT = nearestOnSeg(from.x, from.y, toStruct.x1, toStruct.y1, toStruct.x2, toStruct.y2);
    dropPoints.push({ x: dropF.x, y: dropF.y }, { x: dropT.x, y: dropT.y });
    riseMm = gridHeight - fromRigMm;
    dropMm = gridHeight - toRigMm;
    waypoints = [
      { x: from.x, y: from.y },
      { x: dropF.x, y: dropF.y },
      ...mid,
      { x: dropT.x, y: dropT.y },
      { x: to.x, y: to.y },
    ];

  } else {
    // ── Both on floor ─────────────────────────────────────────────────────
    waypoints = [{ x: from.x, y: from.y }, ...mid, { x: to.x, y: to.y }];
  }

  // Length = sum of 2D horizontal/diagonal segments + vertical rise/drop
  // Skip zero-length tick mark duplicates
  let length2D = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    length2D += dist2d(a.x, a.y, b.x, b.y);
  }

  return {
    waypoints,
    dropPoints,
    lengthMm: Math.round(length2D + riseMm + dropMm),
    riseMm:   Math.round(riseMm),
    dropMm:   Math.round(dropMm),
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
