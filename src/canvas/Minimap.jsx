import React, { useMemo, useRef, useState } from 'react';

// Overview inset for the plot canvas: a simplified render of the drawing plus
// the current viewport rectangle. Click or drag inside it to move the view.
// Rendered as HTML over the canvas (not inside the plot <svg>) so it never
// appears in PNG/SVG exports.
const W = 190, H = 130, PAD = 8;
const STORE_KEY = 'lplot-minimap-open';

function readOpen() { try { return localStorage.getItem(STORE_KEY) !== '0'; } catch { return true; } }
function writeOpen(v) { try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch {} }

export default function Minimap({ drawing, zoom, pan, vpW, vpH, onPanChange }) {
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (v) => { setOpenState(v); writeOpen(v); };
  const dragRef = useRef(false);

  const content = useMemo(() => {
    const d = drawing || {};
    const segs = [], rects = [], dots = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ext = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    (d.pipes || []).forEach(p => { segs.push([p.x1, p.y1, p.x2, p.y2, 'pipe']); ext(p.x1, p.y1); ext(p.x2, p.y2); });
    (d.lines || []).forEach(l => { segs.push([l.x1, l.y1, l.x2, l.y2, 'line']); ext(l.x1, l.y1); ext(l.x2, l.y2); });
    (d.polylines || []).forEach(pl => {
      const pts = pl.points || [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 'line']);
      if (pl.closed && pts.length > 2) segs.push([pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, 'line']);
      pts.forEach(p => ext(p.x, p.y));
    });
    (d.rectangles || []).forEach(r => { rects.push([r.x, r.y, r.w, r.h]); ext(r.x, r.y); ext(r.x + r.w, r.y + r.h); });
    (d.circles || []).forEach(c => { if (c.cx != null && c.r != null) { rects.push([c.cx - c.r, c.cy - c.r, c.r * 2, c.r * 2, true]); ext(c.cx - c.r, c.cy - c.r); ext(c.cx + c.r, c.cy + c.r); } });
    (d.images || []).forEach(i => { ext(i.x, i.y); ext(i.x + i.w, i.y + i.h); });
    if (d.pdfBackground) { const b = d.pdfBackground; rects.push([b.x, b.y, b.w, b.h, false, 'bg']); ext(b.x, b.y); ext(b.x + b.w, b.y + b.h); }
    (d.fixtures || []).forEach(f => { dots.push([f.x, f.y, f.colourHex]); ext(f.x, f.y); });
    (d.infrastructure || []).forEach(i => { dots.push([i.x, i.y, '#68d391']); ext(i.x, i.y); });
    return { segs, rects, dots, bounds: isFinite(minX) ? { minX, minY, maxX, maxY } : null };
  }, [drawing]);

  if (!vpW || !vpH) return null;

  // Visible world rectangle.
  const view = { x: -pan.x / zoom, y: -pan.y / zoom, w: vpW / zoom, h: vpH / zoom };
  const b = content.bounds || { minX: view.x, minY: view.y, maxX: view.x + view.w, maxY: view.y + view.h };
  // Frame the content plus the viewport so the rectangle never drifts off the map.
  const fx0 = Math.min(b.minX, view.x), fy0 = Math.min(b.minY, view.y);
  const fx1 = Math.max(b.maxX, view.x + view.w), fy1 = Math.max(b.maxY, view.y + view.h);
  const fw = Math.max(1, fx1 - fx0), fh = Math.max(1, fy1 - fy0);
  const s = Math.min((W - PAD * 2) / fw, (H - PAD * 2) / fh);
  const ox = PAD + ((W - PAD * 2) - fw * s) / 2 - fx0 * s;
  const oy = PAD + ((H - PAD * 2) - fh * s) / 2 - fy0 * s;
  const mx = x => x * s + ox, my = y => y * s + oy;

  function moveTo(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / s, wy = (e.clientY - r.top - oy) / s;
    onPanChange({ x: vpW / 2 - wx * zoom, y: vpH / 2 - wy * zoom });
  }

  if (!open) {
    return (
      <button style={styles.reopen} onClick={() => setOpen(true)} title="Show overview map" aria-label="Show overview map">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></svg>
      </button>
    );
  }

  return (
    <div style={styles.wrap} onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <div style={styles.head}>
        <span>Overview</span>
        <button style={styles.hide} onClick={() => setOpen(false)} title="Hide overview" aria-label="Hide overview map">×</button>
      </div>
      <svg width={W} height={H} style={{ display: 'block', cursor: 'crosshair' }}
        role="img" aria-label="Overview map — click to move the view"
        onMouseDown={e => { dragRef.current = true; moveTo(e); }}
        onMouseMove={e => { if (dragRef.current && e.buttons === 1) moveTo(e); }}
        onMouseUp={() => { dragRef.current = false; }}
        onMouseLeave={() => { dragRef.current = false; }}>
        {content.rects.map(([x, y, w, h, round, kind], i) => round
          ? <ellipse key={`r${i}`} cx={mx(x + w / 2)} cy={my(y + h / 2)} rx={w * s / 2} ry={h * s / 2} fill="none" stroke="#607d8b" strokeWidth={0.8} />
          : <rect key={`r${i}`} x={mx(x)} y={my(y)} width={w * s} height={h * s} fill={kind === 'bg' ? 'rgba(96,125,139,0.12)' : 'none'} stroke="#607d8b" strokeWidth={0.8} />)}
        {content.segs.map(([x1, y1, x2, y2, k], i) => (
          <line key={`s${i}`} x1={mx(x1)} y1={my(y1)} x2={mx(x2)} y2={my(y2)} stroke={k === 'pipe' ? '#a0aec0' : '#607d8b'} strokeWidth={k === 'pipe' ? 1.4 : 0.8} />
        ))}
        {content.dots.map(([x, y, c], i) => <circle key={`d${i}`} cx={mx(x)} cy={my(y)} r={1.8} fill={c || '#e0c060'} />)}
        <rect x={mx(view.x)} y={my(view.y)} width={Math.max(3, view.w * s)} height={Math.max(3, view.h * s)}
          fill="rgba(0,170,255,0.10)" stroke="#00aaff" strokeWidth={1.2} />
      </svg>
    </div>
  );
}

const styles = {
  wrap: { position: 'absolute', right: 10, bottom: 10, zIndex: 20, background: 'rgba(13,17,23,0.88)', border: '1px solid #1a3a5c', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', overflow: 'hidden', userSelect: 'none' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 2px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#718096', borderBottom: '1px solid #1a3a5c' },
  hide: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' },
  reopen: { position: 'absolute', right: 10, bottom: 10, zIndex: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.88)', border: '1px solid #1a3a5c', borderRadius: 6, color: '#a0aec0', cursor: 'pointer' },
};
