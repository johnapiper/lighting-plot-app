// ── Lighting plan symbol catalogue ───────────────────────────────────────────
// Plan-view symbols in the style of the ESTA / USITT lighting graphics
// conventions: stepped Fresnel lens, ERS barrel with shutter handles,
// barn-door leaves, PAR can with lens ring, scoop bowl, cyc/strip
// compartments, moving-head yoke and so on.
//
// Orientation: origin (0,0) is the fixture centre. The hanging / clamp stub is
// at the top (-y, "back" of the unit) and the lens faces +y (toward the
// stage / viewer). All strokes use currentColor so symbols follow fixture
// colour, selection highlight and theming.

const S = 'currentColor';
const line = (x1, y1, x2, y2, w = 1.5) =>
  `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}' stroke='${S}' stroke-width='${w}' stroke-linecap='round'/>`;
const circ = (cx, cy, r, w = 1.5, fill = 'none') =>
  `<circle cx='${cx}' cy='${cy}' r='${r}' fill='${fill === 'solid' ? S : fill}' stroke='${fill === 'solid' ? 'none' : S}' stroke-width='${w}'/>`;
const dot = (cx, cy, r = 1.6) => circ(cx, cy, r, 0, 'solid');
const ell = (cx, cy, rx, ry, w = 1.5) =>
  `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='none' stroke='${S}' stroke-width='${w}'/>`;
const rect = (x, y, w, h, rx = 0, sw = 1.5) =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${rx}' fill='none' stroke='${S}' stroke-width='${sw}'/>`;
const path = (d, w = 1.5, fill = 'none') =>
  `<path d='${d}' fill='${fill}' stroke='${S}' stroke-width='${w}' stroke-linejoin='round' stroke-linecap='round'/>`;
const scaled = (k, inner) => `<g transform='scale(${k})'>${inner}</g>`;

// Barn doors: the two side leaves swing out in an open "V" from the front
// of the unit, with the top/bottom leaves seen edge-on as a bar across it.
// `y` is the front face of the fixture, `half` its half-width.
const barnDoors = (y, half, spread = 6, len = 8) =>
  line(-half, y, half, y, 1) +
  line(-half, y, -half - spread, y + len, 2) +
  line(half, y, half + spread, y + len, 2) +
  line(-half - spread, y + len, -half - spread + 2.5, y + len - 3.5, 1) +
  line(half + spread, y + len, half + spread - 2.5, y + len - 3.5, 1);

// ── Individual symbol bodies ─────────────────────────────────────────────────

// Ellipsoidal reflector spot (ERS / profile): narrow lamp housing, wider lens
// tube, convex lens, gate slot and two shutter handles.
const profileBody = (extra = '') =>
  line(0, -25, 0, -18) +
  path('M-7,-18 L7,-18 L7,-4 L10,-4 L10,12 L-10,12 L-10,-4 L-7,-4 Z') +
  path('M-8,12 Q0,18 8,12', 1.2) +
  line(-10, 3, 10, 3, 0.9) +
  line(-10, 6, -16, 6, 1.6) + dot(-16.5, 6, 1.6) +
  line(10, 6, 16, 6, 1.6) + dot(16.5, 6, 1.6) +
  extra;

// Fresnel: tapered body, stepped (concentric) lens.
const fresnelBody = () =>
  line(0, -25, 0, -16) +
  path('M-6,-16 L6,-16 L11,6 L-11,6 Z') +
  path('M-11,6 Q0,14 11,6', 1.4) +
  path('M-7,6.5 Q0,11 7,6.5', 1) +
  path('M-3,7 Q0,8.5 3,7', 0.8);

// Plano-convex (PC) / traditional spot: parallel-sided tube, one convex lens.
const pcBody = () =>
  line(0, -25, 0, -16) +
  path('M-7,-16 L7,-16 L7,-6 L11,-6 L11,6 L-11,6 L-11,-6 L-7,-6 Z') +
  path('M-9,6 Q0,15 9,6', 1.4) +
  line(-11, 6, 11, 6, 1.4);

// PAR can: short cylinder, lens ring and lamp filament lines.
const parBody = (w = 9) =>
  line(0, -25, 0, -17) +
  path(`M${-w},-17 L${w},-17 L${w},8 L${-w},8 Z`) +
  ell(0, 8, w, 3.2, 1.4) +
  line(-w + 3, -9, -w + 3, 5, 1) +
  line(w - 3, -9, w - 3, 5, 1) +
  line(0, -9, 0, 5, 1);

