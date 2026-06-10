import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import FixtureSymbol from '../fixtures/FixtureSymbol';

// ── Paper sizes (mm) ──────────────────────────────────────────────────────────
const PAPER = {
  A4:      { w: 297,   h: 210   },
  A3:      { w: 420,   h: 297   },
  A2:      { w: 594,   h: 420   },
  A1:      { w: 841,   h: 594   },
  Letter:  { w: 279.4, h: 215.9 },
  Tabloid: { w: 431.8, h: 279.4 },
};
const TITLE_H = { small: 18, medium: 28, large: 42 };
const NOTES_H = { small: 12, medium: 22, large: 38 };
const MARGIN = 10; // mm

// ── Arrowhead helper ──────────────────────────────────────────────────────────
function arrowheadPoints(x1, y1, x2, y2, ah = 8, aw = 4) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const bx = x2 - ux * ah, by = y2 - uy * ah;
  return `${x2},${y2} ${bx + px * aw},${by + py * aw} ${bx - px * aw},${by - py * aw}`;
}

// ── CAD plot content (display-only) ──────────────────────────────────────────
const LAYER_DEFAULTS = {
  fixture: 'layer-lighting', pipe: 'layer-lighting',
  line: 'layer-arch', rect: 'layer-arch', text: 'layer-arch',
  image: 'layer-bg',
};
function layerVisible(obj, kind, layers) {
  if (!layers || layers.length === 0) return true;
  const lid = obj.layerId || LAYER_DEFAULTS[kind] || 'layer-arch';
  const layer = layers.find(l => l.id === lid);
  return layer ? layer.visible !== false : true;
}

