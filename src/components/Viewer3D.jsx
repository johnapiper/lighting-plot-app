import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';

// Lightweight orthographic 3D model viewer (MVR-style). Renders the rig — pipes,
// trusses, fixtures, infrastructure — in true 3D and lets the user orbit, pan and
// zoom like a CAD turntable (Inventor-style). No external 3D dependency: points are
// projected with a hand-rolled orthographic camera.
//
// World axes: X = stage width (mm), Y = stage depth (mm), Z = height up (mm).

const DEG = Math.PI / 180;

// Project a world point {x,y,z} to screen given camera azimuth/elevation + scale/centre.
function project(p, cam) {
  const ca = Math.cos(cam.az), sa = Math.sin(cam.az);
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  // rotate about vertical Z by azimuth
  const x1 = p.x * ca - p.y * sa;
  const y1 = p.x * sa + p.y * ca;
  const z1 = p.z;
  // tilt by elevation; up is -screenY
  const sx = x1 * cam.scale + cam.cx;
  const sy = (y1 * se - z1 * ce) * cam.scale + cam.cy;
  // depth key for painter's algorithm (larger = farther from camera)
  const depth = -(y1 * ce + z1 * se);
  return { x: sx, y: sy, depth };
}

const PRESETS = {
  iso:   { az: -35 * DEG, el: 30 * DEG },
  top:   { az: 0,         el: 89.9 * DEG },
  front: { az: 0,         el: 1 * DEG },
  right: { az: 90 * DEG,  el: 1 * DEG },
  back:  { az: 180 * DEG, el: 1 * DEG },
};

