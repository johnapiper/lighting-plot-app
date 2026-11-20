import { ipcRenderer } from '../bridge';
import { toast } from '../components/Toast';
import { generateId } from '../canvas/geometry';
import { parseDXF, dxfToDrawingObjects, countObjects } from '../dxf/dxfReader';
import { exportDXF } from '../dxf/dxfWriter';
import { buildEosPatchTxt } from '../console/eosExport';
import { layoutMagicSheet, magicSheetCsv, renderMagicSheetPng } from '../console/magicSheet';

/**
 * Export / import handlers for the active plot: PNG, SVG, DXF, Eos patch and
 * Magic Sheet image. Extracted from App.jsx — behaviour is unchanged.
 */
export function useExports({ project, activeDrawing, commit, canEditCanvas, fitViewRef }) {
  function handleExportPNG() {
    const svg = document.querySelector('svg[data-plot-canvas]'); if (!svg || !ipcRenderer) return;
    const data = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = svg.clientWidth*2; canvas.height = svg.clientHeight*2;
    const img = new Image();
    img.onload = () => { canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height); ipcRenderer.send('export-png', canvas.toDataURL('image/png')); };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  }
  function handleExportSVG() {
    const svg = document.querySelector('svg[data-plot-canvas]'); if (!svg || !ipcRenderer) return;
    ipcRenderer.send('export-svg', new XMLSerializer().serializeToString(svg));
  }

  // ── DXF exchange ──────────────────────────────────────────────────────────
  async function handleExportDXF() {
    if (!ipcRenderer || !activeDrawing) return;
    const title = (project.meta?.title || 'lighting-plot').replace(/[\\/:*?"<>|]/g, '-');
    const r = await ipcRenderer.invoke('export-file', {
      filters: [{ name: 'DXF Drawing', extensions: ['dxf'] }],
      defaultPath: `${title}.dxf`,
      text: exportDXF(activeDrawing, project.layers || []),
    });
    if (r?.ok) toast(`Exported DXF (millimetres) — ${r.filePath.split(/[\\/]/).pop()}`, 'success');
    else if (r && !r.canceled) toast(`DXF export failed: ${r.reason}`, 'error');
  }

  async function handleImportDXF() {
    if (!ipcRenderer || !activeDrawing) return;
    if (!canEditCanvas) { toast('Plot is locked or read-only.', 'warn'); return; }
    const r = await ipcRenderer.invoke('import-file', { filters: [{ name: 'DXF Drawing', extensions: ['dxf'] }] });
    if (!r?.ok) { if (r && !r.canceled) toast(`Could not read DXF: ${r.reason}`, 'error'); return; }
    let parsed, objs, n;
    try {
      parsed = parseDXF(r.text);
      objs = dxfToDrawingObjects(parsed, { layerId: 'layer-dxf', newId: generateId });
      n = countObjects(objs);
    } catch (err) { toast(`Could not parse DXF: ${err.message}`, 'error'); return; }
    if (!n) { toast('No supported geometry found in that DXF (binary DXF and DWG are not supported).', 'warn'); return; }
    commit(proj => {
      if (!(proj.layers || []).some(l => l.id === 'layer-dxf')) {
        proj.layers = [...(proj.layers || []), { id: 'layer-dxf', name: 'DXF Import', color: '#9aa5b1', visible: true, locked: false }];
      }
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId);
      ['lines', 'circles', 'arcs', 'polylines', 'texts'].forEach(k => { d[k] = [...(d[k] || []), ...objs[k]]; });
      return proj;
    }, `Import DXF (${n} objects)`);
    const skipped = Object.entries(parsed.skipped).map(([k, v]) => `${v} ${k}`).join(', ');
    const unitNote = parsed.unitsKnown ? `units: ${parsed.unitName}` : 'no units in file — assumed millimetres';
    toast(`Imported ${n} objects from ${r.name} (${unitNote})${skipped ? `. Skipped: ${skipped}` : ''}`, parsed.unitsKnown ? 'success' : 'warn', { duration: 8000 });
    setTimeout(() => fitViewRef.current?.(), 50);
  }

  // ── Console exports (ETC Eos) ──────────────────────────────────────────────
  const exportBaseName = () => (project.meta?.title || 'lighting-plot').replace(/[\\/:*?"<>|]/g, '-');

  async function handleExportEosPatch() {
    if (!ipcRenderer || !activeDrawing) return;
    const { text, exported, skipped } = buildEosPatchTxt(activeDrawing.fixtures || []);
    if (!exported) { toast('No patched fixtures to export — give fixtures a channel or DMX address first.', 'warn'); return; }
    const r = await ipcRenderer.invoke('export-file', {
      filters: [{ name: 'Eos / Lightwright text', extensions: ['txt'] }],
      defaultPath: `${exportBaseName()} - Eos patch.txt`, text,
    });
    if (r?.ok) toast(`Exported ${exported} fixtures${skipped ? ` (${skipped} unpatched left out)` : ''}. On the console: File > Import > Lightwright.`, 'success', { duration: 9000 });
    else if (r && !r.canceled) toast(`Export failed: ${r.reason}`, 'error');
  }

  async function handleExportMagicSheet() {
    if (!ipcRenderer || !activeDrawing) return;
    const layout = layoutMagicSheet(activeDrawing);
    if (layout.empty) { toast('Nothing to export — add fixtures to the plot first.', 'warn'); return; }
    const png = renderMagicSheetPng(layout);
    const r = await ipcRenderer.invoke('export-file', {
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      defaultPath: `${exportBaseName()} - Magic Sheet.png`,
      base64: png.replace(/^data:image\/png;base64,/, ''),
      siblings: [{ ext: '.csv', text: magicSheetCsv(layout) }],
    });
    if (r?.ok) toast(`Saved ${layout.width}×${layout.height} Magic Sheet image plus a button-position CSV. In Eos: Magic Sheet editor > Image > Import.`, 'success', { duration: 10000 });
    else if (r && !r.canceled) toast(`Export failed: ${r.reason}`, 'error');
  }

  return { handleExportPNG, handleExportSVG, handleExportDXF, handleImportDXF, handleExportEosPatch, handleExportMagicSheet };
}
