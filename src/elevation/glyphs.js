/**
 * Side-view fixture silhouettes for elevation drawings.
 *
 * Each glyph is built in the fixture's own frame: origin at the trunnion, the body
 * axis along +y (the lens end is at +h/2), x across the body. Shapes use absolute
 * millimetre coordinates for the given body size, so no non-uniform scaling is
 * needed and line weights stay true on paper.
 *
 *   shape = { d: 'SVG path', fill: 'none' | 'body' | 'lens' | 'ink', weight: 'main' | 'fine' }
 *
 * `fill: 'lens'` takes the fixture's gel colour when it has one.
 */

const f = (n) => Math.round(n * 10) / 10;
const rect = (x0, y0, x1, y1) => `M${f(x0)} ${f(y0)}H${f(x1)}V${f(y1)}H${f(x0)}Z`;
const line = (x0, y0, x1, y1) => `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;

export const GLYPH_KEYS = ['profile', 'fresnel', 'par', 'flood', 'wash', 'moving', 'generic'];

/** Which glyph a fixture type uses: its symbol id first, then category / name. */
export function glyphKey(type) {
  const sym = String(type?.symbolId || '').toLowerCase();
  if (/moving/.test(sym)) return 'moving';
  if (/profile|source|ellips/.test(sym)) return 'profile';
  if (/fresnel/.test(sym)) return 'fresnel';
  if (/par/.test(sym)) return 'par';
  if (/flood|cyc/.test(sym)) return 'flood';
  if (/wash|led/.test(sym)) return 'wash';
  const k = `${type?.category || ''} ${type?.name || ''}`.toLowerCase();
  if (/moving|spot|beam/.test(k)) return 'moving';
  if (/profile|ellips|source/.test(k)) return 'profile';
  if (/fresnel|\bpc\b/.test(k)) return 'fresnel';
  if (/\bpar\b|par\s?\d/.test(k)) return 'par';
  if (/flood|cyc/.test(k)) return 'flood';
  if (/led|wash/.test(k)) return 'wash';
  return 'generic';
}

/** Body size (mm) and the distance from the pipe to the trunnion for each glyph. */
export const GLYPH_SPEC = {
  moving:  { w: 320, h: 430, yoke: 330 },
  profile: { w: 250, h: 420, yoke: 130 },
  fresnel: { w: 240, h: 300, yoke: 130 },
  par:     { w: 220, h: 260, yoke: 130 },
  flood:   { w: 330, h: 260, yoke: 130 },
  wash:    { w: 290, h: 300, yoke: 130 },
  generic: { w: 250, h: 330, yoke: 130 },
};

/**
 * @param {string} key   one of GLYPH_KEYS
 * @param {number} w     body width (mm)
 * @param {number} h     body length (mm)
 * @param {number} yoke  pipe-to-trunnion distance (mm); only the moving head's fork uses it
 */
export function glyphShapes(key, w, h, yoke = 130) {
  const hw = w / 2, hh = h / 2;
  const S = [];
  const add = (d, fill = 'none', weight = 'main') => S.push({ d, fill, weight });

  switch (key) {
    case 'profile': {
      add(rect(-hw * 0.9, -hh, hw * 0.9, -hh * 0.2), 'body');                         // lamp housing
      for (let i = 1; i <= 3; i++) add(line(-hw * 0.9, -hh + i * hh * 0.2, hw * 0.9, -hh + i * hh * 0.2), 'none', 'fine'); // vents
      add(rect(-hw * 0.7, -hh * 0.2, hw * 0.7, hh * 0.55), 'body');                  // barrel
      add(line(-hw * 0.7, hh * 0.05, hw * 0.7, hh * 0.05), 'none', 'fine');            // gate / shutters
      add(line(-hw * 0.7, hh * 0.12, hw * 0.7, hh * 0.12), 'none', 'fine');
      add(rect(-hw * 0.8, hh * 0.55, hw * 0.8, hh), 'body');                          // lens tube
      add(rect(-hw * 0.74, hh * 0.9, hw * 0.74, hh), 'lens');                          // lens
      break;
    }
    case 'fresnel': {
      add(`M${f(-hw * 0.8)} ${f(-hh)}H${f(hw * 0.8)}L${f(hw)} ${f(-hh * 0.6)}V${f(hh * 0.3)}H${f(-hw)}V${f(-hh * 0.6)}Z`, 'body'); // housing
      for (let i = 1; i <= 2; i++) add(line(-hw * 0.9, -hh * 0.4 + i * hh * 0.25, hw * 0.9, -hh * 0.4 + i * hh * 0.25), 'none', 'fine');
      add(rect(-hw * 0.9, hh * 0.3, hw * 0.9, hh * 0.55), 'body');                    // lens ring
      add(`M${f(-hw * 0.8)} ${f(hh * 0.55)}Q0 ${f(hh * 0.8)} ${f(hw * 0.8)} ${f(hh * 0.55)}Z`, 'lens');                          // lens
      add(line(-hw, hh * 0.55, -hw * 1.45, hh), 'none', 'main');                       // barn doors (open)
      add(line(hw, hh * 0.55, hw * 1.45, hh), 'none', 'main');
      break;
    }
    case 'par': {
      add(rect(-hw, -hh * 0.9, hw, hh * 0.75), 'body');                               // can
      for (let i = 1; i <= 3; i++) add(line(-hw, -hh * 0.9 + i * hh * 0.4, hw, -hh * 0.9 + i * hh * 0.4), 'none', 'fine'); // ribs
      add(rect(-hw * 0.5, -hh, hw * 0.5, -hh * 0.9), 'body');                         // rear cap
      add(rect(-hw * 0.95, hh * 0.75, hw * 0.95, hh), 'lens');                         // lens
      break;
    }
    case 'flood': {
      add(`M${f(-hw * 0.45)} ${f(-hh)}H${f(hw * 0.45)}L${f(hw)} ${f(hh * 0.7)}H${f(-hw)}Z`, 'body'); // reflector box
      add(rect(-hw, hh * 0.7, hw, hh), 'lens');                                        // front glass
      add(line(0, -hh * 0.9, 0, hh * 0.7), 'none', 'fine');
      break;
    }
    case 'wash': {
      add(rect(-hw, -hh, hw, hh * 0.7), 'body');                                      // housing
      for (let i = 1; i <= 4; i++) add(line(-hw, -hh + i * hh * 0.28, hw, -hh + i * hh * 0.28), 'none', 'fine'); // heat fins
      add(rect(-hw * 0.9, hh * 0.7, hw * 0.9, hh), 'lens');                            // LED face
      break;
    }
    case 'moving': {
      const headTop = -hh * 0.55;
      add(rect(-hw * 0.5, -yoke - 20, hw * 0.5, -yoke + 70), 'body');                 // base block at the clamp
      add(line(-hw * 0.9, -yoke + 70, -hw * 0.9, hh * 0.1), 'none', 'main');          // fork arms
      add(line(hw * 0.9, -yoke + 70, hw * 0.9, hh * 0.1), 'none', 'main');
      add(line(-hw * 0.9, -yoke + 70, hw * 0.9, -yoke + 70), 'none', 'main');
      add(`M${f(-hw * 0.7)} ${f(headTop)}H${f(hw * 0.7)}V${f(hh * 0.75)}H${f(-hw * 0.7)}Z`, 'body'); // head
      add(line(-hw * 0.7, hh * 0.2, hw * 0.7, hh * 0.2), 'none', 'fine');
      add(rect(-hw * 0.62, hh * 0.75, hw * 0.62, hh), 'lens');                         // front lens
      break;
    }
    default: {
      add(rect(-hw, -hh, hw, hh * 0.8), 'body');
      add(rect(-hw * 0.9, hh * 0.8, hw * 0.9, hh), 'lens');
    }
  }
  return S;
}