export default function Viewer3D({ drawing, fixtureTypes = [], meta = {}, onClose }) {
  const W = 900, H = 620;
  const rigHeight = meta?.rigHeight || 5500;
  const pipes = drawing?.pipes || [];
  const fixtures = drawing?.fixtures || [];
  const infra = drawing?.infrastructure || [];

  // Build flat list of 3D primitives once per data change.
  const model = useMemo(() => {
    const pipeZ = (p) => (parseFloat(p.height) || (rigHeight / 1000)) * 1000;
    const items = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0;
    const acc = (x, y, z) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    };
    pipes.forEach(p => {
      const z = pipeZ(p);
      acc(p.x1, p.y1, z); acc(p.x2, p.y2, z);
      items.push({ type: p.type === 'truss' ? 'truss' : 'pipe', a: { x: p.x1, y: p.y1, z }, b: { x: p.x2, y: p.y2, z } });
    });
    fixtures.forEach(f => {
      const p = f.pipeId ? pipes.find(pp => pp.id === f.pipeId) : null;
      const z = p ? pipeZ(p) : rigHeight;
      acc(f.x, f.y, z);
      items.push({ type: 'fixture', pos: { x: f.x, y: f.y, z }, color: f.colourHex || '#ffd24a', rot: f.rotation || 0, tilt: f.tiltAngle || 0 });
    });
    infra.forEach(i => { acc(i.x, i.y, 0); items.push({ type: 'infra', pos: { x: i.x, y: i.y, z: 0 } }); });
    if (!isFinite(minX)) { minX = -2000; maxX = 2000; minY = -2000; maxY = 2000; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ, 2000);
    return { items, center: { x: cx, y: cy, z: 0 }, span, maxZ, bounds: { minX, maxX, minY, maxY } };
  }, [pipes, fixtures, infra, rigHeight]);

  const fitScale = (0.62 * Math.min(W, H)) / model.span;
  const [cam, setCam] = useState(() => ({ az: PRESETS.iso.az, el: PRESETS.iso.el, scale: fitScale, cx: W / 2, cy: H / 2 + 40 }));
  const drag = useRef(null);

  const fit = useCallback((preset) => {
    setCam(c => ({ ...c, ...(preset ? PRESETS[preset] : {}), scale: fitScale, cx: W / 2, cy: H / 2 + 40 }));
  }, [fitScale]);

  // Re-fit scale when the model span changes substantially (e.g. first open).
  useEffect(() => { setCam(c => ({ ...c, scale: fitScale })); /* eslint-disable-next-line */ }, [model.span]);

  const onDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, mode: (e.button === 0 && !e.shiftKey) ? 'orbit' : 'pan' };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current.x = e.clientX; drag.current.y = e.clientY;
    if (drag.current.mode === 'orbit') {
      setCam(c => ({ ...c, az: c.az + dx * 0.008, el: Math.max(-89.9 * DEG, Math.min(89.9 * DEG, c.el - dy * 0.008)) }));
    } else {
      setCam(c => ({ ...c, cx: c.cx + dx, cy: c.cy + dy }));
    }
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setCam(c => ({ ...c, scale: Math.max(0.0005, c.scale * f) }));
  };

  // Centre model at world centre by offsetting points before projecting.
  const P = (x, y, z) => project({ x: x - model.center.x, y: y - model.center.y, z }, cam);

  // Floor grid lines on z=0 across the model bounds.
  const grid = useMemo(() => {
    const { bounds } = model;
    const pad = model.span * 0.15;
    const x0 = bounds.minX - pad, x1 = bounds.maxX + pad;
    const y0 = bounds.minY - pad, y1 = bounds.maxY + pad;
    const step = Math.max(500, Math.round(model.span / 12 / 500) * 500);
    const lines = [];
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) lines.push([{ x, y: y0, z: 0 }, { x, y: y1, z: 0 }]);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) lines.push([{ x: x0, y, z: 0 }, { x: x1, y, z: 0 }]);
    return lines;
  }, [model]);

  // Build renderable elements with depth keys, then sort far→near.
  const els = [];
  grid.forEach((g, i) => {
    const a = P(g[0].x, g[0].y, 0), b = P(g[1].x, g[1].y, 0);
    els.push({ depth: Math.min(a.depth, b.depth) - 1e9, el: <line key={`g${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#21364f" strokeWidth={1} /> });
  });
  model.items.forEach((it, i) => {
    if (it.type === 'pipe' || it.type === 'truss') {
      const a = P(it.a.x, it.a.y, it.a.z), b = P(it.b.x, it.b.y, it.b.z);
      const af = P(it.a.x, it.a.y, 0), bf = P(it.b.x, it.b.y, 0);
      const col = it.type === 'truss' ? '#7fb4e0' : '#e0c060';
      const sw = it.type === 'truss' ? 4 : 2.5;
      els.push({
        depth: (a.depth + b.depth) / 2,
        el: (
          <g key={`p${i}`}>
            <line x1={af.x} y1={af.y} x2={a.x} y2={a.y} stroke="#2a4a6a" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={bf.x} y1={bf.y} x2={b.x} y2={b.y} stroke="#2a4a6a" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={sw} strokeLinecap="round" />
            {it.type === 'truss' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={1} strokeOpacity={0.5} transform={`translate(0,${-4})`} />}
          </g>
        ),
      });
    } else if (it.type === 'fixture') {
      const top = P(it.pos.x, it.pos.y, it.pos.z);
      const beamLen = 1200;
      const tip = P(it.pos.x, it.pos.y, Math.max(0, it.pos.z - beamLen));
      const r = 7;
      els.push({
        depth: top.depth,
        el: (
          <g key={`f${i}`}>
            <line x1={top.x} y1={top.y} x2={tip.x} y2={tip.y} stroke={it.color} strokeWidth={1.5} strokeOpacity={0.5} />
            <circle cx={top.x} cy={top.y} r={r} fill={it.color} stroke="#101820" strokeWidth={1.5} />
          </g>
        ),
      });
    } else if (it.type === 'infra') {
      const c = P(it.pos.x, it.pos.y, 0);
      els.push({ depth: c.depth, el: <rect key={`i${i}`} x={c.x - 6} y={c.y - 6} width={12} height={12} fill="#34d399" stroke="#0b3" strokeWidth={1} /> });
    }
  });
  els.sort((a, b) => a.depth - b.depth);

  const counts = `${pipes.length} pipe/truss · ${fixtures.length} fixtures`;

  return (
    <div style={styles.backdrop} onMouseUp={onUp} onMouseLeave={onUp}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.title}>🧊 3D Model View</span>
          <span style={styles.sub}>{counts}</span>
          <div style={{ flex: 1 }} />
          {['iso', 'top', 'front', 'right', 'back'].map(v => (
            <button key={v} style={styles.viewBtn} onClick={() => fit(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
          <button style={styles.viewBtn} onClick={() => fit()}>Fit</button>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <svg
          width={W} height={H} style={styles.canvas}
          onMouseDown={onDown} onMouseMove={onMove} onWheel={onWheel}
          onContextMenu={e => e.preventDefault()}
        >
          <rect x={0} y={0} width={W} height={H} fill="#0b1422" />
          {els.map(e => e.el)}
          {/* Axis indicator */}
          <AxisGizmo cam={cam} />
        </svg>
        <div style={styles.footer}>
          Drag to orbit · Shift-drag (or middle/right-drag) to pan · Scroll to zoom · Heights from each pipe's “Height above stage”.
        </div>
      </div>
    </div>
  );
}

function AxisGizmo({ cam }) {
  const ox = 54, oy = 566, L = 34;
  const g = { ...cam, scale: 1, cx: ox, cy: oy };
  const o = project({ x: 0, y: 0, z: 0 }, g);
  const ax = project({ x: L, y: 0, z: 0 }, g);
  const ay = project({ x: 0, y: L, z: 0 }, g);
  const az = project({ x: 0, y: 0, z: L }, g);
  const axis = (p, c, t) => (
    <g>
      <line x1={o.x} y1={o.y} x2={p.x} y2={p.y} stroke={c} strokeWidth={2} />
      <text x={p.x} y={p.y} dx={3} dy={3} fontSize={10} fill={c}>{t}</text>
    </g>
  );
  return <g>{axis(ax, '#e06666', 'X')}{axis(ay, '#66cc88', 'Y')}{axis(az, '#6699e0', 'Z')}</g>;
}

const styles = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  modal: { background: '#10182a', border: '1px solid #1e3a5a', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#16213e', borderBottom: '1px solid #0f3460' },
  title: { color: '#cfe0ff', fontWeight: 700, fontSize: 13 },
  sub: { color: '#6a86a8', fontSize: 11 },
  canvas: { display: 'block', cursor: 'grab', userSelect: 'none' },
  viewBtn: { background: '#0f3460', border: '1px solid #2a5a8a', borderRadius: 4, color: '#9fc4e8', cursor: 'pointer', fontSize: 11, padding: '3px 8px' },
  closeBtn: { background: '#3a1a1a', border: '1px solid #7a2a2a', borderRadius: 4, color: '#fca5a5', cursor: 'pointer', fontSize: 12, padding: '3px 9px', marginLeft: 4 },
  footer: { padding: '6px 12px', background: '#0d1626', borderTop: '1px solid #0f3460', color: '#6a86a8', fontSize: 10.5 },
};