// Moving head: fork yoke, round head with lens, base.
const movingBody = (lensDetail) =>
  rect(-8, -22, 16, 6, 1.5, 1.4) +
  path('M-12,-16 L-12,10 M12,-16 L12,10 M-12,-16 L12,-16', 1.5) +
  circ(0, 0, 9, 1.5) +
  circ(0, 0, 5.5, 1) +
  lensDetail +
  dot(-12, -3, 1.4) + dot(12, -3, 1.4);

const blinderCells = (n, spacing, r, y = 0) => {
  let out = '';
  const start = -((n - 1) * spacing) / 2;
  for (let i = 0; i < n; i++) out += circ(start + i * spacing, y, r, 1.2) + dot(start + i * spacing, y, 1.2);
  return out;
};

// ── The catalogue ────────────────────────────────────────────────────────────

export const SYMBOL_CATALOGUE = [
  // Profiles / ERS
  { id: 'S4Profile', label: 'ETC S4 Profile',
    symbol: profileBody(line(-10, -4, 10, -4, 1.6)),
    symbolViewBox: '-20 -27 40 48' },
  { id: 'S4Jr', label: 'ETC S4 Jr',
    symbol: scaled(0.82, profileBody()),
    symbolViewBox: '-16 -22 32 40' },
  { id: 'Profile', label: 'Profile / ERS',
    symbol: profileBody(),
    symbolViewBox: '-20 -27 40 48' },
  { id: 'ProfileBD', label: 'Profile + Barn Doors',
    symbol: profileBody(barnDoors(12, 10, 6, 8)),
    symbolViewBox: '-20 -27 40 56' },

  // Fresnel / PC / spot
  { id: 'Fresnel', label: 'Fresnel',
    symbol: fresnelBody(),
    symbolViewBox: '-20 -27 40 46' },
  { id: 'FresnelBD', label: 'Fresnel + Barn Doors',
    symbol: fresnelBody() + barnDoors(9, 11, 6, 9),
    symbolViewBox: '-20 -27 40 56' },
  { id: 'PcSpot', label: 'PC Spot',
    symbol: pcBody(),
    symbolViewBox: '-20 -27 40 46' },
  { id: 'PcBD', label: 'PC + Barn Doors',
    symbol: pcBody() + barnDoors(9, 11, 6, 9),
    symbolViewBox: '-20 -27 40 56' },
  { id: 'Spot', label: 'Spot (traditional)',
    symbol: line(0, -25, 0, -14) + path('M-9,-14 L9,-14 L9,8 L-9,8 Z') + line(-9, 8, 9, 8, 1.4) + path('M-6,8 Q0,14 6,8', 1.2) + line(-9, -3, 9, -3, 0.9),
    symbolViewBox: '-18 -27 36 44' },

  // PARs
  { id: 'S4Par', label: 'ETC S4 PAR',
    symbol: parBody(9) + circ(0, -1, 2, 1),
    symbolViewBox: '-18 -27 36 42' },
  { id: 'Par64', label: 'PAR 64',
    symbol: parBody(10),
    symbolViewBox: '-20 -27 40 42' },
  { id: 'Par64BD', label: 'PAR 64 + Barn Doors',
    symbol: parBody(10) + barnDoors(10, 10, 6, 8),
    symbolViewBox: '-20 -27 40 54' },
  { id: 'Par36', label: 'PAR 36 / Birdie',
    symbol: scaled(0.7, parBody(10)),
    symbolViewBox: '-14 -20 28 30' },

  // LED / wash
  { id: 'Wash', label: 'Wash / LED Par',
    symbol: line(0, -25, 0, -17) + path('M-9,-17 L9,-17 L9,8 L-9,8 Z') + ell(0, 8, 9, 3.2, 1.4) +
            circ(0, -2, 5.5, 1) + dot(0, -2, 1.4) + dot(-3.4, -5, 1.2) + dot(3.4, -5, 1.2) + dot(-3.4, 1, 1.2) + dot(3.4, 1, 1.2),
    symbolViewBox: '-18 -27 36 42' },
  { id: 'LedBar', label: 'LED Bar',
    symbol: line(0, -13, 0, -7) + rect(-26, -7, 52, 14, 2, 1.5) +
            [-20, -10, 0, 10, 20].map(x => circ(x, 0, 3.4, 1) + dot(x, 0, 1)).join(''),
    symbolViewBox: '-30 -15 60 30' },
  { id: 'Strip', label: 'Strip / Batten',
    symbol: line(0, -13, 0, -7) + rect(-28, -7, 56, 16, 1.5, 1.5) +
            line(-14, -7, -14, 9, 1) + line(0, -7, 0, 9, 1) + line(14, -7, 14, 9, 1) +
            [-21, -7, 7, 21].map(x => path(`M${x - 4},9 Q${x},2 ${x + 4},9`, 1)).join(''),
    symbolViewBox: '-32 -15 64 28' },

  // Beam / pinspot
  { id: 'Beam', label: 'Beam / ACL',
    symbol: line(0, -22, 0, -12) + path('M-5,-12 L5,-12 L5,10 L-5,10 Z') + line(-5, 10, 5, 10, 1.4) +
            path('M-3.5,10 Q0,14 3.5,10', 1.1) + line(-5, 0, 5, 0, 0.9),
    symbolViewBox: '-12 -24 24 40' },

  // Floods / scoops / cycs
  { id: 'Scoop', label: 'Scoop',
    symbol: line(0, -23, 0, -2) + path('M-14,-2 A14,14 0 0 0 14,-2', 1.6) + line(-14, -2, 14, -2, 1.6) +
            path('M-9,-2 A9,9 0 0 0 9,-2', 0.9) + dot(0, -2, 1.8),
    symbolViewBox: '-18 -25 36 44' },
  { id: 'Flood', label: 'Flood / Blinder',
    symbol: line(0, -22, 0, -14) + rect(-14, -14, 28, 24, 2, 1.5) + circ(0, -2, 7, 1.2) + circ(0, -2, 3, 1) + dot(0, -2, 1.2),
    symbolViewBox: '-18 -24 36 38' },
  { id: 'CycLight', label: 'Cyc / Ground Row',
    symbol: line(0, -22, 0, -12) + path('M-14,-12 L14,-12 L14,6 L0,12 L-14,6 Z') +
            line(-14, 6, 14, 6, 1) + path('M-9,6 L0,10 L9,6', 0.9) + line(0, -12, 0, 6, 0.8),
    symbolViewBox: '-18 -24 36 40' },
  { id: 'Blinder', label: 'Blinder',
    symbol: line(0, -20, 0, -10) + rect(-16, -10, 32, 20, 2, 1.5) + blinderCells(2, 14, 5.5, 0),
    symbolViewBox: '-20 -22 40 36' },

  // Moving lights
  { id: 'MovingHead', label: 'Moving Head (Profile)',
    symbol: movingBody(line(-3, 0, 3, 0, 1) + line(0, -3, 0, 3, 1)),
    symbolViewBox: '-18 -26 36 40' },
  { id: 'MovingWash', label: 'Moving Wash',
    symbol: movingBody(dot(-2.4, -2.4, 1) + dot(2.4, -2.4, 1) + dot(-2.4, 2.4, 1) + dot(2.4, 2.4, 1)),
    symbolViewBox: '-18 -26 36 40' },

  // Followspot
  { id: 'Followspot', label: 'Followspot',
    symbol: line(0, -26, 0, -18) + path('M-6,-18 L6,-18 L6,-6 L9,-6 L9,12 L-9,12 L-9,-6 L-6,-6 Z') +
            path('M-7,12 Q0,18 7,12', 1.2) + line(-9, 4, -15, 4, 1.6) + dot(-15.5, 4, 1.6) +
            circ(0, 0, 3, 1) + line(9, -2, 15, -2, 1.2) + line(15, -2, 15, 4, 1.2),
    symbolViewBox: '-20 -28 40 50' },

  // Effects
  { id: 'Hazer', label: 'Hazer / Fogger',
    symbol: rect(-14, -10, 28, 20, 3, 1.5) + path('M-8,-3 Q-5,-7 -2,-3 T4,-3 T10,-3', 1) + path('M-8,3 Q-5,-1 -2,3 T4,3 T10,3', 1) + line(0, 10, 0, 18, 1.5),
    symbolViewBox: '-18 -14 36 36' },

  // Fallback
  { id: 'Generic', label: 'Generic',
    symbol: line(0, -22, 0, -14) + circ(0, 0, 14, 1.5) + line(-14, 8, 14, 8, 1.2),
    symbolViewBox: '-20 -24 40 42' },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOL_CATALOGUE.map(s => [s.id, s]));
