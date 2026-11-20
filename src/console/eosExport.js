/**
 * Console exports.
 *
 * ── ETC Eos ────────────────────────────────────────────────────────────────
 * Eos imports patch data through  File ▸ Import ▸ Lightwright  from a TAB-delimited
 * .txt file with Windows (CRLF) line endings and a header row. Per ETC's
 * documentation Eos matches columns by NAME and reads: Channel, Dimmer (the DMX
 * address — absolute like 513 or port/offset like 2/1), Purpose, Color,
 * Circuit Name, Circuit#, and Device Type, where only rows whose Device Type is
 * "Light" are imported. Extra columns are ignored.
 *
 * Lightwright-style import is the path ETC documents for patch + labels; the
 * USITT ASCII path carries patch only and no channel labels.
 */

const clean = (v) => (v == null ? '' : String(v)).replace(/[\t\r\n]+/g, ' ').trim();

export const EOS_COLUMNS = [
  'Channel', 'Dimmer', 'Purpose', 'Color', 'Circuit Name', 'Circuit#', 'Device Type',
  // Extra context — ignored by Eos but handy if the file is opened elsewhere.
  'Position', 'Unit Number', 'Instrument Type',
];

/**
 * @param {Array} fixtures
 * @param {{ includeUnpatched?: boolean }} opts  by default fixtures with neither a channel nor an address are left out
 * @returns {{ text: string, exported: number, skipped: number }}
 */
export function buildEosPatchTxt(fixtures, { includeUnpatched = false } = {}) {
  const rows = [];
  let skipped = 0;
  const sorted = [...fixtures].sort((a, b) => (parseFloat(a.channel) || 1e9) - (parseFloat(b.channel) || 1e9));
  for (const f of sorted) {
    const channel = clean(f.channel), address = clean(f.dmxAddress);
    if (!includeUnpatched && !channel && !address) { skipped++; continue; }
    rows.push([
      channel,
      address || clean(f.dimmer),
      clean(f.purpose),
      clean(f.colour),
      clean(f.position),
      clean(f.unit),
      'Light',
      clean(f.position),
      clean(f.unit),
      clean(f.type),
    ]);
  }
  const lines = [EOS_COLUMNS, ...rows].map(r => r.join('\t'));
  return { text: lines.join('\r\n') + '\r\n', exported: rows.length, skipped };
}
