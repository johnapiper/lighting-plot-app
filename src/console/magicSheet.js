/**
 * Magic Sheet background + button map.
 *
 * Eos has no file format that builds a Magic Sheet from outside, but it can
 * import an IMAGE into a Magic Sheet (Magic Sheet editor ▸ Image ▸ Import; max
 * 1920 × 1920, larger images are scaled down) which you then place behind the
 * channel buttons. So we produce:
 *   1. a PNG laid out to fit 1920 × 1920, and
 *   2. a CSV of every fixture's channel and its pixel position on that PNG, so
 *      buttons can be dropped (or checked) exactly over each instrument.
 *
 * This module is the pure layout; `renderMagicSheetPng` (browser only) draws it.
 */

export const EOS_MAX_IMAGE = 1920;

/**
 * Fit a drawing's fixtures (and pipes for context) into a square-ish image.
 * @param {object} drawing { fixtures, pipes }
 * @param {{ maxSize?: number, margin?: number, minAspectPad?: number }} opts
 */
export function layoutMagicSheet(drawing, { maxSize = EOS_MAX_IMAGE, margin = 60 } = {}) {
  const fixtures = (drawing.fixtures || []);
  const pipes = (drawing.pipes || []);
  const pts = [];
  fixtures.forEach(f => pts.push({ x: f.x, y: f.y }));
  pipes.forEach(p => { pts.push({ x: p.x1, y: p.y1 }); pts.push({ x: p.x2, y: p.y2 }); });
  if (!pts.length) return { width: 0, height: 0, scale: 1, items: [], pipes: [], empty: true };

  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
  const inner = maxSize - margin * 2;
  const scale = inner / Math.max(spanX, spanY);
  const width = Math.round(spanX * scale + margin * 2);
  const height = Math.round(spanY * scale + margin * 2);
  const X = (x) => Math.round((x - minX) * scale + margin);
  const Y = (y) => Math.round((y - minY) * scale + margin);

  const items = fixtures.map(f => ({
    id: f.id,
    channel: f.channel != null && String(f.channel).trim() !== '' ? String(f.channel).trim() : '',
    unit: f.unit != null ? String(f.unit).trim() : '',
    position: f.position || '',
    type: f.type || '',
    colourHex: f.colourHex && f.colourHex !== 'null' ? f.colourHex : null,
    x: X(f.x), y: Y(f.y),
  }));
  const pipeLines = pipes.map(p => ({ x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2), name: p.name || '' }));
  return { width, height, scale, items, pipes: pipeLines, empty: false };
}

/** CSV of button positions (pixels on the exported image, origin top-left). */
export function magicSheetCsv(layout) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Channel', 'Unit', 'Position', 'Type', 'X_px', 'Y_px'].join(',')];
  [...layout.items]
    .sort((a, b) => (parseFloat(a.channel) || 1e9) - (parseFloat(b.channel) || 1e9))
    .forEach(i => lines.push([q(i.channel), q(i.unit), q(i.position), q(i.type), i.x, i.y].join(',')));
  return lines.join('\r\n') + '\r\n';
}

/**
 * Draw the layout to a PNG data URL (browser only).
 * Dark background, pipes as lines, each fixture as a ring with its channel number.
 */
export function renderMagicSheetPng(layout, { label = 'channel' } = {}) {
  const c = document.createElement('canvas');
  c.width = layout.width; c.height = layout.height;
  const g = c.getContext('2d');
  g.fillStyle = '#10151f'; g.fillRect(0, 0, c.width, c.height);

  g.lineCap = 'round';
  g.strokeStyle = '#3d5775'; g.lineWidth = 6;
  layout.pipes.forEach(p => { g.beginPath(); g.moveTo(p.x1, p.y1); g.lineTo(p.x2, p.y2); g.stroke(); });
  g.fillStyle = '#5b7a9d'; g.font = '600 20px sans-serif'; g.textAlign = 'left';
  layout.pipes.forEach(p => { if (p.name) g.fillText(p.name, Math.min(p.x1, p.x2) + 4, Math.min(p.y1, p.y2) - 12); });

  const r = Math.max(14, Math.min(26, Math.round(layout.scale * 220)));
  layout.items.forEach(i => {
    g.beginPath(); g.arc(i.x, i.y, r, 0, Math.PI * 2);
    g.fillStyle = i.colourHex ? i.colourHex + '33' : '#1b2a40'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = i.colourHex || '#6fa8dc'; g.stroke();
    const text = label === 'unit' ? i.unit : i.channel;
    if (text) {
      g.fillStyle = '#e8eef7'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${text.length > 3 ? Math.round(r * 0.8) : Math.round(r * 1.05)}px sans-serif`;
      g.fillText(text, i.x, i.y);
    }
  });
  return c.toDataURL('image/png');
}
