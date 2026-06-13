import { useState, useCallback, useRef } from 'react';
import { generateId } from '../canvas/geometry';

const MAX_HISTORY = 50;
function clone(s) { return JSON.parse(JSON.stringify(s)); }

export const DEFAULT_LAYERS = [
  { id: 'layer-bg',       name: 'Background',   color: '#4a5568', visible: true,  locked: false },
  { id: 'layer-arch',     name: 'Architecture', color: '#607d8b', visible: true,  locked: false },
  { id: 'layer-lighting', name: 'Lighting',     color: '#e0c060', visible: true,  locked: false },
];

// ── CAD drawing / plot (model space) ────────────────────────────────────────
// UI calls these "Plots" to distinguish from Drawing (sheet) mode.
export function makeDrawing(id, name) {
  return {
    id:   id   || ('drawing-' + Math.random().toString(36).slice(2, 8)),
    name: name || 'Plot 1',
    pipes: [], fixtures: [], lines: [], rectangles: [],
    texts: [], images: [],
    pdfBackground: null,
    calibration: null,   // {p1,p2,worldDist,realDist,unit}
    dimensions: [],      // dimension line annotations {id,x1,y1,x2,y2,layerId}
    infrastructure: [],  // power distros, DMX nodes, network switches/ports
    cables: [],          // cable connections between fixtures and/or infra
  };
}

// ── Sheet (paper / drawing space) ────────────────────────────────────────
export function makeSheet(id, name) {
  return {
    id:   id   || ('sheet-' + Math.random().toString(36).slice(2, 8)),
    name: name || 'Sheet 1',
    paperSize:   'A3',
    orientation: 'landscape',
    // Viewports: windows into the CAD model
    viewports: [],
    // Sheet-space objects (annotations, text, dimensions, key blocks live here)
    annotations: [],
    texts: [],
    keyBlocks: [],
    titleBlock: {
      title: '', designer: '', studio: '',
      date: new Date().toISOString().slice(0, 10),
      drawingNumber: '', logoDataUrl: null,
      notes: '', notesSize: 'medium', titleBlockSize: 'medium',
    },
  };
}

export function makeViewport(drawingId, x, y, w, h, scale) {
  return {
    id: generateId(),
    drawingId,
    x, y, w, h,       // position + size in mm on the sheet
    scale: scale || 50, // 1:N (world-units to mm ratio)
    centerX: 0,        // world-space center of this viewport view
    centerY: 0,
  };
}

export const initialProject = {
  // Model space
  drawings: [makeDrawing('drawing-1', 'Plot 1')],
  activeDrawingId: 'drawing-1',
  // Sheet space
  sheets: [makeSheet('sheet-1', 'Sheet 1')],
  activeSheetId: 'sheet-1',
  // UI state
  activeMode:    'cad',            // 'cad' | 'sheet'
  activeLayerId: 'layer-lighting', // current layer for new objects
  // Shared
  customFixtureTypes: [],
  layers: DEFAULT_LAYERS,
  meta: { title: 'Untitled', scale: 50, gridSize: 20, gridHeight: 6000, rigHeight: 5500 },
};

