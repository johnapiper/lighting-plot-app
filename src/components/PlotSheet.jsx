import React, { useState, useRef } from 'react';

const PAPER_SIZES = {
  A4:      { w: 297,   h: 210   },
  A3:      { w: 420,   h: 297   },
  A2:      { w: 594,   h: 420   },
  A1:      { w: 841,   h: 594   },
  Letter:  { w: 279.4, h: 215.9 },
  Tabloid: { w: 431.8, h: 279.4 },
};

const MARGIN = 12;
const KEY_W = 50;
const FIXTURE_MM = 7;
const FIXTURE_SPAN = 44;
const FIXTURE_S = FIXTURE_MM / FIXTURE_SPAN;

// Title block (logo + title/designer/studio/date/drawing#) heights
const TITLE_H_MAP = { small: 18, medium: 28, large: 42 };
// Notes strip below title block
const NOTES_H_MAP = { small: 12, medium: 22, large: 38 };

function getBounds(drawing) {
  if (!drawing) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const pts = [];
  (drawing.pipes||[]).forEach(p => pts.push([p.x1, p.y1], [p.x2, p.y2]));
  (drawing.fixtures||[]).forEach(f => pts.push([f.x, f.y]));
  (drawing.lines||[]).forEach(l => pts.push([l.x1, l.y1], [l.x2, l.y2]));
  (drawing.rectangles||[]).forEach(r => pts.push([r.x, r.y], [r.x+r.w, r.y+r.h]));
  (drawing.images||[]).forEach(i => pts.push([i.x, i.y], [i.x+i.w, i.y+i.h]));
  if (drawing.pdfBackground) {
    const b = drawing.pdfBackground;
    pts.push([b.x, b.y], [b.x + b.w, b.y + b.h]);
  }
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export default function PlotSheet({ project, drawing, fixtureTypes, onClose, onCommitSheet }) {
  const sheet = project.drawingSheet || {};
  const [form, setForm] = useState({
    paperSize:    sheet.paperSize    || 'A3',
    orientation:  sheet.orientation  || 'landscape',
    scale:        sheet.scale        || 25,
    scaleFit:     sheet.scaleFit     ?? true,
    scaleCustom:  sheet.scaleCustom  || '',
    title:        sheet.title        || '',
    designer:     sheet.designer     || '',
    date:         sheet.date         || new Date().toISOString().slice(0, 10),
    studio:       sheet.studio       || '',
    drawingNumber:sheet.drawingNumber|| '',
    notes:          sheet.notes          || '',
    notesSize:      sheet.notesSize      || 'medium',
    titleBlockSize: sheet.titleBlockSize || 'medium',
    logoDataUrl:    sheet.logoDataUrl    || null,
  });
  const logoRef = useRef(null);

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const paper = PAPER_SIZES[form.paperSize] || PAPER_SIZES.A3;
  const pw = form.orientation === 'landscape' ? paper.w : paper.h;
  const ph = form.orientation === 'landscape' ? paper.h : paper.w;

  const TITLE_CONTENT_H = TITLE_H_MAP[form.titleBlockSize] || TITLE_H_MAP.medium;
  const NOTES_STRIP_H   = form.notes?.trim() ? (NOTES_H_MAP[form.notesSize] || NOTES_H_MAP.medium) : 0;
  const TITLE_H = TITLE_CONTENT_H + NOTES_STRIP_H;

  const vpX = MARGIN, vpY = MARGIN;
  const vpW = pw - MARGIN * 2 - KEY_W;
  const vpH = ph - MARGIN * 2 - TITLE_H;

  const bounds = getBounds(drawing);
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;

  let drawScale;
  if (form.scaleFit) {
    drawScale = Math.max(worldW / vpW, worldH / vpH, 0.1) * 1.12;
  } else if (form.scaleCustom) {
    drawScale = Number(form.scaleCustom) || form.scale;
  } else {
    drawScale = form.scale;
  }
  const mmPerPx = 1 / drawScale;

  const drawnW = worldW * mmPerPx, drawnH = worldH * mmPerPx;
  const offsetX = (vpW - drawnW) / 2, offsetY = (vpH - drawnH) / 2;

  const usedTypeIds = [...new Set((drawing?.fixtures||[]).map(f => f.fixtureTypeId))];
  const usedTypes = usedTypeIds.map(id => fixtureTypes.find(t => t.id === id)).filter(Boolean);
  const KEY_ROW_H = 9;

  const previewScale = Math.min(580 / pw, 380 / ph);

  function handleLogoFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => upd('logoDataUrl', ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePrint() { onCommitSheet(form); setTimeout(() => window.print(), 100); }

  function wx(x) { return vpX + offsetX + (x - bounds.minX) * mmPerPx; }
  function wy(y) { return vpY + offsetY + (y - bounds.minY) * mmPerPx; }

  const d = drawing || {};

  return (
    <div style={styles.overlay}>
      <div style={styles.window}>
        <div style={styles.titleBar}>
          <span style={styles.titleText}>Plot Sheet / Print</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.btn} onClick={() => { onCommitSheet(form); onClose(); }}>Save</button>
            <button style={{ ...styles.btn, background: '#0f5030', borderColor: '#1a9060', color: '#68d391' }} onClick={handlePrint}>Print</button>
            <button style={{ ...styles.btn, ...styles.closeBtn }} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={styles.body}>
          {/* Settings */}
          <div style={styles.settings}>
            <Section title="Paper">
              <Row label="Size">
                <select style={styles.inp} value={form.paperSize} onChange={e => upd('paperSize', e.target.value)}>
                  {Object.keys(PAPER_SIZES).map(k => <option key={k}>{k}</option>)}
                </select>
              </Row>
              <Row label="Orientation">
                <select style={styles.inp} value={form.orientation} onChange={e => upd('orientation', e.target.value)}>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </Row>
            </Section>

            <Section title="Scale">
              <RadioRow checked={form.scaleFit} onChange={() => upd('scaleFit', true)} label="Fit to extents" />
              <RadioRow checked={!form.scaleFit && !form.scaleCustom} onChange={() => { upd('scaleFit', false); upd('scaleCustom', ''); }}
                label={<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>1:<input type="number" style={{ ...styles.inp, width: 56 }} disabled={form.scaleFit || !!form.scaleCustom} value={form.scale} onChange={e => upd('scale', Number(e.target.value))} /></span>} />
              <RadioRow checked={!form.scaleFit && !!form.scaleCustom} onChange={() => { upd('scaleFit', false); upd('scaleCustom', form.scale || 25); }}
                label={<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Custom 1:<input type="number" style={{ ...styles.inp, width: 56 }} disabled={form.scaleFit || !form.scaleCustom} value={form.scaleCustom || ''} onChange={e => upd('scaleCustom', e.target.value)} /></span>} />
              <div style={styles.scaleInfo}>Effective scale 1:{Math.round(drawScale)}</div>
            </Section>

            <Section title="Title Block">
              {[['Title / Show','title'],['Designer','designer'],['Studio','studio'],['Date','date'],['Drawing #','drawingNumber']].map(([lbl,key]) => (
                <Row key={key} label={lbl}>
                  <input style={styles.inp} value={form[key]} onChange={e => upd(key, e.target.value)} />
                </Row>
              ))}
              <Row label="Logo">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button style={{ ...styles.btn, padding: '3px 8px', fontSize: 10 }} onClick={() => logoRef.current.click()}>{form.logoDataUrl ? 'Change' : 'Upload'}</button>
                  {form.logoDataUrl && <button style={{ ...styles.btn, padding: '3px 8px', fontSize: 10, ...styles.closeBtn }} onClick={() => upd('logoDataUrl', null)}>✕</button>}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoFile} />
              </Row>
            </Section>

            <Section title="Title Block">
              <Row label="Title block height">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['small','medium','large'].map(sz => (
                    <label key={sz} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, color: '#e0e0e0' }}>
                      <input type="radio" checked={form.titleBlockSize === sz} onChange={() => upd('titleBlockSize', sz)} style={{ accentColor: '#4a90d9', margin: 0 }} />
                      {sz.charAt(0).toUpperCase() + sz.slice(1)}
                    </label>
                  ))}
                </div>
              </Row>
            </Section>

            <Section title="Notes">
              <Row label="Notes section height">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['small','medium','large'].map(sz => (
                    <label key={sz} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, color: '#e0e0e0' }}>
                      <input type="radio" checked={form.notesSize === sz} onChange={() => upd('notesSize', sz)} style={{ accentColor: '#4a90d9', margin: 0 }} />
                      {sz.charAt(0).toUpperCase() + sz.slice(1)}
                    </label>
                  ))}
                </div>
              </Row>
              <textarea
                style={{ ...styles.inp, height: 60, resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                value={form.notes}
                onChange={e => upd('notes', e.target.value)}
                placeholder="Drawing notes…"
              />
            </Section>
          </div>

          {/* Preview */}
          <div style={styles.preview}>
            <div style={styles.previewLabel}>{form.paperSize} {form.orientation} — preview ({drawing?.name || 'Drawing'})</div>
            <div style={{ overflow: 'auto', flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12 }}>
              <svg
                width={pw * previewScale} height={ph * previewScale}
                viewBox={`0 0 ${pw} ${ph}`}
                style={{ background: 'white', display: 'block', boxShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
                className="plot-sheet-svg"
              >
                <rect x={0} y={0} width={pw} height={ph} fill="white" />
                <defs><clipPath id="vp-clip"><rect x={vpX} y={vpY} width={vpW} height={vpH} /></clipPath></defs>

                <g clipPath="url(#vp-clip)">
                  {/* PDF background */}
                  {d.pdfBackground && (
                    <image href={d.pdfBackground.dataUrl} x={wx(d.pdfBackground.x)} y={wy(d.pdfBackground.y)}
                      width={d.pdfBackground.w * mmPerPx} height={d.pdfBackground.h * mmPerPx} opacity={d.pdfBackground.opacity ?? 0.5} />
                  )}
                  {/* Images */}
                  {(d.images||[]).map(img => <image key={img.id} href={img.dataUrl} x={wx(img.x)} y={wy(img.y)} width={img.w * mmPerPx} height={img.h * mmPerPx} />)}
                  {/* Lines */}
                  {(d.lines||[]).map(l => <line key={l.id} x1={wx(l.x1)} y1={wy(l.y1)} x2={wx(l.x2)} y2={wy(l.y2)} stroke="#555" strokeWidth={0.3} />)}
                  {/* Rects */}
                  {(d.rectangles||[]).map(r => <rect key={r.id} x={wx(r.x)} y={wy(r.y)} width={r.w*mmPerPx} height={r.h*mmPerPx} stroke="#555" strokeWidth={0.3} fill="none" />)}
                  {/* Texts */}
                  {(d.texts||[]).map(t => <text key={t.id} x={wx(t.x)} y={wy(t.y)} fontSize={3} fill="#333">{t.label}</text>)}
                  {/* Annotations */}
                  {(d.annotations||[]).map(a => (
                    <g key={a.id}>
                      <rect x={wx(a.x)} y={wy(a.y)} width={(a.w||120)*mmPerPx} height={(a.h||50)*mmPerPx} fill="rgba(255,220,50,0.12)" stroke="#cca000" strokeWidth={0.2} rx={0.5} />
                      <text x={wx(a.x)+0.5} y={wy(a.y)+3} fontSize={2} fill="#776000">{a.label}</text>
                    </g>
                  ))}
                  {/* Pipes */}
                  {(d.pipes||[]).map(p => (
                    <g key={p.id}>
                      <line x1={wx(p.x1)} y1={wy(p.y1)} x2={wx(p.x2)} y2={wy(p.y2)} stroke="#806000" strokeWidth={0.7} strokeLinecap="round" />
                      <text x={(wx(p.x1)+wx(p.x2))/2} y={(wy(p.y1)+wy(p.y2))/2-1.5} textAnchor="middle" fontSize={2.2} fill="#604000">{p.name}</text>
                    </g>
                  ))}
                  {/* Fixtures */}
                  {(d.fixtures||[]).map(f => {
                    const ftype = fixtureTypes.find(t => t.id === f.fixtureTypeId);
                    if (!ftype) return null;
                    return (
                      <g key={f.id} transform={`translate(${wx(f.x)},${wy(f.y)})`}>
                        <g transform={`rotate(${f.rotation||0}) scale(${FIXTURE_S*(f.scale||1)})`} style={{ color: '#111', strokeWidth: 1.5 }}>
                          <g dangerouslySetInnerHTML={{ __html: ftype.symbol }} />
                        </g>
                        {f.colourHex && <circle cx={0} cy={-FIXTURE_MM*0.4} r={FIXTURE_MM*0.15} fill={f.colourHex} />}
                        {f.unit?.trim() && <text x={0} y={FIXTURE_MM*0.8} textAnchor="middle" fontSize={2.2} fill="#111">{f.unit}</text>}
                        {f.channel?.trim() && <text x={0} y={FIXTURE_MM*0.8+2.8} textAnchor="middle" fontSize={1.8} fill="#555">Ch{f.channel}</text>}
                      </g>
                    );
                  })}
                </g>

                {/* Viewport border */}
                <rect x={vpX} y={vpY} width={vpW} height={vpH} fill="none" stroke="#bbb" strokeWidth={0.2} strokeDasharray="2 2" />

                {/* Key panel */}
                <rect x={pw-MARGIN-KEY_W} y={MARGIN} width={KEY_W} height={vpH} fill="#f9f9f9" stroke="#ccc" strokeWidth={0.3} />
                <text x={pw-MARGIN-KEY_W+KEY_W/2} y={MARGIN+5} textAnchor="middle" fontSize={3.5} fontWeight="bold" fill="#111">Key</text>
                <line x1={pw-MARGIN-KEY_W} y1={MARGIN+7} x2={pw-MARGIN} y2={MARGIN+7} stroke="#ccc" strokeWidth={0.3} />
                {usedTypes.map((ft, i) => (
                  <g key={ft.id} transform={`translate(${pw-MARGIN-KEY_W+3},${MARGIN+10+i*KEY_ROW_H})`}>
                    <g transform={`scale(${3.5/FIXTURE_SPAN})`} style={{ color: '#222' }}>
                      <g dangerouslySetInnerHTML={{ __html: ft.symbol }} />
                    </g>
                    <text x={6} y={3.5} fontSize={2.5} fill="#222">{ft.name}</text>
                  </g>
                ))}

                {/* Title block — title content section */}
                {(() => {
                  const tbY = ph - MARGIN - TITLE_H;
                  const tx = MARGIN + (form.logoDataUrl ? 28 : 3);
                  const lineH = TITLE_CONTENT_H / 4.2;
                  const titleFs = Math.min(7, TITLE_CONTENT_H * 0.28);
                  const metaFs = Math.min(3.2, TITLE_CONTENT_H * 0.1);
                  return (
                    <>
                      <rect x={MARGIN} y={tbY} width={pw-MARGIN*2} height={TITLE_CONTENT_H} fill="#f4f4f4" stroke="#333" strokeWidth={0.4} />
                      {form.logoDataUrl && (
                        <image href={form.logoDataUrl} x={MARGIN+2} y={tbY+1} width={24} height={TITLE_CONTENT_H-2} preserveAspectRatio="xMidYMid meet" />
                      )}
                      <text x={tx} y={tbY + TITLE_CONTENT_H*0.35} fontSize={titleFs} fontWeight="bold" fill="#111">{form.title || 'Untitled Show'}</text>
                      <text x={tx} y={tbY + TITLE_CONTENT_H*0.55} fontSize={metaFs} fill="#333">Designer: {form.designer || '—'}</text>
                      <text x={tx} y={tbY + TITLE_CONTENT_H*0.7} fontSize={metaFs} fill="#333">Studio: {form.studio || '—'}</text>
                      <text x={tx} y={tbY + TITLE_CONTENT_H*0.85} fontSize={metaFs} fill="#333">Date: {form.date || '—'}</text>
                      <text x={pw-MARGIN-3} y={tbY + TITLE_CONTENT_H*0.55} textAnchor="end" fontSize={metaFs} fill="#333">Scale 1:{Math.round(drawScale)}</text>
                      <text x={pw-MARGIN-3} y={tbY + TITLE_CONTENT_H*0.7} textAnchor="end" fontSize={metaFs} fill="#333">Dwg: {form.drawingNumber || '—'}</text>
                    </>
                  );
                })()}
                {/* Notes section — independent height below title block */}
                {NOTES_STRIP_H > 0 && (() => {
                  const nsY = ph - MARGIN - NOTES_STRIP_H;
                  const notesFs = Math.min(3, NOTES_STRIP_H * 0.22);
                  const maxChars = form.notesSize === 'large' ? 400 : form.notesSize === 'medium' ? 200 : 100;
                  return (
                    <>
                      <rect x={MARGIN} y={nsY} width={pw-MARGIN*2} height={NOTES_STRIP_H} fill="#fffff8" stroke="#ccc" strokeWidth={0.3} />
                      <text x={MARGIN+3} y={nsY + notesFs + 1} fontSize={notesFs} fill="#555" style={{ whiteSpace: 'pre-wrap' }}>
                        {form.notes?.slice(0, maxChars)}
                      </text>
                    </>
                  );
                })()}

                <rect x={MARGIN/2} y={MARGIN/2} width={pw-MARGIN} height={ph-MARGIN} fill="none" stroke="#333" strokeWidth={0.5} />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          .plot-sheet-svg { width: 100vw !important; height: 100vh !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={styles.rowLabel}>{label}</label>
      {children}
    </div>
  );
}
function RadioRow({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#e0e0e0' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ margin: 0, accentColor: '#4a90d9' }} />
      {label}
    </label>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 1000 },
  window: { background: '#16213e', border: '1px solid #0f3460', width: '98vw', margin: '10px auto', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.9)', borderRadius: 6 },
  titleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  titleText: { color: '#4a90d9', fontWeight: 700, fontSize: 14 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  settings: { width: 260, flexShrink: 0, borderRight: '1px solid #0f3460', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #0f3460', paddingBottom: 3, marginBottom: 5 },
  rowLabel: { fontSize: 9, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.06em' },
  inp: { background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '3px 6px', width: '100%', boxSizing: 'border-box' },
  scaleInfo: { fontSize: 11, color: '#4a90d9', marginTop: 2 },
  preview: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  previewLabel: { fontSize: 10, color: '#718096', padding: '8px 12px', borderBottom: '1px solid #0f3460' },
  btn: { background: '#0f3460', border: '1px solid #1a4a7a', borderRadius: 4, color: '#a0aec0', padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  closeBtn: { background: '#3a1a1a', borderColor: '#7a2a2a', color: '#fc8181' },
};
