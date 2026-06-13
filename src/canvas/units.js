/**
 * Unit model — single source of truth for the relationship between the
 * canvas coordinate system and real-world measurements.
 *
 * CANONICAL INVARIANT: 1 world unit (wu) === 1 millimetre.
 *
 * Everything stored in a drawing (fixture x/y, pipe endpoints, line/rect
 * geometry, grid size) is in world units, i.e. millimetres. `meta.units`
 * is purely a DISPLAY choice — it changes how lengths are shown to the
 * user (mm / cm / m / ft / in) but never changes the stored geometry.
 *
 * Calibration's job is to make an imported background (or an un-scaled
 * drawing) conform to this invariant by rescaling pixels/geometry — after
 * calibration, 1 wu still equals 1 mm, so all measurement reads directly.
 */

export const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, ft: 304.8, in: 25.4 };
export const UNIT_LABELS = { mm: 'mm', cm: 'cm', m: 'm', ft: 'ft', in: 'in' };
export const UNIT_OPTIONS = ['mm', 'cm', 'm', 'ft', 'in'];

// World units ARE millimetres.
export function worldToMm(wu) { return wu; }
export function mmToWorld(mm) { return mm; }

// Default decimal places per display unit.
function defaultDp(units) {
  switch (units) {
    case 'mm': return 0;
    case 'cm': return 1;
    case 'm':  return 2;
    case 'ft': return 2;
    case 'in': return 1;
    default:   return 0;
  }
}

/**
 * Format a world-unit length in the chosen display unit.
 * e.g. formatLength(1372, 'ft') => "4.50ft", formatLength(1372, 'mm') => "1372mm"
 */
export function formatLength(wu, units = 'mm', opts = {}) {
  const mm = worldToMm(Math.abs(wu)) * (wu < 0 ? -1 : 1);
  const per = MM_PER_UNIT[units] || 1;
  const val = mm / per;
  const dp = opts.decimals != null ? opts.decimals : defaultDp(units);
  const num = val.toFixed(dp);
  return opts.noUnit ? num : `${num}${UNIT_LABELS[units] || units}`;
}

/** Format a coordinate pair for the cursor readout. */
export function formatCoord(wuX, wuY, units = 'mm') {
  return `${formatLength(wuX, units)}, ${formatLength(wuY, units)}`;
}

/** Numeric value only (for ruler ticks that append the unit once). */
export function toDisplayValue(wu, units = 'mm') {
  return worldToMm(wu) / (MM_PER_UNIT[units] || 1);
}
