/**
 * Beam footprint geometry — where a fixture's light cone lands on the floor.
 *
 * Same model the 2D canvas uses for its beam overlay: the fixture hangs at
 * `height` mm above the floor, `tiltDeg` 0 = straight down, positive tilts toward
 * the front of the symbol. The cone's leading/trailing rays hit the floor at the
 * near and far distances, giving a true ellipse (not a circle) once tilted.
 */

const CAP = 1.4835;   // ~85°: stop a grazing beam shooting to infinity
const clamp = (a) => Math.max(-CAP, Math.min(CAP, a));
const RAD = Math.PI / 180;

/**
 * @returns {null | { dirX, dirY, nearDist, farDist, centreDist, rMajor, rMinor, cx, cy }}
 *   cx/cy = footprint centre relative to the fixture (plan view, mm, Y down).
 */
export function beamFootprint({ beamDeg, tiltDeg = 0, rotationDeg = 0, height }) {
  const half = ((beamDeg || 0) / 2) * RAD;
  if (!(half > 0) || !(height > 0)) return null;
  const tilt = tiltDeg * RAD;
  const nearDist = height * Math.tan(clamp(tilt - half));
  const farDist = height * Math.tan(clamp(tilt + half));
  const centreDist = (nearDist + farDist) / 2;
  const rMajor = Math.abs(farDist - nearDist) / 2;
  const rMinor = (height / Math.cos(clamp(Math.abs(tilt)))) * Math.tan(half);
  // Symbols throw toward +Y (down the plan) at rotation 0, hence the +180.
  const rot = (rotationDeg + 180) * RAD;
  const dirX = Math.sin(rot), dirY = -Math.cos(rot);
  return { dirX, dirY, nearDist, farDist, centreDist, rMajor, rMinor, cx: centreDist * dirX, cy: centreDist * dirY };
}

/** Points around the floor ellipse, relative to the fixture. */
export function footprintPolygon(fp, n = 32) {
  if (!fp) return [];
  const px = -fp.dirY, py = fp.dirX;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const a = fp.rMajor * Math.cos(t), b = fp.rMinor * Math.sin(t);
    pts.push({ x: fp.cx + fp.dirX * a + px * b, y: fp.cy + fp.dirY * a + py * b });
  }
  return pts;
}
