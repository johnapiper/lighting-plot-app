import React, { useState, useEffect, useRef } from 'react';
import Canvas from './canvas/Canvas';
import Toolbar from './components/Toolbar';
import LibraryPanel from './components/LibraryPanel';
import InspectorPanel from './components/InspectorPanel';
import LayersPanel from './components/LayersPanel';
import DrawingTabs from './components/DrawingTabs';
import SheetEditor from './components/SheetEditor';
import SheetTabs from './components/SheetTabs';
import ReportWindow from './components/ReportWindow';
import PatchPanel from './components/PatchPanel';
import GDTFBrowserPanel from './components/GDTFBrowserPanel';
import StudioSettingsModal from './components/StudioSettingsModal';
import AppSettingsModal from './components/AppSettingsModal';
import CableReport from './components/CableReport';
import EOSImport from './components/EOSImport';
import InfraInspector, { CableInspector } from './components/InfraInspector';
import LicenseGate, { useLicense } from './components/LicenseGate';
import LicenseManager from './components/LicenseManager';
import MyLicenseModal from './components/MyLicenseModal';
import ShortcutsModal from './components/ShortcutsModal';
import UndoHistoryPanel from './components/UndoHistoryPanel';
import UniverseOverviewModal from './components/UniverseOverviewModal';
import RevisionHistoryModal from './components/RevisionHistoryModal';
import FixtureSwapModal from './components/FixtureSwapModal';
import ProjectTemplatesDialog from './components/ProjectTemplatesDialog';
import { calcCircuitLoad } from './cabling/ratings';
import { calcCableRoute } from './cabling/routing';
import { useProjectStore, makeDrawing, makeSheet } from './store/projectStore';
import { findDmxConflicts } from './components/PatchPanel';
import fixtureTypesData from '../data/fixtures.json';
import { generateId } from './canvas/geometry';
import { exportMVR } from './mvr/mvrExport';
import { importMVR } from './mvr/mvrImport';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

// ── DMX ↔ Channel sync ────────────────────────────────────────────────────
function parseDmx(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 2) return null;
  const u = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
  if (isNaN(u) || isNaN(c)) return null;
  return { universe: u, channel: c };
}
function syncFields(fields, cur) {
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

// ── PDF render ─────────────────────────────────────────────────────────────
// Uses pdfjs-dist v4 (compatible with Electron 31 / Chromium 126).
async function renderPdfToDataUrl(pdfDataUrl) {
  const path = require('path');
  const pdfDistDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjsPath  = path.join(pdfDistDir, 'build/pdf.mjs');
  const workerPath = path.join(pdfDistDir, 'build/pdf.worker.mjs');
  const toFileUrl  = p => 'file:///' + p.replace(/\\/g, '/');
  const pdfjsLib = await new Function('p', 'return import(p)')(toFileUrl(pdfjsPath));
  pdfjsLib.GlobalWorkerOptions.workerSrc = toFileUrl(workerPath);
  const raw = atob(pdfDataUrl.split(',')[1]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), w: viewport.width / 2, h: viewport.height / 2 };
}

// ── Group helpers ─────────────────────────────────────────────────────────
function getAllObjectsFromDrawing(d) {
  return [...(d.fixtures||[]), ...(d.pipes||[]), ...(d.lines||[]),
          ...(d.rectangles||[]), ...(d.texts||[]), ...(d.images||[])];
}
function setGroupIdInDrawing(d, ids, groupId) {
  const idSet = new Set(ids);
  ['fixtures','pipes','lines','rectangles','texts','images'].forEach(arr => {
    (d[arr]||[]).forEach(obj => { if (idSet.has(obj.id)) { if (groupId) obj.groupId = groupId; else delete obj.groupId; } });
  });
}

export default function AppWithLicense() {
  return (
    <LicenseGate>
      <App />
    </LicenseGate>
  );
}