function CadContent({ drawing, fixtureTypes, layers, worldScale = 1 }) {
  if (!drawing) return null;
  const { pipes=[], fixtures=[], lines=[], rectangles=[], texts=[], images=[], pdfBackground } = drawing;
  const ftypes = {};
  fixtureTypes.forEach(f => { ftypes[f.id] = f; });
  const vis = (obj, kind) => layerVisible(obj, kind, layers);
  // Symbols are designed for ~30px; counter-scale so they appear readable in the viewport
  // regardless of drawing scale. worldScale = ps / renderScale (screen pixels per world unit).
  const symBase = worldScale > 0 ? 1 / worldScale : 1;
  return (
    <g>
      {pdfBackground && layerVisible({layerId:'layer-bg'}, 'image', layers) && (
        <image href={pdfBackground.dataUrl} x={pdfBackground.x} y={pdfBackground.y}
          width={pdfBackground.w} height={pdfBackground.h} opacity={pdfBackground.opacity ?? 0.4} />
      )}
      {images.filter(img => vis(img, 'image')).map(img => (
        <image key={img.id} href={img.dataUrl} x={img.x} y={img.y} width={img.w} height={img.h} />
      ))}
      {lines.filter(l => vis(l, 'line')).map(l => (
        <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#607d8b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {rectangles.filter(r => vis(r, 'rect')).map(r => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
          stroke="#607d8b" fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {texts.filter(t => vis(t, 'text')).map(t => (
        <text key={t.id} x={t.x} y={t.y} fontSize={t.fontSize || 14} fill="#555">{t.label}</text>
      ))}
      {pipes.filter(p => vis(p, 'pipe')).map(p => (
        <g key={p.id}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
            stroke="#c0a030" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          <line x1={p.x1} y1={p.y1-5} x2={p.x1} y2={p.y1+5} stroke="#c0a030" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={p.x2} y1={p.y2-5} x2={p.x2} y2={p.y2+5} stroke="#c0a030" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={(p.x1+p.x2)/2} y={(p.y1+p.y2)/2-8*symBase} textAnchor="middle"
            fontSize={10*symBase} fill="#c0a030">{p.name}</text>
        </g>
      ))}
      {fixtures.filter(f => vis(f, 'fixture')).map(f => {
        const ftype = ftypes[f.fixtureTypeId];
        if (!ftype) return null;
        // Each fixture symbol is counter-scaled so it appears at ~30 screen pixels
        // regardless of the viewport's drawing scale.
        const symScale = symBase * (f.scale || 1);
        const unitLabel = f.channel?.trim()
          ? `Ch.${f.channel.trim()}`
          : (f.unit?.trim() || null);
        return (
          <g key={f.id} transform={`translate(${f.x},${f.y})`}>
            <g transform={`scale(${symScale})`}>
              <FixtureSymbol
                fixtureType={ftype}
                unit={unitLabel}
                channel={null}
                selected={false}
                rotation={f.rotation || 0}
                scale={1}
                colourHex={f.colourHex || null}
                symbolOverride={f.symbolOverride || null}
                symbolColor={f.symbolColor || '#222'}
              />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ── Viewport element ──────────────────────────────────────────────────────────
function ViewportEl({ vp, drawing, fixtureTypes, layers, ps, selected, onMouseDown, onContextMenu }) {
  const x = vp.x*ps, y = vp.y*ps, w = vp.w*ps, h = vp.h*ps;
  const renderScale = vp.displayScale || vp.scale;
  const worldScale = ps / renderScale;
  const tx = x + w/2 - (vp.centerX||0) * worldScale;
  const ty = y + h/2 - (vp.centerY||0) * worldScale;
  const isFalseScale = vp.displayScale && Math.round(vp.displayScale) !== Math.round(vp.scale);
  const clipId = `vp-clip-${vp.id}`;

  return (
    <g onMouseDown={e => onMouseDown(e, vp)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, vp); }}
      style={{ cursor: vp.locked ? 'default' : 'move' }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill="white" stroke="#bbb" strokeWidth={0.5} />
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${tx},${ty}) scale(${worldScale})`}>
          <CadContent drawing={drawing} fixtureTypes={fixtureTypes} layers={layers} worldScale={worldScale} />
        </g>
      </g>
      <rect x={x} y={y} width={w} height={h} fill="none"
        stroke={selected ? '#2a6090' : '#888'} strokeWidth={selected ? 1.5 : 0.5}
        data-sel-outline="#888" />
      <text x={x+3} y={y+h-3} fontSize={7} fill="#888" style={{ userSelect:'none', pointerEvents:'none' }}
        data-vp-label="true">
        1:{renderScale} · {drawing?.name||'—'}{vp.locked ? ' 🔒' : ''}
      </text>
      {isFalseScale && (
        <text x={x+w/2} y={y+14} textAnchor="middle" fontSize={9}
          fill="rgba(220,60,60,0.6)" fontWeight="bold" letterSpacing="0.12em"
          style={{ userSelect:'none', pointerEvents:'none' }}>
          FALSE SCALE
        </text>
      )}
      {selected && !vp.locked && (
        <g data-print-hide="true">
          {[['tl',x,y],['tr',x+w,y],['br',x+w,y+h],['bl',x,y+h]].map(([hp,hx,hy]) => (
            <rect key={hp} x={hx-4} y={hy-4} width={8} height={8}
              fill="white" stroke="#2a6090" strokeWidth={1}
              style={{ cursor: hp==='tl'||hp==='br'?'nw-resize':'ne-resize' }}
              onMouseDown={e => { e.stopPropagation(); onMouseDown(e, vp, hp); }} />
          ))}
          <text x={x+3} y={y+11} fontSize={6} fill="#2a6090"
            style={{ userSelect:'none', pointerEvents:'none' }}>
            Ctrl+drag to pan · scroll to zoom
          </text>
        </g>
      )}
    </g>
  );
}

// ── Key Block element ─────────────────────────────────────────────────────────
function KeyBlockEl({ kb, drawings, fixtureTypes, ps, selected, onMouseDown, onContextMenu }) {
  const x = kb.x*ps, y = kb.y*ps, w = kb.w*ps, h = kb.h*ps;
  const drawing = drawings.find(d => d.id === kb.drawingId) || drawings[0];
  const usedTypeIds = [...new Set((drawing?.fixtures||[]).map(f => f.fixtureTypeId))];
  const usedTypes = usedTypeIds.map(id => fixtureTypes.find(ft => ft.id === id)).filter(Boolean);
  const rowCount = usedTypes.length + 1;
  const rowH = Math.max(12, h / Math.max(rowCount, 2));
  const symSize = Math.min(rowH*0.65, 20);
  const labelFs = Math.min(rowH*0.42, 8);

  return (
    <g onMouseDown={e => onMouseDown(e, kb, null)} onContextMenu={onContextMenu} style={{ cursor:'move' }}>
      <rect x={x} y={y} width={w} height={h} fill="white"
        stroke={selected?'#2a6090':'#aaa'} strokeWidth={selected?1.5:0.5} />
      <rect x={x} y={y} width={w} height={rowH} fill="#e8eef4" />
      <text x={x+w/2} y={y+rowH*0.68} textAnchor="middle"
        fontSize={Math.min(rowH*0.5, 9)} fontWeight="bold" fill="#1a3a5c"
        style={{ userSelect:'none', pointerEvents:'none' }}>LEGEND</text>
      {usedTypes.map((ft, i) => {
        const ry = y + rowH*(i+1);
        return (
          <g key={ft.id} style={{ pointerEvents:'none' }}>
            <rect x={x} y={ry} width={w} height={rowH} fill={i%2===0?'white':'#f7f9fc'} />
            <g transform={`translate(${x+symSize*0.5+4},${ry+rowH/2}) scale(${symSize/28})`}
              style={{ color:'#222', stroke:'currentColor', strokeWidth:2, fill:'none' }}
              dangerouslySetInnerHTML={{ __html: ft.symbol }} />
            <text x={x+symSize+10} y={ry+rowH*0.62} fontSize={labelFs} fill="#333"
              style={{ userSelect:'none' }}>{ft.name}</text>
          </g>
        );
      })}
      {usedTypes.length === 0 && (
        <text x={x+w/2} y={y+h/2+4} textAnchor="middle" fontSize={6} fill="#aaa"
          style={{ userSelect:'none', pointerEvents:'none' }}>No fixtures in plot</text>
      )}
      <rect x={x} y={y} width={w} height={h} fill="none"
        stroke={selected?'#2a6090':'#bbb'} strokeWidth={selected?1.5:0.5}
        data-sel-outline="#bbb" />
      {selected && (
        <rect x={x+w-4} y={y+h-4} width={8} height={8}
          fill="white" stroke="#2a6090" strokeWidth={1} style={{ cursor:'se-resize' }}
          data-print-hide="true"
          onMouseDown={e => { e.stopPropagation(); onMouseDown(e, kb, 'se'); }} />
      )}
    </g>
  );
}

// ── Main SheetEditor ──────────────────────────────────────────────────────────
export default function SheetEditor({
  project, activeSheet, fixtureTypes, commit, softUpdate, onPrint,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w:900, h:700 });
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const draggingRef = useRef(null);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  const [drawingVp, setDrawingVp] = useState(null);
  const [zoomWindowVpId, setZoomWindowVpId] = useState(null);
  const [editingAnnotId, setEditingAnnotId] = useState(null);
  const [editingAnnotVal, setEditingAnnotVal] = useState('');
  const [editingTitleField, setEditingTitleField] = useState(null);
  const [editingTitleVal, setEditingTitleVal] = useState('');
  const [vpCtxMenu, setVpCtxMenu] = useState(null); // {sx,sy,vp}
  const [sheetCtxMenu, setSheetCtxMenu] = useState(null); // {sx,sy,itemId}
  const [clipboard, setClipboard] = useState(null); // copied sheet item
  const [printPreview, setPrintPreview] = useState(null); // { svgData, pwMm, phMm }

  const drawings = project.drawings || [];
  const tb = activeSheet.titleBlock || {};
  const titleH = TITLE_H[tb.titleBlockSize] || TITLE_H.medium;
  const notesStripH = tb.notes?.trim() ? (NOTES_H[tb.notesSize] || NOTES_H.medium) : 0;
  const totalFooterH = titleH + notesStripH;

  const paper = PAPER[activeSheet.paperSize] || PAPER.A3;
  const pw = activeSheet.orientation === 'landscape' ? paper.w : paper.h;
  const ph = activeSheet.orientation === 'landscape' ? paper.h : paper.w;

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerSize({ w:e.contentRect.width, h:e.contentRect.height });
    });
    ro.observe(containerRef.current);
    const r = containerRef.current.getBoundingClientRect();
    setContainerSize({ w:r.width, h:r.height });
    return () => ro.disconnect();
  }, []);

  const ps = Math.min((containerSize.w-60)/pw, (containerSize.h-60)/ph);
  const svgW = pw*ps, svgH = ph*ps;

  // Keep mutable refs so the native wheel handler always sees current values
  const psRef = useRef(ps);
  const sheetRef = useRef(activeSheet);
  useEffect(() => { psRef.current = ps; }, [ps]);
  useEffect(() => { sheetRef.current = activeSheet; }, [activeSheet]);

  // Non-passive native wheel listener — scroll zooms the viewport under the cursor.
  // React's synthetic onWheel is passive and cannot call preventDefault.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function handleWheel(e) {
      // Only zoom a viewport when Ctrl/Cmd is held; otherwise let the page scroll normally
      if (!e.ctrlKey && !e.metaKey) return;
      const rect = el.getBoundingClientRect();
      const currentPs = psRef.current;
      const mx = (e.clientX - rect.left) / currentPs;
      const my = (e.clientY - rect.top) / currentPs;
      const sheet = sheetRef.current;
      const vp = (sheet.viewports || []).find(v => mx >= v.x && mx <= v.x + v.w && my >= v.y && my <= v.y + v.h);
      if (!vp) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const current = vp.displayScale || vp.scale;
      const newScale = Math.max(1, Math.min(5000, Math.round(current * factor)));
      softUpdate(proj => {
        const s = proj.sheets.find(s => s.id === sheet.id);
        if (s) { const v = s.viewports.find(v => v.id === vp.id); if (v) v.displayScale = newScale; }
        return proj;
      });
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []); // intentionally empty — reads current values via refs

  function svgPt(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return { x:(e.clientX-rect.left)/ps, y:(e.clientY-rect.top)/ps };
  }

  function commitSheet(updater) {
    commit(proj => {
      const s = proj.sheets.find(s => s.id === activeSheet.id);
      if (s) updater(s);
      return proj;
    });
  }
  function softSheet(updater) {
    softUpdate(proj => {
      const s = proj.sheets.find(s => s.id === activeSheet.id);
      if (s) updater(s);
      return proj;
    });
  }

  // ── Print preview ─────────────────────────────────────────────────────────
  function doPrint() {
    const svgEl = svgRef.current; if (!svgEl) return;

    // Clone SVG and stamp real paper dimensions onto it
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    clone.setAttribute('width',  `${pw}mm`);
    clone.setAttribute('height', `${ph}mm`);
    clone.style.cssText = 'display:block;box-shadow:none;background:white;';

    // ── Print cleanup ─────────────────────────────────────────────────────────
    // Remove UI-only elements (selection handles, hint text, resize knobs, text boxes)
    clone.querySelectorAll('[data-print-hide]').forEach(el => el.remove());

    // Reset selection outlines from blue back to their neutral grey
    clone.querySelectorAll('[data-sel-outline]').forEach(el => {
      const neutral = el.getAttribute('data-sel-outline');
      el.setAttribute('stroke', neutral);
      el.setAttribute('stroke-width', '0.5');
    });

    // Strip padlock symbol from viewport labels
    clone.querySelectorAll('[data-vp-label]').forEach(el => {
      el.textContent = el.textContent.replace(/\s*🔒/g, '');
    });

    // Normalise text colour (selected text renders blue; make it black for print)
    clone.querySelectorAll('[data-print-text]').forEach(el => {
      if (el.getAttribute('fill') === '#2a6090') el.setAttribute('fill', '#222');
    });

    const svgData = new XMLSerializer().serializeToString(clone);

    // Show in-app preview modal so the user can see what will print
    setPrintPreview({ svgData, pwMm: pw, phMm: ph });
  }

  async function confirmPrint() {
    if (!printPreview) return;
    const { svgData, pwMm, phMm } = printPreview;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;}
  html,body{background:white;overflow:hidden;}
  @page{size:${pwMm}mm ${phMm}mm;margin:0;}
  svg{display:block;width:${pwMm}mm;height:${phMm}mm;}
</style></head><body>${svgData}</body></html>`;

    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    if (ipcRenderer) {
      // Use a dedicated BrowserWindow for printing — this gives the proper
      // Electron print dialog with preview, rather than the app's main window
      await ipcRenderer.invoke('print-sheet', { html });
    } else {
      // Fallback for non-Electron environments
      const w = window.open('', '_blank', 'width=900,height=700');
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    }
    setPrintPreview(null);
  }

  // ── Viewport right-click menu actions ──────────────────────────────────────
  function zoomVpToExtents(vp) {
    const drawing = drawings.find(d => d.id === vp.drawingId);
    if (!drawing) return;
    const pts = [];
    (drawing.fixtures||[]).forEach(f => pts.push([f.x-25, f.y-25],[f.x+25, f.y+25]));
    (drawing.pipes||[]).forEach(p => pts.push([p.x1,p.y1],[p.x2,p.y2]));
    (drawing.lines||[]).forEach(l => pts.push([l.x1,l.y1],[l.x2,l.y2]));
    (drawing.rectangles||[]).forEach(r => pts.push([r.x,r.y],[r.x+r.w,r.y+r.h]));
    (drawing.images||[]).forEach(i => pts.push([i.x,i.y],[i.x+i.w,i.y+i.h]));
    if (drawing.pdfBackground) {
      const bg = drawing.pdfBackground;
      pts.push([bg.x,bg.y],[bg.x+bg.w,bg.y+bg.h]);
    }
    if (!pts.length) return;
    const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs);
    const minY=Math.min(...ys), maxY=Math.max(...ys);
    const padding = 1.1;
    const displayScale = Math.max((maxX-minX)/vp.w, (maxY-minY)/vp.h) * padding;
    commitSheet(s => {
      const v = s.viewports.find(v => v.id === vp.id);
      if (v) { v.centerX=(minX+maxX)/2; v.centerY=(minY+maxY)/2; v.displayScale=Math.max(1,Math.round(displayScale)); }
    });
  }

  function startZoomWindow(vp) {
    setZoomWindowVpId(vp.id);
    setTool('zoom-window');
  }

  function applyZoomWindow(vpId, box) {
    const vp = (activeSheet.viewports||[]).find(v => v.id === vpId);
    if (!vp) return;
    const {x,y,w,h} = box;
    if (w < 2 || h < 2) return;
    const renderScale = vp.displayScale || vp.scale;
    const worldLeft   = (x       - vp.x - vp.w/2) * renderScale + (vp.centerX||0);
    const worldTop    = (y       - vp.y - vp.h/2) * renderScale + (vp.centerY||0);
    const worldRight  = (x+w     - vp.x - vp.w/2) * renderScale + (vp.centerX||0);
    const worldBottom = (y+h     - vp.y - vp.h/2) * renderScale + (vp.centerY||0);
    const newCenterX  = (worldLeft+worldRight)/2;
    const newCenterY  = (worldTop+worldBottom)/2;
    const newScale    = Math.max((worldRight-worldLeft)/vp.w, (worldBottom-worldTop)/vp.h);
    commitSheet(s => {
      const v = s.viewports.find(v => v.id === vp.id);
      if (v) { v.centerX=newCenterX; v.centerY=newCenterY; v.displayScale=Math.max(1,Math.round(newScale)); }
    });
  }

  // ── Mouse down ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setVpCtxMenu(null);
    const pt = svgPt(e);

    if (tool === 'viewport' || tool === 'zoom-window') {
      setDrawingVp({ x1:pt.x, y1:pt.y, x2:pt.x, y2:pt.y });
      return;
    }
    if (tool === 'text') {
      const id = 'txt-'+Math.random().toString(36).slice(2,8);
      commitSheet(s => { s.texts=[...(s.texts||[]),{id,x:pt.x,y:pt.y,w:60,h:10,label:'Text',autoSize:true}]; });
      setTool('select'); setSelectedId(id);
      setEditingAnnotId(id); setEditingAnnotVal('Text');
      return;
    }
    if (tool === 'annotate') {
      const id = 'ann-'+Math.random().toString(36).slice(2,8);
      commitSheet(s => { s.annotations=[...(s.annotations||[]),{id,x:pt.x,y:pt.y,w:45,h:22,label:'Note',arrowX:pt.x+22,arrowY:pt.y+35}]; });
      setTool('select'); setSelectedId(id);
      setEditingAnnotId(id); setEditingAnnotVal('Note');
      return;
    }
    if (tool === 'keyblock') {
      const id = 'kb-'+Math.random().toString(36).slice(2,8);
      commitSheet(s => { s.keyBlocks=[...(s.keyBlocks||[]),{id,x:pt.x,y:pt.y,w:90,h:70,drawingId:drawings[0]?.id||null}]; });
      setTool('select'); setSelectedId(id);
      return;
    }
    setSelectedId(null);
  }, [tool, activeSheet, drawings, ps]);

  function startVpDrag(e, vp, handle) {
    if (tool !== 'select') return; // Let click fall through to canvas onMouseDown for placement tools
    e.stopPropagation();
    if (vp.locked) { setSelectedId(vp.id); return; }
    setSelectedId(vp.id);
    const pt = svgPt(e);
    if (!handle && e.ctrlKey) {
      setDragging({ id:vp.id, kind:'viewport-pan', startX:pt.x, startY:pt.y, origCX:vp.centerX||0, origCY:vp.centerY||0, vpScale:vp.displayScale||vp.scale });
    } else {
      setDragging({ id:vp.id, kind:'viewport', handle:handle||null, startX:pt.x, startY:pt.y, origX:vp.x, origY:vp.y, origW:vp.w, origH:vp.h });
    }
  }

  function startAnnotDrag(e, obj, kind) {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(obj.id);
    const pt = svgPt(e);
    setDragging({ id:obj.id, kind, startX:pt.x, startY:pt.y, origX:obj.x, origY:obj.y });
  }
  function startArrowDrag(e, a) {
    e.stopPropagation();
    const pt = svgPt(e);
    setDragging({ id:a.id, kind:'annot-arrow', startX:pt.x, startY:pt.y, origAX:a.arrowX??(a.x+(a.w||45)/2), origAY:a.arrowY??(a.y+(a.h||22)+15) });
  }
  function startResizeDrag(e, obj, resizeKind) {
    e.stopPropagation();
    const pt = svgPt(e);
    setDragging({ id:obj.id, kind:resizeKind, handle:'se', startX:pt.x, startY:pt.y, origW:obj.w||45, origH:obj.h||22, origX:obj.x, origY:obj.y });
  }
  function startKbDrag(e, kb, handle) {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(kb.id);
    const pt = svgPt(e);
    if (handle === 'se') {
      setDragging({ id:kb.id, kind:'keyblock-resize', startX:pt.x, startY:pt.y, origW:kb.w, origH:kb.h, origX:kb.x, origY:kb.y });
    } else {
      setDragging({ id:kb.id, kind:'keyblock', startX:pt.x, startY:pt.y, origX:kb.x, origY:kb.y });
    }
  }

  // ── Mouse move ────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e) => {
    const pt = svgPt(e);
    const dg = draggingRef.current;
    if (drawingVp) { setDrawingVp(d => ({...d, x2:pt.x, y2:pt.y})); return; }
    if (!dg) return;
    const dx = pt.x - dg.startX, dy = pt.y - dg.startY;

    if (dg.kind === 'viewport-pan') {
      softSheet(s => {
        const vp = s.viewports.find(v => v.id === dg.id);
        if (vp) { vp.centerX = dg.origCX - dx * dg.vpScale; vp.centerY = dg.origCY - dy * dg.vpScale; }
      });
      return;
    }
    if (dg.kind === 'viewport') {
      softSheet(s => {
        const vp = s.viewports.find(v => v.id === dg.id);
        if (!vp) return;
        if (!dg.handle) { vp.x = dg.origX+dx; vp.y = dg.origY+dy; }
        else {
          const h = dg.handle; const nx=pt.x, ny=pt.y;
          if (h==='tl'){vp.w=Math.max(20,dg.origX+dg.origW-nx);vp.h=Math.max(15,dg.origY+dg.origH-ny);vp.x=Math.min(nx,dg.origX+dg.origW);vp.y=Math.min(ny,dg.origY+dg.origH);}
          if (h==='tr'){vp.w=Math.max(20,nx-dg.origX);vp.h=Math.max(15,dg.origY+dg.origH-ny);vp.x=dg.origX;vp.y=Math.min(ny,dg.origY+dg.origH);}
          if (h==='br'){vp.w=Math.max(20,nx-dg.origX);vp.h=Math.max(15,ny-dg.origY);vp.x=dg.origX;vp.y=dg.origY;}
          if (h==='bl'){vp.w=Math.max(20,dg.origX+dg.origW-nx);vp.h=Math.max(15,ny-dg.origY);vp.x=Math.min(nx,dg.origX+dg.origW);vp.y=dg.origY;}
        }
      });
      return;
    }
    if (dg.kind === 'annotation' || dg.kind === 'text') {
      softSheet(s => {
        const arr = dg.kind==='annotation' ? s.annotations : s.texts;
        const obj = (arr||[]).find(o => o.id===dg.id);
        if (obj) { obj.x=dg.origX+dx; obj.y=dg.origY+dy; }
      });
      return;
    }
    if (dg.kind === 'annot-resize') {
      softSheet(s => { const a=(s.annotations||[]).find(a=>a.id===dg.id); if(a){a.w=Math.max(15,dg.origW+dx);a.h=Math.max(10,dg.origH+dy);} });
      return;
    }
    if (dg.kind === 'text-resize') {
      softSheet(s => {
        const t=(s.texts||[]).find(t=>t.id===dg.id); if(!t) return;
        if(dg.handle==='se'){t.w=Math.max(15,dg.origW+dx);t.h=Math.max(4,dg.origH+dy);}
        else if(dg.handle==='sw'){const nw=Math.max(15,dg.origW-dx);t.x=dg.origX+dg.origW-nw;t.w=nw;t.h=Math.max(4,dg.origH+dy);}
      });
      return;
    }
    if (dg.kind === 'annot-arrow') {
      softSheet(s => { const a=(s.annotations||[]).find(a=>a.id===dg.id); if(a){a.arrowX=dg.origAX+dx;a.arrowY=dg.origAY+dy;} });
      return;
    }
    if (dg.kind === 'keyblock') {
      softSheet(s => { const kb=(s.keyBlocks||[]).find(k=>k.id===dg.id); if(kb){kb.x=dg.origX+dx;kb.y=dg.origY+dy;} });
      return;
    }
    if (dg.kind === 'keyblock-resize') {
      softSheet(s => { const kb=(s.keyBlocks||[]).find(k=>k.id===dg.id); if(kb){kb.w=Math.max(30,dg.origW+dx);kb.h=Math.max(20,dg.origH+dy);} });
      return;
    }
  }, [drawingVp, activeSheet]);

  const onMouseUp = useCallback(() => {
    if (drawingVp) {
      const {x1,y1,x2,y2} = drawingVp;
      const x=Math.min(x1,x2), y=Math.min(y1,y2), w=Math.abs(x2-x1), h=Math.abs(y2-y1);
      if (tool === 'zoom-window' && zoomWindowVpId) {
        if (w>2 && h>2) applyZoomWindow(zoomWindowVpId, {x,y,w,h});
        setZoomWindowVpId(null); setTool('select');
      } else if (w > 10 && h > 10) {
        const vp = { id:'vp-'+Math.random().toString(36).slice(2,8), drawingId:drawings[0]?.id||null, x,y,w,h,scale:50,centerX:0,centerY:0 };
        commitSheet(s => s.viewports.push(vp));
        setSelectedId(vp.id);
        setTool('select');
      }
      setDrawingVp(null);
      return;
    }
    if (dragging) { commit(p=>p); setDragging(null); }
  }, [drawingVp, dragging, drawings, tool, zoomWindowVpId, activeSheet]);

  // ── Delete ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if ((e.key==='Delete'||e.key==='Backspace') && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA' && selectedId) {
        commitSheet(s => {
          s.viewports   = (s.viewports||[]).filter(v=>v.id!==selectedId);
          s.annotations = (s.annotations||[]).filter(a=>a.id!==selectedId);
          s.texts       = (s.texts||[]).filter(t=>t.id!==selectedId);
          s.keyBlocks   = (s.keyBlocks||[]).filter(k=>k.id!==selectedId);
        });
        setSelectedId(null);
      }
      if (e.key==='Escape') { setTool('select'); setZoomWindowVpId(null); setDrawingVp(null); }
      if ((e.ctrlKey||e.metaKey) && e.key==='c') copySelected();
      if ((e.ctrlKey||e.metaKey) && e.key==='v') pasteClipboard();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedId, activeSheet, clipboard]);

  // ── Copy / Paste ──────────────────────────────────────────────────────────
  function copySelected() {
    if (!selectedId) return;
    const vp  = (activeSheet.viewports  ||[]).find(v=>v.id===selectedId);
    const ann = (activeSheet.annotations||[]).find(a=>a.id===selectedId);
    const txt = (activeSheet.texts      ||[]).find(t=>t.id===selectedId);
    const kb  = (activeSheet.keyBlocks  ||[]).find(k=>k.id===selectedId);
    const item = vp || ann || txt || kb;
    if (item) setClipboard({ ...item, _kind: vp?'viewport':ann?'annotation':txt?'text':'keyBlock' });
  }

  function pasteClipboard() {
    if (!clipboard) return;
    const newId = Math.random().toString(36).slice(2,10) + Date.now().toString(36);
    const copy = { ...clipboard, id: newId, x: (clipboard.x||0)+5, y: (clipboard.y||0)+5 };
    const { _kind, ...item } = copy;
    commitSheet(s => {
      if (_kind==='viewport')   { if(!s.viewports)   s.viewports=[];   s.viewports.push(item); }
      if (_kind==='annotation') { if(!s.annotations) s.annotations=[]; s.annotations.push(item); }
      if (_kind==='text')       { if(!s.texts)       s.texts=[];       s.texts.push(item); }
      if (_kind==='keyBlock')   { if(!s.keyBlocks)   s.keyBlocks=[];   s.keyBlocks.push(item); }
    });
    setSelectedId(newId);
  }

  // ── Title block editing ───────────────────────────────────────────────────
  function startTitleEdit(field, val, e) { e.stopPropagation(); setEditingTitleField(field); setEditingTitleVal(val||''); }
  function commitTitleEdit() {
    const f=editingTitleField, v=editingTitleVal;
    commitSheet(s => { if(!s.titleBlock)s.titleBlock={}; s.titleBlock[f]=v; });
    setEditingTitleField(null);
  }
  function onAnnotDblClick(e, obj, kind) { e.stopPropagation(); setEditingAnnotId(obj.id); setEditingAnnotVal(obj.label||''); }
  function commitAnnotEdit(id, kind) {
    const val = editingAnnotVal;
    commitSheet(s => {
      const arr = kind==='annotation' ? s.annotations : s.texts;
      const obj = (arr||[]).find(o=>o.id===id); if(obj) obj.label=val;
    });
    setEditingAnnotId(null);
  }

  // ── Derived selection ─────────────────────────────────────────────────────
  const selVp    = selectedId ? (activeSheet.viewports||[]).find(v=>v.id===selectedId) : null;
  const selAnnot = selectedId ? (activeSheet.annotations||[]).find(a=>a.id===selectedId) : null;
  const selText  = selectedId ? (activeSheet.texts||[]).find(t=>t.id===selectedId) : null;
  const selKb    = selectedId ? (activeSheet.keyBlocks||[]).find(k=>k.id===selectedId) : null;

  const TOOLS = [
    {id:'select',   icon:'↖', label:'Select'},
    {id:'viewport', icon:'⬜', label:'Viewport'},
    {id:'text',     icon:'T',  label:'Text'},
    {id:'annotate', icon:'📌', label:'Note'},
    {id:'keyblock', icon:'🔑', label:'Key'},
  ];

  const isZoomWindow = tool === 'zoom-window';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#0d1117'}}
      onClick={() => setVpCtxMenu(null)}>

      {/* Toolbar */}
      <div style={sty.sheetBar}>
        <span style={sty.modeLabel}>Drawing Sheet</span>
        <div style={{display:'flex',gap:2}}>
          {TOOLS.map(t => (
            <button key={t.id} title={t.label}
              style={{...sty.toolBtn,...(tool===t.id?sty.toolActive:{})}}
              onClick={() => { setTool(t.id); setZoomWindowVpId(null); }}>
              <span style={{fontSize:14}}>{t.icon}</span>
              <span style={{fontSize:9}}>{t.label}</span>
            </button>
          ))}
        </div>
        {isZoomWindow && (
          <div style={{fontSize:10,color:'#ffd032',marginLeft:8,flexShrink:0}}>
            📐 Draw a box over the viewport area — Esc to cancel
          </div>
        )}
        <div style={{display:'flex',gap:6,marginLeft:'auto',alignItems:'center'}}>
          <select style={sty.sel} value={activeSheet.paperSize}
            onChange={e => commitSheet(s => s.paperSize=e.target.value)}>
            {Object.keys(PAPER).map(k => <option key={k}>{k}</option>)}
          </select>
          <select style={sty.sel} value={activeSheet.orientation}
            onChange={e => commitSheet(s => s.orientation=e.target.value)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
          <button style={{...sty.toolBtn,background:'#0f2a0f',borderColor:'#1a6030',color:'#68d391'}}
            onClick={doPrint}>🖨 Print</button>
        </div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* Sheet SVG canvas */}
        <div ref={containerRef} style={sty.canvasArea}>
          <svg ref={svgRef} width={svgW} height={svgH}
            style={{background:'white',boxShadow:'0 4px 32px rgba(0,0,0,0.7)',display:'block',
              cursor:(tool==='viewport'||tool==='zoom-window')?'crosshair':'default'}}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onContextMenu={e => {
              e.preventDefault();
              if (!vpCtxMenu) setSheetCtxMenu({ sx: e.clientX, sy: e.clientY, itemId: selectedId });
            }}>

            <rect x={0} y={0} width={svgW} height={svgH} fill="white" />

            {/* Margin guide */}
            <rect x={MARGIN*ps} y={MARGIN*ps} width={(pw-MARGIN*2)*ps} height={(ph-MARGIN*2-totalFooterH)*ps}
              fill="none" stroke="#e0e0e0" strokeWidth={0.5} strokeDasharray="3 3"
              style={{pointerEvents:'none'}} />

            {/* Viewports */}
            {(activeSheet.viewports||[]).map(vp => (
              <ViewportEl key={vp.id} vp={vp}
                drawing={drawings.find(d=>d.id===vp.drawingId)} fixtureTypes={fixtureTypes}
                layers={project.layers||[]}
                ps={ps} selected={selectedId===vp.id}
                onMouseDown={(e,v,h) => startVpDrag(e,v,h)}
                onContextMenu={(e,v) => { e.stopPropagation(); setVpCtxMenu({sx:e.clientX,sy:e.clientY,vp:v}); }} />
            ))}

            {/* Key Blocks */}
            {(activeSheet.keyBlocks||[]).map(kb => (
              <KeyBlockEl key={kb.id} kb={kb} drawings={drawings} fixtureTypes={fixtureTypes}
                ps={ps} selected={selectedId===kb.id}
                onMouseDown={(e,k,h) => startKbDrag(e,k,h)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelectedId(kb.id); setSheetCtxMenu({sx:e.clientX,sy:e.clientY,itemId:kb.id}); }} />
            ))}

            {/* Annotations */}
            {(activeSheet.annotations||[]).map(a => {
              const sel = selectedId===a.id;
              const aw=a.w||45, ah2=a.h||22;
              const arrowX=(a.arrowX??(a.x+aw/2))*ps;
              const arrowY=(a.arrowY??(a.y+ah2+15))*ps;
              const bCx=(a.x+aw/2)*ps, bCy=(a.y+ah2)*ps;
              return (
                <g key={a.id}>
                  <line x1={bCx} y1={bCy} x2={arrowX} y2={arrowY}
                    stroke="rgba(180,140,0,0.8)" strokeWidth={1} style={{pointerEvents:'none'}} />
                  <polygon points={arrowheadPoints(bCx,bCy,arrowX,arrowY,7*ps/96,3.5*ps/96)}
                    fill="rgba(180,140,0,0.8)" style={{pointerEvents:'none'}} />
                  <g onMouseDown={e=>startAnnotDrag(e,a,'annotation')}
                    onDoubleClick={e=>onAnnotDblClick(e,a,'annotation')}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelectedId(a.id);setSheetCtxMenu({sx:e.clientX,sy:e.clientY,itemId:a.id});}}
                    style={{cursor:'move'}}>
                    <rect x={a.x*ps} y={a.y*ps} width={aw*ps} height={ah2*ps}
                      fill="rgba(255,220,50,0.18)"
                      stroke={sel?'#ffd032':'rgba(255,190,0,0.55)'}
                      strokeWidth={sel?1:0.5} rx={2} />
                    <clipPath id={`ann-clip-${a.id}`}>
                      <rect x={a.x*ps+2} y={a.y*ps} width={aw*ps-4} height={ah2*ps} />
                    </clipPath>
                    <text x={(a.x+2)*ps} y={(a.y+ah2*0.55)*ps}
                      fontSize={Math.min(ah2*0.38,5)*ps} fill="#776000"
                      clipPath={`url(#ann-clip-${a.id})`}
                      style={{userSelect:'none',pointerEvents:'none'}}>
                      {editingAnnotId===a.id?'':a.label}
                    </text>
                  </g>
                  {sel && <g data-print-hide="true">
                    <rect x={(a.x+aw)*ps-4} y={(a.y+ah2)*ps-4} width={7} height={7}
                      fill="#ffd032" stroke="white" strokeWidth={0.5} style={{cursor:'se-resize'}}
                      onMouseDown={e=>startResizeDrag(e,a,'annot-resize')} />
                    <circle cx={arrowX} cy={arrowY} r={5}
                      fill="rgba(255,208,50,0.5)" stroke="#ffd032" strokeWidth={1}
                      style={{cursor:'crosshair'}} onMouseDown={e=>startArrowDrag(e,a)} />
                  </g>}
                </g>
              );
            })}

            {/* Sheet texts */}
            {(activeSheet.texts||[]).map(t => {
              const sel = selectedId===t.id;
              const tw=t.w||60, th=t.h||10;
              const fs=(t.autoSize!==false ? th*0.55 : (t.fontSize||th*0.55))*ps;
              return (
                <g key={t.id}
                  onMouseDown={e=>startAnnotDrag(e,t,'text')}
                  onDoubleClick={e=>onAnnotDblClick(e,t,'text')}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelectedId(t.id);setSheetCtxMenu({sx:e.clientX,sy:e.clientY,itemId:t.id});}}
                  style={{cursor:'move'}}>
                  <defs>
                    <clipPath id={`txt-clip-${t.id}`}>
                      <rect x={t.x*ps+1} y={t.y*ps} width={tw*ps-2} height={th*ps} />
                    </clipPath>
                  </defs>
                  <rect x={t.x*ps} y={t.y*ps} width={tw*ps} height={th*ps}
                    fill="transparent"
                    stroke={sel?'#2a6090':'rgba(42,96,144,0.3)'}
                    strokeWidth={sel?1:0.5} strokeDasharray={sel?'none':'3 2'} rx={1}
                    data-print-hide="true" />
                  <text x={(t.x+1)*ps} y={(t.y+th*0.72)*ps}
                    fontSize={fs} fill={sel?'#2a6090':'#222'}
                    clipPath={`url(#txt-clip-${t.id})`}
                    style={{userSelect:'none',pointerEvents:'none'}}
                    data-print-text="true">
                    {editingAnnotId===t.id?'':t.label}
                  </text>
                  {sel && <g data-print-hide="true">
                    <rect x={(t.x+tw)*ps-4} y={(t.y+th)*ps-4} width={7} height={7}
                      fill="white" stroke="#2a6090" strokeWidth={1} style={{cursor:'se-resize'}}
                      onMouseDown={e=>startResizeDrag(e,t,'text-resize')} />
                    <rect x={t.x*ps-4} y={(t.y+th)*ps-4} width={7} height={7}
                      fill="white" stroke="#2a6090" strokeWidth={1} style={{cursor:'sw-resize'}}
                      onMouseDown={e => {
                        e.stopPropagation();
                        const pt=svgPt(e);
                        setDragging({id:t.id,kind:'text-resize',handle:'sw',startX:pt.x,startY:pt.y,origW:tw,origH:th,origX:t.x,origY:t.y});
                      }} />
                  </g>}
                </g>
              );
            })}

            {/* Drag ghost (viewport or zoom-window) */}
            {drawingVp && (() => {
              const gx=Math.min(drawingVp.x1,drawingVp.x2)*ps, gy=Math.min(drawingVp.y1,drawingVp.y2)*ps;
              const gw=Math.abs(drawingVp.x2-drawingVp.x1)*ps, gh=Math.abs(drawingVp.y2-drawingVp.y1)*ps;
              const isZW = tool==='zoom-window';
              return <rect x={gx} y={gy} width={gw} height={gh}
                fill={isZW?'rgba(255,208,50,0.1)':'rgba(42,96,144,0.1)'}
                stroke={isZW?'#ffd032':'#2a6090'} strokeWidth={1} strokeDasharray="4 3" />;
            })()}

            {/* Title block */}
            {(() => {
              const tbY=(ph-totalFooterH)*ps;
              const tbH=titleH*ps;
              const logoW=18;
              const tx2=(MARGIN+(tb.logoDataUrl?logoW+2:2))*ps;
              // Font sizes — proportional to block height, no text stretching
              const titleFs = Math.min(titleH*0.3, 9) * ps;
              const metaFs  = Math.min(titleH*0.13, 3.8) * ps;

              return (
                <g>
                  <rect x={0} y={tbY} width={svgW} height={tbH} fill="#f4f4f4" stroke="#ccc" strokeWidth={0.5} />
                  {tb.logoDataUrl && (
                    <image href={tb.logoDataUrl} x={MARGIN*ps} y={tbY+ps} width={logoW*ps} height={tbH-2*ps}
                      preserveAspectRatio="xMidYMid meet" />
                  )}
                  {/* Title — font scales with block, no textLength stretching */}
                  <text x={tx2} y={tbY+tbH*0.38} fontSize={titleFs} fontWeight="bold" fill="#111"
                    style={{cursor:'text'}}
                    onDoubleClick={e=>startTitleEdit('title',tb.title,e)}>
                    {editingTitleField==='title'?'':(tb.title||'Double-click to set title')}
                  </text>
                  {[
                    ['designer',`Designer: ${tb.designer||'—'}`,0.58],
                    ['studio',  `Studio: ${tb.studio||'—'}`,   0.73],
                    ['date',    `Date: ${tb.date||'—'}`,        0.88],
                  ].map(([field,label,yr]) => (
                    <text key={field} x={tx2} y={tbY+tbH*yr} fontSize={metaFs} fill="#333"
                      style={{cursor:'text'}} onDoubleClick={e=>startTitleEdit(field,tb[field],e)}>
                      {editingTitleField===field?'':label}
                    </text>
                  ))}
                  <text x={svgW-MARGIN*ps} y={tbY+tbH*0.58} textAnchor="end" fontSize={metaFs} fill="#333">
                    Dwg: {tb.drawingNumber||'—'}
                  </text>

                  {/* Notes strip */}
                  {notesStripH>0 && (() => {
                    const nsY=(ph-notesStripH)*ps, nsH=notesStripH*ps;
                    const nFs=Math.min(notesStripH*0.22, 3)*ps;
                    const lineH=Math.min(notesStripH*0.25, 3.6)*ps;
                    const lines=(tb.notes||'').split('\n');
                    return (
                      <>
                        <rect x={0} y={nsY} width={svgW} height={nsH} fill="#fffff8" stroke="#e0e0c0" strokeWidth={0.5} />
                        <text x={MARGIN*ps} y={nsY+nFs*1.2} fontSize={nFs} fill="#555"
                          style={{cursor:'text'}} onDoubleClick={e=>startTitleEdit('notes',tb.notes,e)}>
                          {lines.map((line,i) => (
                            <tspan key={i} x={MARGIN*ps} dy={i===0?0:lineH}>{line}</tspan>
                          ))}
                        </text>
                      </>
                    );
                  })()}
                </g>
              );
            })()}

            <rect x={0.5} y={0.5} width={svgW-1} height={svgH-1}
              fill="none" stroke="#999" strokeWidth={1} style={{pointerEvents:'none'}} />
          </svg>

          {/* Title block inline editor */}
          {editingTitleField && (() => {
            const tbY=(ph-totalFooterH)*ps, tbH=titleH*ps;
            const yMap = { title:tbY+tbH*0.2, designer:tbY+tbH*0.45, studio:tbY+tbH*0.6, date:tbY+tbH*0.75, notes:(ph-notesStripH)*ps+2 };
            const rect = svgRef.current?.getBoundingClientRect();
            const tx2=(MARGIN+(tb.logoDataUrl?20:2))*ps;
            return (
              <input autoFocus
                style={{position:'fixed',left:(rect?.left||0)+tx2,top:(rect?.top||0)+(yMap[editingTitleField]||0),
                  fontSize:editingTitleField==='title'?14:11,background:'rgba(255,255,240,0.97)',
                  border:'1px solid #2a6090',borderRadius:2,color:'#111',padding:'1px 4px',outline:'none',minWidth:160,zIndex:500}}
                value={editingTitleVal} onChange={e=>setEditingTitleVal(e.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={e=>{if(e.key==='Enter')commitTitleEdit();if(e.key==='Escape')setEditingTitleField(null);e.stopPropagation();}} />
            );
          })()}

          {/* Annotation/text inline editor */}
          {editingAnnotId && (() => {
            const all=[...(activeSheet.annotations||[]),...(activeSheet.texts||[])];
            const obj=all.find(o=>o.id===editingAnnotId);
            const kind=(activeSheet.annotations||[]).some(a=>a.id===editingAnnotId)?'annotation':'text';
            if(!obj) return null;
            const rect=svgRef.current?.getBoundingClientRect();
            return (
              <input autoFocus
                style={{position:'fixed',left:(rect?.left||0)+obj.x*ps,top:(rect?.top||0)+obj.y*ps,fontSize:12,
                  background:kind==='annotation'?'rgba(255,255,220,0.97)':'rgba(240,247,255,0.97)',
                  border:`1px solid ${kind==='annotation'?'#ffd032':'#2a6090'}`,borderRadius:2,
                  color:'#111',padding:'1px 4px',outline:'none',minWidth:80,zIndex:500}}
                value={editingAnnotVal} onChange={e=>setEditingAnnotVal(e.target.value)}
                onBlur={()=>commitAnnotEdit(editingAnnotId,kind)}
                onKeyDown={e=>{if(e.key==='Enter')commitAnnotEdit(editingAnnotId,kind);if(e.key==='Escape')setEditingAnnotId(null);e.stopPropagation();}} />
            );
          })()}
        </div>

        {/* Inspector */}
        <div style={sty.inspector}>
          {selVp    && <VpInspector    vp={selVp}      drawings={drawings}
            onUpdate={f=>commitSheet(s=>{const v=s.viewports.find(v=>v.id===selVp.id);if(v)Object.assign(v,f);})}
            onDelete={()=>{commitSheet(s=>{s.viewports=s.viewports.filter(v=>v.id!==selVp.id);});setSelectedId(null);}}
            onZoomExtents={()=>zoomVpToExtents(selVp)}
            onZoomWindow={()=>startZoomWindow(selVp)} />}
          {selAnnot && <AnnotInspector obj={selAnnot} label="Note"
            onUpdate={f=>commitSheet(s=>{const a=(s.annotations||[]).find(a=>a.id===selAnnot.id);if(a)Object.assign(a,f);})}
            onDelete={()=>{commitSheet(s=>{s.annotations=s.annotations.filter(a=>a.id!==selAnnot.id);});setSelectedId(null);}} />}
          {selText  && <TextInspector  obj={selText}
            onUpdate={f=>commitSheet(s=>{const t=(s.texts||[]).find(t=>t.id===selText.id);if(t)Object.assign(t,f);})}
            onDelete={()=>{commitSheet(s=>{s.texts=s.texts.filter(t=>t.id!==selText.id);});setSelectedId(null);}} />}
          {selKb    && <KbInspector    kb={selKb}      drawings={drawings}
            onUpdate={f=>commitSheet(s=>{const k=(s.keyBlocks||[]).find(k=>k.id===selKb.id);if(k)Object.assign(k,f);})}
            onDelete={()=>{commitSheet(s=>{s.keyBlocks=(s.keyBlocks||[]).filter(k=>k.id!==selKb.id);});setSelectedId(null);}} />}
          {!selVp&&!selAnnot&&!selText&&!selKb && (
            <SheetSettings sheet={activeSheet}
              onUpdate={fields=>commitSheet(s=>Object.assign(s.titleBlock,fields))}
              onUpdatePaper={fields=>commitSheet(s=>Object.assign(s,fields))} />
          )}
        </div>
      </div>

      {/* ── Print Preview Modal ──────────────────────────────────────────── */}
      {printPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', zIndex:1100 }}>
          {/* Toolbar */}
          <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center' }}>
            <span style={{ color:'#e0e0e0', fontSize:13, fontWeight:600 }}>🖨 Print Preview</span>
            <span style={{ color:'#718096', fontSize:11 }}>{printPreview.pwMm}×{printPreview.phMm} mm</span>
            <button
              style={{ padding:'6px 20px', background:'#0f3460', border:'1px solid #4a90d9', borderRadius:4,
                color:'#4a90d9', cursor:'pointer', fontSize:13, fontWeight:600 }}
              onClick={confirmPrint}>
              🖨 Print…
            </button>
            <button
              style={{ padding:'6px 14px', background:'#3a1a1a', border:'1px solid #7a2a2a', borderRadius:4,
                color:'#fc8181', cursor:'pointer', fontSize:13 }}
              onClick={() => setPrintPreview(null)}>
              Cancel
            </button>
          </div>
          {/* Preview image */}
          <div style={{ background:'white', boxShadow:'0 8px 40px rgba(0,0,0,0.8)',
            maxWidth:'90vw', maxHeight:'80vh', overflow:'auto' }}>
            <img
              src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(printPreview.svgData)))}`}
              alt="Print preview"
              style={{ display:'block', maxWidth:'100%', maxHeight:'80vh' }}
            />
          </div>
        </div>
      )}

      {/* Sheet context menu (right-click on canvas / selected item) */}
      {sheetCtxMenu && !vpCtxMenu && (
        <div style={{position:'fixed',left:sheetCtxMenu.sx,top:sheetCtxMenu.sy,background:'#16213e',
          border:'1px solid #0f3460',borderRadius:4,boxShadow:'0 4px 20px rgba(0,0,0,0.6)',zIndex:999,minWidth:160}}
          onMouseLeave={()=>setSheetCtxMenu(null)}>
          {sheetCtxMenu.itemId && <>
            <div style={ctxSty.item} onClick={()=>{copySelected();setSheetCtxMenu(null);}}>
              📋 Copy
            </div>
          </>}
          {clipboard && (
            <div style={ctxSty.item} onClick={()=>{pasteClipboard();setSheetCtxMenu(null);}}>
              📌 Paste
            </div>
          )}
          {sheetCtxMenu.itemId && (
            <div style={{...ctxSty.item,borderTop:'1px solid #0f3460',color:'#fc8181'}}
              onClick={()=>{
                commitSheet(s=>{
                  s.viewports   =(s.viewports||[]).filter(v=>v.id!==sheetCtxMenu.itemId);
                  s.annotations =(s.annotations||[]).filter(a=>a.id!==sheetCtxMenu.itemId);
                  s.texts       =(s.texts||[]).filter(t=>t.id!==sheetCtxMenu.itemId);
                  s.keyBlocks   =(s.keyBlocks||[]).filter(k=>k.id!==sheetCtxMenu.itemId);
                });
                setSelectedId(null); setSheetCtxMenu(null);
              }}>
              🗑 Delete
            </div>
          )}
          {!sheetCtxMenu.itemId && !clipboard && (
            <div style={{...ctxSty.item,color:'#718096',cursor:'default'}}>Nothing to paste</div>
          )}
        </div>
      )}

      {/* Viewport context menu */}
      {vpCtxMenu && (
        <div style={{position:'fixed',left:vpCtxMenu.sx,top:vpCtxMenu.sy,background:'#16213e',
          border:'1px solid #0f3460',borderRadius:4,boxShadow:'0 4px 20px rgba(0,0,0,0.6)',zIndex:999,minWidth:190}}
          onMouseLeave={()=>setVpCtxMenu(null)}>
          <div style={ctxSty.item} onClick={()=>{
            commitSheet(s=>{const v=s.viewports.find(v=>v.id===vpCtxMenu.vp.id);if(v)v.locked=!v.locked;});
            setVpCtxMenu(null);
          }}>{vpCtxMenu.vp.locked?'🔓 Unlock Viewport':'🔒 Lock Viewport'}</div>
          <div style={ctxSty.item} onClick={()=>{zoomVpToExtents(vpCtxMenu.vp);setVpCtxMenu(null);}}>
            📐 Zoom to Extents
          </div>
          <div style={ctxSty.item} onClick={()=>{startZoomWindow(vpCtxMenu.vp);setVpCtxMenu(null);}}>
            🔍 Zoom to Window…
          </div>
          <div style={ctxSty.item} onClick={()=>{
            const vp=vpCtxMenu.vp;
            setClipboard({...vp,id:Date.now().toString(36),x:vp.x+10,y:vp.y+10,_kind:'viewport'});
            setVpCtxMenu(null);
          }}>📋 Copy Viewport</div>
          <div style={{...ctxSty.item,borderTop:'1px solid #0f3460',color:'#fc8181'}}
            onClick={()=>{commitSheet(s=>{s.viewports=s.viewports.filter(v=>v.id!==vpCtxMenu.vp.id);});setSelectedId(null);setVpCtxMenu(null);}}>
            🗑 Delete Viewport
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-inspectors ────────────────────────────────────────────────────────────
function VpInspector({ vp, drawings, onUpdate, onDelete, onZoomExtents, onZoomWindow }) {
  return (
    <div style={sty.insp}>
      <div style={sty.inspHeader}>Viewport</div>
      <InspField label="Plot">
        <select style={sty.inp} value={vp.drawingId||''} onChange={e=>onUpdate({drawingId:e.target.value})}>
          {drawings.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </InspField>
      <InspField label="Scale 1:">
        <input style={sty.inp} type="number" min={1} value={vp.scale}
          onChange={e=>onUpdate({scale:Math.max(1,Number(e.target.value)),displayScale:undefined})} />
      </InspField>
      {vp.displayScale && Math.round(vp.displayScale)!==Math.round(vp.scale) && (
        <InspField label="Display scale 1: (false)">
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <input style={{...sty.inp,flex:1}} type="number" min={1} value={Math.round(vp.displayScale)}
              onChange={e=>onUpdate({displayScale:Math.max(1,Number(e.target.value))})} />
            <button style={{...sty.delBtn,width:'auto',padding:'2px 6px',fontSize:9}}
              onClick={()=>onUpdate({displayScale:undefined})}>Reset</button>
          </div>
        </InspField>
      )}
      <InspField label="Centre X (world)">
        <input style={sty.inp} type="number" value={Math.round(vp.centerX||0)} onChange={e=>onUpdate({centerX:Number(e.target.value)})} />
      </InspField>
      <InspField label="Centre Y (world)">
        <input style={sty.inp} type="number" value={Math.round(vp.centerY||0)} onChange={e=>onUpdate({centerY:Number(e.target.value)})} />
      </InspField>
      <InspField label="X (mm)"><input style={sty.inp} type="number" value={Math.round(vp.x)} onChange={e=>onUpdate({x:Number(e.target.value)})} /></InspField>
      <InspField label="Y (mm)"><input style={sty.inp} type="number" value={Math.round(vp.y)} onChange={e=>onUpdate({y:Number(e.target.value)})} /></InspField>
      <InspField label="W (mm)"><input style={sty.inp} type="number" value={Math.round(vp.w)} onChange={e=>onUpdate({w:Number(e.target.value)})} /></InspField>
      <InspField label="H (mm)"><input style={sty.inp} type="number" value={Math.round(vp.h)} onChange={e=>onUpdate({h:Number(e.target.value)})} /></InspField>
      <div style={{padding:'6px 10px',display:'flex',flexDirection:'column',gap:4}}>
        <button style={{...sty.actBtn}} onClick={onZoomExtents}>📐 Zoom to Extents</button>
        <button style={{...sty.actBtn}} onClick={onZoomWindow}>🔍 Zoom to Window…</button>
        <button style={{...sty.actBtn,background:vp.locked?'#0f3a1a':undefined,borderColor:vp.locked?'#1a8040':'#2a6090',color:vp.locked?'#68d391':'#60b0ff'}}
          onClick={()=>onUpdate({locked:!vp.locked})}>
          {vp.locked?'🔓 Unlock Viewport':'🔒 Lock Viewport'}
        </button>
        <div style={{fontSize:9,color:'#718096',lineHeight:1.5}}>
          Ctrl+drag to pan · scroll to zoom
        </div>
        <button style={sty.delBtn} onClick={onDelete}>🗑 Delete viewport</button>
      </div>
    </div>
  );
}

function AnnotInspector({ obj, label, onUpdate, onDelete }) {
  return (
    <div style={sty.insp}>
      <div style={sty.inspHeader}>{label}</div>
      <InspField label="Text">
        <input style={sty.inp} value={obj.label||''} onChange={e=>onUpdate({label:e.target.value})} />
      </InspField>
      <InspField label="W (mm)">
        <input style={sty.inp} type="number" value={Math.round(obj.w||45)} onChange={e=>onUpdate({w:Number(e.target.value)})} />
      </InspField>
      <InspField label="H (mm)">
        <input style={sty.inp} type="number" value={Math.round(obj.h||22)} onChange={e=>onUpdate({h:Number(e.target.value)})} />
      </InspField>
      <div style={{padding:'4px 10px',fontSize:9,color:'#718096'}}>Drag the yellow ● to reposition the arrow tip.</div>
      <div style={{padding:'4px 10px'}}>
        <button style={sty.delBtn} onClick={onDelete}>🗑 Delete</button>
      </div>
    </div>
  );
}

function TextInspector({ obj, onUpdate, onDelete }) {
  return (
    <div style={sty.insp}>
      <div style={sty.inspHeader}>Text Box</div>
      <InspField label="Text">
        <input style={sty.inp} value={obj.label||''} onChange={e=>onUpdate({label:e.target.value})} />
      </InspField>
      <InspField label="W (mm)">
        <input style={sty.inp} type="number" value={Math.round(obj.w||60)} onChange={e=>onUpdate({w:Number(e.target.value)})} />
      </InspField>
      <InspField label="H (mm)">
        <input style={sty.inp} type="number" value={Math.round(obj.h||10)} onChange={e=>onUpdate({h:Number(e.target.value)})} />
      </InspField>
      <InspField label="Font size">
        <label style={{fontSize:10,color:'#aaa',display:'flex',gap:3,alignItems:'center'}}>
          <input type="checkbox" checked={obj.autoSize!==false}
            onChange={e=>onUpdate({autoSize:e.target.checked})} style={{accentColor:'#4a90d9'}} />
          Auto-fit to box
        </label>
      </InspField>
      {obj.autoSize===false && (
        <InspField label="Font size (mm)">
          <input style={sty.inp} type="number" value={obj.fontSize||Math.round((obj.h||10)*0.55)}
            onChange={e=>onUpdate({fontSize:Number(e.target.value),autoSize:false})} />
        </InspField>
      )}
      <div style={{padding:'4px 10px'}}>
        <button style={sty.delBtn} onClick={onDelete}>🗑 Delete</button>
      </div>
    </div>
  );
}

function KbInspector({ kb, drawings, onUpdate, onDelete }) {
  return (
    <div style={sty.insp}>
      <div style={sty.inspHeader}>Legend / Key</div>
      <InspField label="Plot">
        <select style={sty.inp} value={kb.drawingId||''} onChange={e=>onUpdate({drawingId:e.target.value})}>
          {drawings.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </InspField>
      <InspField label="W (mm)">
        <input style={sty.inp} type="number" value={Math.round(kb.w)} onChange={e=>onUpdate({w:Number(e.target.value)})} />
      </InspField>
      <InspField label="H (mm)">
        <input style={sty.inp} type="number" value={Math.round(kb.h)} onChange={e=>onUpdate({h:Number(e.target.value)})} />
      </InspField>
      <div style={{padding:'4px 10px',fontSize:9,color:'#718096'}}>
        Shows all fixture types used in the selected plot.
      </div>
      <div style={{padding:'4px 10px'}}>
        <button style={sty.delBtn} onClick={onDelete}>🗑 Delete</button>
      </div>
    </div>
  );
}

function SheetSettings({ sheet, onUpdate, onUpdatePaper }) {
  const tb = sheet.titleBlock || {};
  return (
    <div style={sty.insp}>
      <div style={sty.inspHeader}>Sheet Settings</div>
      {[['Title','title'],['Designer','designer'],['Studio','studio'],['Date','date'],['Drawing #','drawingNumber']].map(([lbl,k]) => (
        <InspField key={k} label={lbl}>
          <input style={sty.inp} value={tb[k]||''} onChange={e=>onUpdate({[k]:e.target.value})} />
        </InspField>
      ))}
      <InspField label="Title block size">
        <div style={{display:'flex',gap:4}}>
          {['small','medium','large'].map(sz => (
            <label key={sz} style={{fontSize:10,color:'#e0e0e0',display:'flex',alignItems:'center',gap:2,cursor:'pointer'}}>
              <input type="radio" checked={(tb.titleBlockSize||'medium')===sz}
                onChange={()=>onUpdate({titleBlockSize:sz})} style={{accentColor:'#4a90d9',margin:0}} />
              {sz[0].toUpperCase()+sz.slice(1)}
            </label>
          ))}
        </div>
      </InspField>
      <InspField label="Notes">
        <textarea style={{...sty.inp,height:52,resize:'vertical',fontFamily:'inherit'}}
          value={tb.notes||''} onChange={e=>onUpdate({notes:e.target.value})} />
      </InspField>
      <InspField label="Notes strip size">
        <div style={{display:'flex',gap:4}}>
          {['small','medium','large'].map(sz => (
            <label key={sz} style={{fontSize:10,color:'#e0e0e0',display:'flex',alignItems:'center',gap:2,cursor:'pointer'}}>
              <input type="radio" checked={(tb.notesSize||'medium')===sz}
                onChange={()=>onUpdate({notesSize:sz})} style={{accentColor:'#4a90d9',margin:0}} />
              {sz[0].toUpperCase()+sz.slice(1)}
            </label>
          ))}
        </div>
      </InspField>
    </div>
  );
}

function InspField({ label, children }) {
  return (
    <div style={{padding:'4px 10px',borderBottom:'1px solid #0f3460'}}>
      <div style={{fontSize:9,color:'#718096',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{label}</div>
      {children}
    </div>
  );
}

const ctxSty = { item: { padding:'9px 14px', cursor:'pointer', fontSize:13, color:'#e0e0e0' } };

const sty = {
  sheetBar: {display:'flex',alignItems:'center',background:'#16213e',borderBottom:'1px solid #0f3460',padding:'4px 10px',gap:6,flexShrink:0,height:44},
  modeLabel: {fontSize:10,fontWeight:700,color:'#60b0ff',textTransform:'uppercase',letterSpacing:'0.1em',marginRight:8,flexShrink:0},
  toolBtn: {display:'flex',flexDirection:'column',alignItems:'center',background:'transparent',border:'1px solid transparent',borderRadius:4,color:'#a0aec0',cursor:'pointer',padding:'2px 6px',minWidth:40,height:36,fontSize:10,gap:1},
  toolActive: {background:'#0f3460',border:'1px solid #2a6090',color:'#60b0ff'},
  sel: {background:'#0d1b2a',border:'1px solid #0f3460',borderRadius:3,color:'#e0e0e0',fontSize:11,padding:'3px 6px'},
  canvasArea: {flex:1,overflow:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:24,background:'#1a1a2e'},
  inspector: {width:196,flexShrink:0,borderLeft:'1px solid #0f3460',overflowY:'auto',background:'#16213e'},
  insp: {display:'flex',flexDirection:'column'},
  inspHeader: {padding:'7px 10px',fontSize:10,fontWeight:700,color:'#4a90d9',textTransform:'uppercase',letterSpacing:'0.1em',borderBottom:'1px solid #0f3460'},
  inp: {width:'100%',background:'#0d1b2a',border:'1px solid #0f3460',borderRadius:3,color:'#e0e0e0',fontSize:11,padding:'3px 6px',boxSizing:'border-box',outline:'none'},
  delBtn: {background:'#3a1a1a',border:'1px solid #7a2a2a',borderRadius:3,color:'#fc8181',cursor:'pointer',fontSize:11,padding:'3px 8px',width:'100%'},
  actBtn: {background:'#0f2a4a',border:'1px solid #2a6090',borderRadius:3,color:'#60b0ff',cursor:'pointer',fontSize:11,padding:'4px 8px',width:'100%',textAlign:'left'},
};