// ── Migration ─────────────────────────────────────────────────────────────
function migrateProject(loaded) {
  // Old flat format → drawings array
  if (!loaded.drawings) {
    const { pipes, fixtures, lines, rectangles, texts, images, annotations, pdfBackground, ...rest } = loaded;
    const d = makeDrawing('drawing-1', 'Drawing 1');
    d.pipes = pipes || []; d.fixtures = fixtures || [];
    d.lines = lines || []; d.rectangles = rectangles || [];
    d.texts = texts || []; d.images = images || [];
    d.pdfBackground = pdfBackground || null;
    loaded = { ...rest, drawings: [d], activeDrawingId: 'drawing-1' };
  }
  // Migrate drawing-level annotations → sheet annotations (annotations are sheet objects now)
  if (!loaded.sheets?.length) {
    const sheet = makeSheet('sheet-1', 'Sheet 1');
    // Migrate drawingSheet settings into title block
    if (loaded.drawingSheet) {
      const ds = loaded.drawingSheet;
      sheet.titleBlock = {
        title: ds.title || '', designer: ds.designer || '',
        studio: ds.studio || ds.venue || '',
        date: ds.date || new Date().toISOString().slice(0, 10),
        drawingNumber: ds.drawingNumber || '', logoDataUrl: ds.logoDataUrl || null,
        notes: ds.notes || '', notesSize: ds.notesSize || 'medium',
        titleBlockSize: ds.titleBlockSize || 'medium',
      };
      sheet.paperSize   = ds.paperSize   || 'A3';
      sheet.orientation = ds.orientation || 'landscape';
    }
    // Migrate annotations from drawings → sheet
    if (loaded.drawings) {
      loaded.drawings.forEach(d => {
        if (d.annotations?.length) {
          sheet.annotations.push(...d.annotations);
          d.annotations = [];
        }
      });
    }
    // Add a default viewport for the first drawing
    if (loaded.drawings?.[0]) {
      const vp = makeViewport(loaded.drawings[0].id, 12, 12, 350, 240, 50);
      sheet.viewports = [vp];
    }
    loaded.sheets = [sheet];
    loaded.activeSheetId = 'sheet-1';
  }
  // Ensure drawings no longer have annotations (those belong to sheets now)
  if (loaded.drawings) {
    loaded.drawings.forEach(d => { delete d.annotations; });
  }
  // Ensure keyBlocks array exists on all sheets
  if (loaded.sheets) {
    loaded.sheets.forEach(s => { if (!s.keyBlocks) s.keyBlocks = []; });
  }
  // Ensure infrastructure + cables arrays exist on all drawings
  if (loaded.drawings) {
    loaded.drawings.forEach(d => {
      if (!d.infrastructure) d.infrastructure = [];
      if (!d.cables)         d.cables = [];
    });
  }
  // Ensure meta has studio height settings
  if (!loaded.meta) loaded.meta = {};
  if (loaded.meta.gridHeight === undefined) loaded.meta.gridHeight = 6000;
  if (loaded.meta.rigHeight  === undefined) loaded.meta.rigHeight  = 5500;
  if (!loaded.layers?.length) loaded.layers = DEFAULT_LAYERS;
  if (!loaded.activeMode)    loaded.activeMode = 'cad';
  if (!loaded.activeLayerId) loaded.activeLayerId = 'layer-lighting';
  // venue → studio compat
  if (loaded.drawingSheet?.venue !== undefined && !loaded.drawingSheet?.studio) {
    loaded.drawingSheet.studio = loaded.drawingSheet.venue || '';
    delete loaded.drawingSheet.venue;
  }
  return loaded;
}

// ── Store hook ────────────────────────────────────────────────────────────
export function useProjectStore() {
  const [project, setProject] = useState(clone(initialProject));
  const history = useRef([clone(initialProject)]);
  const idx = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const commit = useCallback((updater) => {
    setProject(prev => {
      const next = typeof updater === 'function' ? updater(clone(prev)) : clone(updater);
      history.current = history.current.slice(0, idx.current + 1);
      history.current.push(clone(next));
      if (history.current.length > MAX_HISTORY) history.current.shift();
      idx.current = history.current.length - 1;
      setCanUndo(idx.current > 0); setCanRedo(false);
      return next;
    });
  }, []);

  const softUpdate = useCallback((updater) => {
    setProject(prev => {
      const next = typeof updater === 'function' ? updater(clone(prev)) : clone(updater);
      history.current[idx.current] = clone(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (idx.current <= 0) return;
    idx.current--;
    setProject(clone(history.current[idx.current]));
    setCanUndo(idx.current > 0); setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (idx.current >= history.current.length - 1) return;
    idx.current++;
    setProject(clone(history.current[idx.current]));
    setCanUndo(true); setCanRedo(idx.current < history.current.length - 1);
  }, []);

  const loadProject = useCallback((p) => {
    const loaded = migrateProject({ ...clone(initialProject), ...clone(p) });
    history.current = [loaded]; idx.current = 0;
    setProject(loaded); setCanUndo(false); setCanRedo(false);
  }, []);

  const resetProject = useCallback(() => {
    const fresh = clone(initialProject);
    history.current = [fresh]; idx.current = 0;
    setProject(fresh); setCanUndo(false); setCanRedo(false);
  }, []);

  return { project, commit, softUpdate, undo, redo, canUndo, canRedo, loadProject, resetProject };
}
