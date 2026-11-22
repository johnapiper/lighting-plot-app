/**
 * DMX / channel helpers — pure functions shared by the app, patch panel and
 * inspector (previously three diverging copies of parseDmx).
 *
 * A DMX address is stored as the string "universe/channel", e.g. "1/101".
 */

/** Lenient parse: any "u/c" pair of integers. Returns {universe, channel} or null. */
export function parseDmx(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 2) return null;
  const u = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
  if (isNaN(u) || isNaN(c)) return null;
  return { universe: u, channel: c };
}

/** Strict parse: also requires channel 1–512. */
export function parseDmxStrict(str) {
  const p = parseDmx(str);
  return p && p.channel >= 1 && p.channel <= 512 ? p : null;
}

/** Error string for an invalid address, or null. Empty is always allowed. */
export function validateDmx(raw) {
  if (!raw) return null;
  const parsed = parseDmx(raw);
  if (!parsed) return 'Use Universe/Channel, e.g. 1/1';
  if (parsed.universe < 1) return 'Universe must be 1 or more';
  if (parsed.channel < 1 || parsed.channel > 512) return 'Channel must be 1–512';
  return null;
}

export function formatDmx(universe, channel) { return `${universe}/${channel}`; }

/**
 * Keep `channel` and `dmxAddress` in step: editing one updates the other.
 * `fields` = the user's edit, `cur` = the fixture before the edit.
 */
export function syncFields(fields, cur) {
  const out = { ...fields };
  if (fields.dmxAddress !== undefined) {
    const p = parseDmx(fields.dmxAddress);
    if (p) out.channel = String(p.channel);
  }
  if (fields.channel !== undefined && fields.dmxAddress === undefined) {
    const ch = parseInt(fields.channel, 10);
    if (!isNaN(ch) && ch >= 1 && ch <= 512) {
      const ex = parseDmx(cur?.dmxAddress);
      out.dmxAddress = `${ex?.universe || 1}/${ch}`;
    }
  }
  return out;
}

/** Number of DMX channels a fixture occupies (from its mode / type), min 1. */
export function footprintOf(f, fixtureTypes = []) {
  const t = fixtureTypes.find(t => t.id === f.fixtureTypeId);
  const mode = t?.modes?.find(m => m.name === (f.dmxMode || t.defaultMode)) || t?.modes?.[0];
  return f.dmxChannelCount || mode?.channelCount || (typeof t?.channels === 'number' ? t.channels : 0) || 1;
}

/** Set of fixture ids whose DMX ranges overlap another fixture's in the same universe. O(n log n): sort + sweep. */
export function findDmxConflicts(fixtures) {
  const conflictIds = new Set();
  const byUniverse = {};
  for (const f of fixtures) {
    const addr = parseDmxStrict(f.dmxAddress);
    if (!addr) continue;
    const chCount = f.dmxChannelCount || 1;
    (byUniverse[addr.universe] = byUniverse[addr.universe] || [])
      .push({ id: f.id, start: addr.channel, end: addr.channel + chCount - 1 });
  }
  for (const list of Object.values(byUniverse)) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    // `reach` is the furthest-reaching earlier range; if this one starts inside it they overlap. Any other
    // earlier range that also overlaps this one was already flagged when it was swept (it overlapped `reach` or an earlier range).
    let reach = null;
    for (const r of list) {
      if (reach && r.start <= reach.end) { conflictIds.add(r.id); conflictIds.add(reach.id); }
      if (!reach || r.end > reach.end) reach = r;
    }
  }
  return conflictIds;
}

/**
 * First gap that fits `size` channels, searching universes from `startUniverse`.
 * `taken` is a list of {u, s, e} ranges already occupied.
 */
export function findFreeAddress(size, startUniverse, taken = []) {
  const byU = {};
  taken.forEach(r => { if (r) (byU[r.u] = byU[r.u] || []).push(r); });
  for (let u = startUniverse; u < startUniverse + 64; u++) {
    const ranges = (byU[u] || []).slice().sort((a, b) => a.s - b.s);
    let c = 1;
    for (const r of ranges) { if (c + size - 1 < r.s) break; c = Math.max(c, r.e + 1); }
    if (c + size - 1 <= 512) return { universe: u, channel: c };
  }
  return null;
}

/**
 * Lay fixtures (already ordered) out sequentially from `start`, stepping by
 * each footprint and wrapping to the next universe at 512.
 * Returns Map(fixtureId → "u/c"), or null if `start` is invalid.
 */
export function planSequentialPatch(ordered, start, sizeOf = () => 1) {
  const p = parseDmxStrict(start);
  if (!p) return null;
  let u = p.universe, c = p.channel;
  const assign = new Map();
  for (const f of ordered) {
    const size = sizeOf(f);
    if (c + size - 1 > 512) { u++; c = 1; }
    assign.set(f.id, formatDmx(u, c));
    c += size;
  }
  return assign;
}