function App() {
  const { project, commit, softUpdate, undo, redo, loadProject, resetProject, saveRevision, restoreRevision, historyStack, historyIdx } = useProjectStore();

  const [activeTool, setActiveTool]     = useState('select');
  const [pendingFixture, setPendingFixture] = useState(null);
  const [selectedId, setSelectedId]     = useState(null);
  const [selectedObj, setSelectedObj]   = useState(null);
  const [selectedIds, setSelectedIds]   = useState([]);
  const [showGrid, setShowGrid]         = useState(true);
  const [showRulers, setShowRulers]     = useState(true);
  const [pipeSnap, setPipeSnap]         = useState(true);
  const [zoom, setZoom]                 = useState(1);
  const [pan, setPan]                   = useState({ x: 100, y: 100 });
  const [report, setReport]             = useState(null);
  const [showPatch, setShowPatch]       = useState(false);
  const [showGdtfBrowser, setShowGdtfBrowser] = useState(false);
  const [showStudioSettings, setShowStudioSettings] = useState(false);
  const [showAppSettings, setShowAppSettings]       = useState(false);
  const [showCableReport, setShowCableReport]       = useState(false);
  const [showEOSImport, setShowEOSImport]           = useState(false);
  const [showLicenseManager, setShowLicenseManager] = useState(false);
  const [showMyLicense, setShowMyLicense]           = useState(false);
  const [showShortcuts, setShowShortcuts]           = useState(false);
  const [showUndoHistory, setShowUndoHistory]       = useState(false);
  const [showUniverse, setShowUniverse]             = useState(false);
  const [showRevisions, setShowRevisions]           = useState(false);
  const [swapFixtureIds, setSwapFixtureIds]         = useState(null); // array of ids or null
  const [showTemplates, setShowTemplates]           = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled]       = useState(true);
  const [animating, setAnimating]                   = useState(true);
  const license = useLicense();
  const [currentFile, setCurrentFile]   = useState(null);
  const [dirty, setDirty]               = useState(false);
  const [updateBanner, setUpdateBanner] = useState(null); // { version }

  const dragTargetLayerRef = useRef(null);
  const patchSnapshotRef   = useRef(null);
  const activeDrawingRef   = useRef(null);
  const fitViewRef         = useRef(null); // Canvas exposes its fitView() here

  // ── Derived state ────────────────────────────────────────────────────────
  const activeMode    = project.activeMode    || 'cad';
  const activeLayerId = project.activeLayerId || 'layer-lighting';
  const activeDrawing = project.drawings?.find(d => d.id === project.activeDrawingId) || project.drawings?.[0];
  const activeSheet   = project.sheets?.find(s => s.id === project.activeSheetId)     || project.sheets?.[0];
  activeDrawingRef.current = activeDrawing;

  // Custom types override built-ins with the same id (e.g. edited powerW on a built-in fixture)
  const customById = Object.fromEntries((project.customFixtureTypes || []).map(f => [f.id, f]));
  const allFixtureTypes = [
    ...fixtureTypesData.map(f => customById[f.id] || f),
    ...(project.customFixtureTypes || []).filter(f => !fixtureTypesData.some(b => b.id === f.id)),
  ];
  const dmxConflicts    = findDmxConflicts(activeDrawing?.fixtures || []);

  const allSelectedIds = [...new Set([...(selectedIds||[]), ...(selectedId ? [selectedId] : [])])];
  const groupInfo = (() => {
    if (allSelectedIds.length < 2) return null;
    const all = getAllObjectsFromDrawing(activeDrawing || {});
    const first = all.find(o => o.id === allSelectedIds[0]);
    if (!first?.groupId) return null;
    if (!allSelectedIds.every(id => all.find(o => o.id === id)?.groupId === first.groupId)) return null;
    return { groupId: first.groupId, memberCount: allSelectedIds.length };
  })();
  const canGroup   = allSelectedIds.length >= 2;
  const canUngroup = !!groupInfo;

  // ── IPC ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ipcRenderer) return;
    const handlers = {
      'menu-app-settings':  () => setShowAppSettings(true),
      'menu-check-updates': () => setShowAppSettings(true),
      'update-available':   (_, info) => setUpdateBanner({ version: info.version }),
      'menu-my-license': () => setShowMyLicense(true),
      'menu-license-manager': () => license?.hasFeature('license_manager') && setShowLicenseManager(true),
      'menu-deactivate': () => { if (confirm('Deactivate this license on this machine?')) license?.deactivate(); },
      'menu-new':    () => { resetProject(); setCurrentFile(null); setDirty(false); clearSelection(); },
      'menu-save':   handleSave,
      'save-file-as': (e, fp) => saveToFile(fp),
      'load-file':   (e, { filePath, data }) => {
        try { loadProject(JSON.parse(data)); setCurrentFile(filePath); setDirty(false); clearSelection(); }
        catch (err) { alert('Failed to load: ' + err.message); }
      },
      'open-recent': async (e, fp) => {
        try {
          if (fp.toLowerCase().endsWith('.mvr')) {
            const buf = require('fs').readFileSync(fp);
            const proj = await importMVR(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
            loadProject(proj); setCurrentFile(fp); setDirty(false); clearSelection();
          } else {
            loadProject(JSON.parse(require('fs').readFileSync(fp, 'utf8'))); setCurrentFile(fp); setDirty(false);
          }
        } catch (err) { alert('Could not open: ' + err.message); }
      },
      'menu-undo': undo, 'menu-redo': redo,
      'menu-delete': handleDelete,
      'menu-zoom-in':  () => setZoom(z => Math.min(20, z * 1.2)),
      'menu-zoom-out': () => setZoom(z => Math.max(0.02, z / 1.2)),
      'menu-fit':      () => { fitViewRef.current?.() || (setZoom(1) || setPan({ x: 100, y: 100 })); },
      'menu-toggle-grid':   () => setShowGrid(v => !v),
      'menu-toggle-rulers': () => setShowRulers(v => !v),
      'menu-export-png':    () => license?.hasFeature('mvr_export') ? handleExportPNG() : alert('Your license does not include export features.'),
      'menu-export-svg':    () => license?.hasFeature('mvr_export') ? handleExportSVG() : alert('Your license does not include export features.'),
      'menu-report-instrument': () => license?.hasFeature('reports') ? setReport({ type: 'instrument' }) : alert('Your license does not include reports.'),
      'menu-report-channel':    () => license?.hasFeature('reports') ? setReport({ type: 'channel' })     : alert('Your license does not include reports.'),
      'menu-report-dimmer':     () => license?.hasFeature('reports') ? setReport({ type: 'dimmer' })      : alert('Your license does not include reports.'),
      'pdf-opened':   (e, { dataUrl }) => license?.hasFeature('pdf_background') ? handlePdfData(dataUrl) : null,
      'image-opened': (e, { dataUrl, fileName }) => license?.hasFeature('pdf_background') ? handleImageData(dataUrl, fileName) : null,
      'load-mvr-file': async (e, { filePath, buffer }) => {
        if (!license?.hasFeature('mvr_import')) { alert('Your license does not include MVR import.'); return; }
        try {
          const proj = await importMVR(buffer);
          loadProject(proj);
          setCurrentFile(filePath);
          setDirty(false);
          clearSelection();
        } catch (err) { alert('Failed to import MVR: ' + err.message); }
      },
      'export-mvr-request': async (e, filePath) => {
        if (!license?.hasFeature('mvr_export')) { alert('Your license does not include MVR export.'); return; }
        try {
          const buf = await exportMVR(project, allFixtureTypes);
          ipcRenderer.send('save-mvr-data', { filePath, buffer: Array.from(buf) });
        } catch (err) { alert('Failed to export MVR: ' + err.message); }
      },
    };
    Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.on(ch, fn));
    return () => Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn));
  }, [project, currentFile, undo, redo]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey) {
        const canEdit = license?.hasFeature('cad_edit');
        if (k === 'v') setActiveTool('select');
        if (canEdit && k === 'l') setActiveTool('line');
        if (canEdit && k === 'e') setActiveTool('rect');
        if (canEdit && k === 'p') setActiveTool('pipe');
        if (canEdit && k === 't') setActiveTool('text');
        if (canEdit && k === 'm') setActiveTool('dimension');
        if (canEdit && k === 'c' && activeMode === 'cad') setActiveTool('calibrate');
        if (k === 'escape') setPendingFixture(null);
        if (k === '?' || (e.shiftKey && k === '/')) { e.preventDefault(); setShowShortcuts(true); }
      }
      if ((e.ctrlKey||e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey||e.metaKey) && k === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey||e.metaKey) && k === 'g') { e.preventDefault(); handleGroupToggle(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentFile, project, undo, redo, allSelectedIds, groupInfo, activeMode]);

  const isFirst = useRef(true);
  useEffect(() => { if (isFirst.current) { isFirst.current = false; return; } setDirty(true); }, [project]);

  // ── Auto-save preference ────────────────────────────────────────────────
  useEffect(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('get-pref', 'autoSaveEnabled').then(v => { if (v !== null) setAutoSaveEnabled(v); });
    // Recovery check on startup
    ipcRenderer.invoke('autosave-read').then(data => {
      if (!data) return;
      if (window.confirm('An unsaved session was found. Restore it?')) {
        try { loadProject(JSON.parse(data)); } catch {}
      }
      ipcRenderer.invoke('autosave-clear');
    });
  }, []);

  // ── Auto-save interval (every 2 minutes when enabled) ───────────────────
  useEffect(() => {
    if (!autoSaveEnabled || !ipcRenderer) return;
    const id = setInterval(() => {
      ipcRenderer.invoke('autosave-write', JSON.stringify(project));
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [project, autoSaveEnabled]);


  function clearSelection() { setSelectedId(null); setSelectedObj(null); setSelectedIds([]); }
  function handleSave() { if (currentFile) saveToFile(currentFile); else if (ipcRenderer) ipcRenderer.send('save-as-request'); }
  function saveToFile(fp) { if (!fp || !ipcRenderer) return; ipcRenderer.send('save-data', { filePath: fp, data: JSON.stringify(project, null, 2) }); setCurrentFile(fp); setDirty(false); }
  function handleSelect(obj) { setSelectedId(obj?.id||null); setSelectedObj(obj||null); if (obj) setSelectedIds([]); }
  function handleMultiSelect(ids) { setSelectedIds(ids); setSelectedId(null); setSelectedObj(null); }

  function handleDelete() {
    const toDelete = new Set(selectedIds.length ? selectedIds : selectedId ? [selectedId] : []);
    if (!toDelete.size) return;
    commitToActiveDrawing(d => {
      d.fixtures    = d.fixtures.filter(f => !toDelete.has(f.id));
      d.pipes       = d.pipes.filter(p => !toDelete.has(p.id));
      d.lines       = d.lines.filter(l => !toDelete.has(l.id));
      d.rectangles  = d.rectangles.filter(r => !toDelete.has(r.id));
      d.texts       = d.texts.filter(t => !toDelete.has(t.id));
      d.images      = (d.images||[]).filter(i => !toDelete.has(i.id));
    });
    clearSelection();
  }

  function commitToActiveDrawing(updater) {
    commit(proj => {
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId) || proj.drawings[0];
      if (d) updater(d);
      return proj;
    });
  }

  // ── Mode ─────────────────────────────────────────────────────────────────
  function handleSetMode(mode) {
    commit(proj => { proj.activeMode = mode; return proj; });
    // Clear selection so cable/infra inspectors don't bleed into the new mode
    clearSelection();
    // Reset any cable/infra tool when leaving cable mode
    if (mode !== 'cable') setActiveTool('select');
  }

  // ── Active layer ─────────────────────────────────────────────────────────
  function handleSetActiveLayer(id) {
    commit(proj => { proj.activeLayerId = id; return proj; });
  }

  // ── Groups ───────────────────────────────────────────────────────────────
  function handleGroup() {
    if (allSelectedIds.length < 2) return;
    const gid = generateId();
    commitToActiveDrawing(d => setGroupIdInDrawing(d, allSelectedIds, gid));
  }
  function handleUngroup() {
    if (!groupInfo) return;
    commitToActiveDrawing(d => setGroupIdInDrawing(d, allSelectedIds, null));
  }
  function handleGroupToggle() { if (groupInfo) handleUngroup(); else if (canGroup) handleGroup(); }

  function handleBulkUpdate(fields) {
    commitToActiveDrawing(d => {
      allSelectedIds.forEach(id => {
        const f = d.fixtures?.find(f => f.id === id);
        if (f) Object.assign(f, fields);
      });
    });
  }

  // ── Object updates ───────────────────────────────────────────────────────
  function handleUpdateFixtureInstance(id, rawFields) {
    const cur = activeDrawing?.fixtures?.find(f => f.id === id);
    const fields = syncFields(rawFields, cur);
    commitToActiveDrawing(d => { const f = d.fixtures.find(f => f.id === id); if (f) Object.assign(f, fields); });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdatePipe(id, fields) {
    commitToActiveDrawing(d => { const p = d.pipes.find(p => p.id === id); if (p) Object.assign(p, fields); });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateText(id, fields) {
    commitToActiveDrawing(d => {
      const t = d.texts.find(t => t.id === id); if (t) Object.assign(t, fields);
    });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateObject(id, kind, fields) {
    const arrMap = { line:'lines', rect:'rectangles', image:'images' };
    const arr = arrMap[kind]; if (!arr) return;
    commitToActiveDrawing(d => { const obj = (d[arr]||[]).find(o => o.id === id); if (obj) Object.assign(obj, fields); });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }

  function handleUpdateInfra(id, fields) {
    commitToActiveDrawing(d => {
      const item = (d.infrastructure||[]).find(i => i.id === id);
      if (item) Object.assign(item, fields);
    });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateCable(id, fields) {
    commitToActiveDrawing(d => {
      const cable = (d.cables||[]).find(c => c.id === id);
      if (cable) Object.assign(cable, fields);
    });
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleDeleteCable(id) {
    commitToActiveDrawing(d => { d.cables = (d.cables||[]).filter(c => c.id !== id); });
    clearSelection();
  }
  function handleStudioSettingsSave(settings) {
    commit(proj => { proj.meta = { ...proj.meta, ...settings }; return proj; });
    setShowStudioSettings(false);
  }

  function handleImportGdtf(ft) {
    commit(proj => { proj.customFixtureTypes = [...(proj.customFixtureTypes||[]), ft]; return proj; });
  }
  function handleDeleteCustomFixture(id) {
    commit(proj => { proj.customFixtureTypes = (proj.customFixtureTypes||[]).filter(f => f.id !== id); return proj; });
  }
  function handleRenameFixture(id, name) {
    commit(proj => {
      const ft = (proj.customFixtureTypes||[]).find(f => f.id === id);
      if (ft) ft.name = name;
      return proj;
    });
  }
  function handleUpdateFixtureType(updated) {
    commit(proj => {
      // Update in customFixtureTypes if it exists there
      const idx = (proj.customFixtureTypes||[]).findIndex(f => f.id === updated.id);
      if (idx >= 0) {
        proj.customFixtureTypes[idx] = { ...proj.customFixtureTypes[idx], ...updated };
      } else {
        // Add as a custom override (built-in fixture being edited)
        if (!proj.customFixtureTypes) proj.customFixtureTypes = [];
        proj.customFixtureTypes.push({ ...updated, source: 'gdtf' });
      }
      return proj;
    });
  }

  // ── Patch open/close with auto-notes ─────────────────────────────────────
  function openPatch() {
    patchSnapshotRef.current = (activeDrawingRef.current?.fixtures||[]).map(f => ({ id:f.id, dmxAddress:f.dmxAddress, channel:f.channel, unit:f.unit, type:f.type }));
    setShowPatch(true);
  }
  function closePatch() {
    setShowPatch(false);
    const snapshot = patchSnapshotRef.current; if (!snapshot) return;
    const nowFixtures = activeDrawingRef.current?.fixtures || [];
    const changes = [];
    nowFixtures.forEach(f => {
      const old = snapshot.find(s => s.id === f.id);
      if (!old) { changes.push(`+Unit ${f.unit||'?'} (${f.type||''}): ${f.dmxAddress||'—'}`); return; }
      if (old.dmxAddress !== f.dmxAddress) changes.push(`Unit ${f.unit||'?'}: ${old.dmxAddress||'—'} → ${f.dmxAddress||'—'}`);
    });
    snapshot.forEach(s => { if (!nowFixtures.find(f => f.id === s.id)) changes.push(`-Unit ${s.unit||'?'} (${s.type||''})`); });
    if (changes.length) {
      const note = `\n[Patch ${new Date().toLocaleDateString()}] ${changes.join('; ')}`;
      commit(proj => {
        const sheet = proj.sheets?.find(s => s.id === proj.activeSheetId) || proj.sheets?.[0];
        if (sheet) { if (!sheet.titleBlock) sheet.titleBlock={}; sheet.titleBlock.notes = (sheet.titleBlock.notes||'') + note; }
        return proj;
      });
    }
    patchSnapshotRef.current = null;
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  function handleImportPdf() { if (ipcRenderer) ipcRenderer.send('open-pdf-request'); }
  async function handlePdfData(dataUrl) {
    try {
      const { dataUrl: img, w, h } = await renderPdfToDataUrl(dataUrl);
      commitToActiveDrawing(d => { d.pdfBackground = { dataUrl: img, x: 0, y: 0, w, h, opacity: 0.4, layerId: 'layer-bg' }; });
    } catch (err) { alert('Failed to render PDF: ' + err.message); }
  }

  // ── Images ────────────────────────────────────────────────────────────────
  function handleImportImage() { if (ipcRenderer) ipcRenderer.send('open-image-request'); }
  function handleImageData(dataUrl, fileName) {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth / 2, h = img.naturalHeight / 2;
      commitToActiveDrawing(d => { if (!d.images) d.images=[]; d.images.push({ id:generateId(), x:0, y:0, w, h, dataUrl, label:fileName, layerId:'layer-bg' }); });
    };
    img.src = dataUrl;
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExportPNG() {
    const svg = document.querySelector('svg'); if (!svg || !ipcRenderer) return;
    const data = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = svg.clientWidth*2; canvas.height = svg.clientHeight*2;
    const img = new Image();
    img.onload = () => { canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height); ipcRenderer.send('export-png', canvas.toDataURL('image/png')); };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  }
  function handleExportSVG() {
    const svg = document.querySelector('svg'); if (!svg || !ipcRenderer) return;
    ipcRenderer.send('export-svg', new XMLSerializer().serializeToString(svg));
  }

  // ── Layers ────────────────────────────────────────────────────────────────
  function handleUpdateLayer(id, fields) { commit(proj => { const l=(proj.layers||[]).find(l=>l.id===id); if(l) Object.assign(l,fields); return proj; }); }
  function handleAddLayer(layer) { commit(proj => { if(!proj.layers) proj.layers=[]; proj.layers.push(layer); return proj; }); }
  function handleDeleteLayer(id) {
    commit(proj => {
      proj.layers = (proj.layers||[]).filter(l => l.id !== id);
      proj.drawings.forEach(d => {
        ['fixtures','pipes','lines','rectangles','texts','images'].forEach(arr => {
          (d[arr]||[]).forEach(obj => { if (obj.layerId === id) obj.layerId = 'layer-arch'; });
        });
      });
      return proj;
    });
  }
  function handleReorderLayers(newLayers) { commit(proj => { proj.layers = newLayers; return proj; }); }

  // ── CAD Plots (called "Drawings" internally in store, "Plots" in UI) ────────
  function handleAddDrawing() {
    const d = makeDrawing(generateId(), `Plot ${(project.drawings?.length||0)+1}`);
    commit(proj => { proj.drawings.push(d); proj.activeDrawingId = d.id; return proj; });
    clearSelection();
  }
  function handleSwitchDrawing(id) { commit(proj => { proj.activeDrawingId = id; return proj; }); clearSelection(); }
  function handleRenameDrawing(id, name) { commit(proj => { const d=proj.drawings.find(d=>d.id===id); if(d) d.name=name; return proj; }); }
  function handleDeleteDrawing(id) {
    if (project.drawings?.length <= 1) return;
    commit(proj => { proj.drawings=proj.drawings.filter(d=>d.id!==id); if(proj.activeDrawingId===id) proj.activeDrawingId=proj.drawings[0]?.id; return proj; });
    clearSelection();
  }

  // ── Sheets ────────────────────────────────────────────────────────────────
  function handleAddSheet() {
    const s = makeSheet(generateId(), `Sheet ${(project.sheets?.length||0)+1}`);
    commit(proj => { proj.sheets.push(s); proj.activeSheetId = s.id; return proj; });
  }
  function handleSwitchSheet(id) { commit(proj => { proj.activeSheetId = id; return proj; }); }
  function handleRenameSheet(id, name) { commit(proj => { const s=proj.sheets.find(s=>s.id===id); if(s) s.name=name; return proj; }); }
  function handleDeleteSheet(id) {
    if (project.sheets?.length <= 1) return;
    commit(proj => { proj.sheets=proj.sheets.filter(s=>s.id!==id); if(proj.activeSheetId===id) proj.activeSheetId=proj.sheets[0]?.id; return proj; });
  }
  function handleDuplicateSheet(id) {
    commit(proj => {
      const src = proj.sheets.find(s => s.id === id);
      if (!src) return proj;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = generateId();
      copy.name = src.name + ' Copy';
      // Give each element a new id to avoid collisions
      const remap = (arr) => (arr||[]).map(o => ({ ...o, id: generateId() }));
      copy.viewports  = remap(copy.viewports);
      copy.annotations = remap(copy.annotations);
      copy.texts      = remap(copy.texts);
      copy.keyBlocks  = remap(copy.keyBlocks);
      proj.sheets.splice(proj.sheets.findIndex(s => s.id === id) + 1, 0, copy);
      proj.activeSheetId = copy.id;
      return proj;
    });
  }

  function handlePrint() { /* SheetEditor handles its own print popup */ }

  const titleStr = `Lighting Plot${currentFile ? ` — ${currentFile.split(/[\\/]/).pop()}` : ''}${dirty ? ' •' : ''}`;
  useEffect(() => { document.title = titleStr; }, [titleStr]);

  return (
    <div style={styles.app}>
      {/* Update available banner */}
      {updateBanner && (
        <div style={styles.updateBanner}>
          <span>Update available: <strong>v{updateBanner.version}</strong></span>
          <button
            style={{ marginLeft: 10, padding: '2px 12px', background: '#0f3460', border: '1px solid #4a90d9', borderRadius: 3, color: '#90cdf4', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            onClick={() => { setShowAppSettings(true); setUpdateBanner(null); }}>
            Update Now
          </button>
          <button onClick={() => setUpdateBanner(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer', fontSize: 13 }}>
            ✕
          </button>
        </div>
      )}
      <Toolbar
        activeTool={activeTool}
        onToolChange={t => {
          if (!license?.hasFeature('cad_edit') && t !== 'select') return;
          setActiveTool(t); setPendingFixture(null);
        }}
        onDelete={handleDelete}
        onZoomIn={() => setZoom(z => Math.min(20, z*1.2))}
        onZoomOut={() => setZoom(z => Math.max(0.02, z/1.2))}
        onFit={() => fitViewRef.current?.()}
        showGrid={showGrid} onToggleGrid={() => setShowGrid(v => !v)}
        pipeSnap={pipeSnap} onTogglePipeSnap={() => setPipeSnap(v => !v)}
        zoom={zoom}
        onImportPdf={handleImportPdf} onImportImage={handleImportImage}
        onShowPatch={openPatch}
        canGroup={canGroup} canUngroup={canUngroup}
        onGroup={handleGroup} onUngroup={handleUngroup}
        activeMode={activeMode} onSetMode={handleSetMode}
        animating={animating} onToggleAnimation={() => setAnimating(v => !v)}
        onShowCableReport={() => setShowCableReport(true)}
        onShowEOSImport={() => setShowEOSImport(true)}
        onStudioSettings={() => setShowStudioSettings(true)}
        onAppSettings={() => setShowAppSettings(true)}
        features={license?.license?.features || []}
      />

      <div style={styles.main}>
        {/* Library only visible in CAD mode */}
        {activeMode === 'cad' && (
          <LibraryPanel
            builtinFixtures={fixtureTypesData}
            customFixtures={project.customFixtureTypes||[]}
            pendingFixture={pendingFixture}
            onSelectFixture={f => { setPendingFixture(f); setActiveTool('select'); }}
            onImportGdtf={handleImportGdtf}
            onDeleteCustomFixture={handleDeleteCustomFixture}
            onRenameFixture={handleRenameFixture}
            onUpdateFixture={handleUpdateFixtureType}
            onOpenGdtfBrowser={() => setShowGdtfBrowser(true)}
          />
        )}

        {activeMode === 'cad' || activeMode === 'cable' ? (
          /* ── CAD / Cable mode — same canvas ───────────────────── */
          <div style={styles.canvasColumn}>
            <Canvas
              project={project}
              drawing={activeDrawing}
              commit={commit} softUpdate={softUpdate}
              activeTool={activeTool}
              pendingFixture={pendingFixture}
              onPendingFixturePlaced={() => setPendingFixture(null)}
              selectedId={selectedId} selectedIds={selectedIds}
              onSelect={handleSelect} onMultiSelect={handleMultiSelect}
              showGrid={showGrid} showRulers={showRulers}
              fixtureTypes={allFixtureTypes}
              zoom={zoom} pan={pan}
              onZoomChange={setZoom} onPanChange={setPan}
              pipeSnap={pipeSnap}
              onToolDone={() => setActiveTool('select')}
              onToolChange={t => { setActiveTool(t); setPendingFixture(null); }}
              dragTargetLayerRef={dragTargetLayerRef}
              activeLayerId={activeLayerId}
              animating={animating}
              activeMode={activeMode}
              fitRef={fitViewRef}
            />
            {license?.hasFeature('multi_drawing') && (
              <DrawingTabs
                drawings={project.drawings||[]}
                activeDrawingId={project.activeDrawingId}
                onSwitch={handleSwitchDrawing} onAdd={handleAddDrawing}
                onRename={handleRenameDrawing} onDelete={handleDeleteDrawing}
              />
            )}
          </div>
        ) : license?.hasFeature('sheet_editor') ? (
          /* ── Sheet mode ───────────────────────────────────────── */
          <div style={styles.canvasColumn}>
            <SheetEditor
              project={project}
              activeSheet={activeSheet}
              fixtureTypes={allFixtureTypes}
              commit={commit} softUpdate={softUpdate}
              onPrint={handlePrint}
            />
            <SheetTabs
              sheets={project.sheets||[]}
              activeSheetId={project.activeSheetId}
              onSwitch={handleSwitchSheet} onAdd={handleAddSheet}
              onRename={handleRenameSheet} onDelete={handleDeleteSheet}
              onDuplicate={handleDuplicateSheet}
            />
          </div>
        ) : (
          /* sheet_editor feature not licensed — fall back to CAD view */
          <div style={styles.canvasColumn} />
        )}

        {/* Right panel — inspector + layers, always visible */}
        <div style={styles.rightPanel}>
          {(activeMode === 'cad' || activeMode === 'cable') && (() => {
            const kind = selectedObj?.kind;
            if (kind === 'infra') {
              return (
                <InfraInspector
                  item={selectedObj}
                  onChange={fields => handleUpdateInfra(selectedObj.id, fields)}
                />
              );
            }
            if (kind === 'cable') {
              const cable = selectedObj;
              const drawing = activeDrawing;
              const fromObj = cable.fromType === 'fixture'
                ? drawing?.fixtures?.find(f => f.id === cable.fromId)
                : drawing?.infrastructure?.find(i => i.id === cable.fromId);
              const toObj = cable.toType === 'fixture'
                ? drawing?.fixtures?.find(f => f.id === cable.toId)
                : drawing?.infrastructure?.find(i => i.id === cable.toId);
              let lengthMm = 0, loadInfo = null;
              if (fromObj && toObj) {
                const from = { x: fromObj.x, y: fromObj.y, onStructureId: fromObj.onStructureId || fromObj.pipeId || null };
                const to   = { x: toObj.x,   y: toObj.y,   onStructureId: toObj.onStructureId   || toObj.pipeId   || null };
                ({ lengthMm } = calcCableRoute(from, to, drawing?.pipes || [], project.meta?.rigHeight || 5500));
              }
              if (cable.cableType === 'power' && cable.subtype) {
                const items = [];
                if (fromObj && cable.fromType === 'fixture') items.push(fromObj);
                if (toObj   && cable.toType   === 'fixture') items.push(toObj);
                loadInfo = calcCircuitLoad(items, cable.subtype, allFixtureTypes);
              }
              const fromLabel = fromObj ? (fromObj.label || fromObj.name || fromObj.type || cable.fromId) : cable.fromId;
              const toLabel   = toObj   ? (toObj.label   || toObj.name   || toObj.type   || cable.toId)   : cable.toId;
              return (
                <CableInspector
                  cable={cable}
                  fromLabel={fromLabel} toLabel={toLabel}
                  lengthMm={lengthMm} loadInfo={loadInfo}
                  onChange={fields => handleUpdateCable(cable.id, fields)}
                  onDelete={() => handleDeleteCable(cable.id)}
                />
              );
            }
            return (
              <InspectorPanel
                selected={selectedObj}
                onUpdateFixture={handleUpdateFixtureInstance}
                onUpdatePipe={handleUpdatePipe}
                onUpdateText={handleUpdateText}
                onUpdateObject={handleUpdateObject}
                allFixtureTypes={allFixtureTypes}
                dmxConflicts={[...dmxConflicts]}
                selectedCount={selectedIds.length}
                layers={project.layers||[]}
                groupInfo={groupInfo}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onBulkUpdate={handleBulkUpdate}
              />
            );
          })()}
          <LayersPanel
            layers={project.layers||[]}
            onUpdateLayer={handleUpdateLayer}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onReorderLayers={handleReorderLayers}
            draggingCanvasId={false}
            activeLayerId={activeLayerId}
            onSetActiveLayer={handleSetActiveLayer}
          />
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      {activeMode === 'cad' && (() => {
        const fixtures = activeDrawing?.fixtures || [];
        const typeCount = new Set(fixtures.map(f => f.fixtureTypeId || f.type)).size;
        const channelsUsed = new Set(fixtures.map(f => f.channel).filter(Boolean)).size;
        const conflictCount = dmxConflicts.length;
        return (
          <div style={styles.statusBar}>
            <span style={styles.statusItem}>Fixtures: <strong>{fixtures.length}</strong></span>
            <span style={styles.statusSep}>|</span>
            <span style={styles.statusItem}>Types: <strong>{typeCount}</strong></span>
            <span style={styles.statusSep}>|</span>
            <span style={styles.statusItem}>Channels used: <strong>{channelsUsed}</strong></span>
            {conflictCount > 0 && (
              <>
                <span style={styles.statusSep}>|</span>
                <span style={{ ...styles.statusItem, color: '#fc8181' }}>DMX conflicts: <strong>{conflictCount}</strong></span>
              </>
            )}
          </div>
        );
      })()}

      {report && license?.hasFeature('reports') && <ReportWindow type={report.type} fixtures={activeDrawing?.fixtures||[]} onClose={() => setReport(null)} />}
      {showPatch && license?.hasFeature('patch_panel') && (
        <PatchPanel fixtures={activeDrawing?.fixtures||[]} allFixtureTypes={allFixtureTypes}
          onUpdateFixture={handleUpdateFixtureInstance} onClose={closePatch} />
      )}
      {showGdtfBrowser && license?.hasFeature('gdtf_browser') && (
        <GDTFBrowserPanel onImportGdtf={handleImportGdtf} onClose={() => setShowGdtfBrowser(false)} />
      )}
      {showStudioSettings && (
        <StudioSettingsModal
          meta={project.meta}
          onSave={handleStudioSettingsSave}
          onClose={() => setShowStudioSettings(false)}
        />
      )}
      {showAppSettings && (
        <AppSettingsModal
          onClose={() => setShowAppSettings(false)}
          autoSaveEnabled={autoSaveEnabled}
          onChangeAutoSave={v => { setAutoSaveEnabled(v); ipcRenderer?.invoke('set-pref', 'autoSaveEnabled', v); }}
          pendingUpdateVersion={updateBanner?.version || null}
        />
      )}
      {showMyLicense && (
        <MyLicenseModal
          license={license?.license}
          onClose={() => setShowMyLicense(false)}
          onChangeLicense={() => { setShowMyLicense(false); license?.deactivate(); }}
        />
      )}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
      {showLicenseManager && license?.hasFeature('license_manager') && (
        <LicenseManager onClose={() => setShowLicenseManager(false)} />
      )}
      {showEOSImport && license?.hasFeature('eos_import') && (
        <EOSImport
          drawing={activeDrawing}
          fixtureTypes={allFixtureTypes}
          onClose={() => setShowEOSImport(false)}
          onApply={(channels, fieldMap) => {
            commitToActiveDrawing(d => {
              channels.forEach(ch => {
                const fix = (d.fixtures||[]).find(f => String(f.channel||'').trim() === String(ch.num).trim());
                if (!fix) return;
                if (fieldMap.label   && ch.label)   fix.label   = ch.label;
                if (fieldMap.channel && ch.num)      fix.channel = ch.num;
                if (fieldMap.address && ch.address)  fix.address = ch.address;
              });
            });
            setShowEOSImport(false);
          }}
        />
      )}

      {showCableReport && license?.hasFeature('cable_routing') && (
        <CableReport
          drawing={activeDrawing}
          pipes={activeDrawing?.pipes || []}
          rigHeight={project.meta?.rigHeight || 5500}
          gridHeight={project.meta?.gridHeight || 6000}
          fixtureTypes={allFixtureTypes}
          onClose={() => setShowCableReport(false)}
          onUpdateCable={(cableId, patch) => {
            commitToActiveDrawing(d => {
              const c = (d.cables||[]).find(c => c.id === cableId);
              if (c) Object.assign(c, patch);
            });
          }}
        />
      )}
    </div>
  );
}

const styles = {
  app: { display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117', color:'#e0e0e0', fontFamily:"'Segoe UI', system-ui, sans-serif", overflow:'hidden' },
  updateBanner: {
    display: 'flex', alignItems: 'center', padding: '5px 16px',
    background: '#0f3460', borderBottom: '1px solid #1a4a80',
    fontSize: 12, color: '#e0e0e0', gap: 4, flexShrink: 0,
  },
  main: { display:'flex', flex:1, overflow:'hidden' },
  canvasColumn: { display:'flex', flexDirection:'column', flex:1, overflow:'hidden' },
  rightPanel: { width:210, display:'flex', flexDirection:'column', borderLeft:'1px solid #0f3460', overflow:'hidden', flexShrink:0 },
  statusBar: {
    display: 'flex', alignItems: 'center', padding: '3px 14px',
    background: '#0d1b2a', borderTop: '1px solid #0f3460',
    fontSize: 11, color: '#718096', gap: 6, flexShrink: 0,
  },
  statusItem: { color: '#a0aec0' },
  statusSep: { color: '#2d3748' },
};
