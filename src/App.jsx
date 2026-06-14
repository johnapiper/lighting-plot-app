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
import DrawingTemplatesModal from './components/DrawingTemplatesModal';
import TransformModal from './components/TransformModal';
import { mirrorObject, translateObject, rotateObject, offsetObject, cloneWithId, objectBounds } from './canvas/transforms';
import { calcCircuitLoad } from './cabling/ratings';
import { calcCableRoute } from './cabling/routing';
import { useProjectStore, makeDrawing, makeSheet } from './store/projectStore';
import { findDmxConflicts } from './components/PatchPanel';
import { compareVersions } from './license/licenseService';
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
  const { project, commit, softUpdate, undo, redo, loadProject, resetProject, saveRevision, restoreRevision, historyStack, historyIdx, historyLabels } = useProjectStore();

  const [activeTool, setActiveTool]     = useState('select');
  const [pendingFixture, setPendingFixture] = useState(null);
  const [selectedId, setSelectedId]     = useState(null);
  const [selectedObj, setSelectedObj]   = useState(null);
  const [selectedIds, setSelectedIds]   = useState([]);
  const [showGrid, setShowGrid]         = useState(true);
  const [showRulers, setShowRulers]     = useState(true);
  // Unified snap config (object snap + grid + pipe attachment in one place).
  const [snap, setSnap] = useState({ enabled: true, endpoint: true, midpoint: true, center: true, intersection: true, nearest: true, grid: true, pipe: true });
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
  const [showDrawingTemplates, setShowDrawingTemplates] = useState(false);
  const [objectSnap, setObjectSnap]                 = useState(true);
  const [transformMode, setTransformMode]           = useState(null); // 'array' | 'align' | null
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

  // ── Permission shortcuts ─────────────────────────────────────────────────
  const canEditCanvas = !!license?.hasFeature('cad_edit');
  const canUseLibrary = !!license?.hasFeature('fixture_library');

  // In trial mode everything is temporary: no save / load / export / import.
  const isTrial    = !!license?.trial;
  const maxVersion = license?.maxVersion || null;
  function blockIfTrial() {
    if (isTrial) { alert('Saving, loading, exporting and importing are disabled in trial mode. Activate a license to enable them.'); return true; }
    return false;
  }

  // ── IPC ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ipcRenderer) return;
    const handlers = {
      'menu-app-settings':  () => setShowAppSettings(true),
      'menu-check-updates': () => setShowAppSettings(true),
      'update-available':   (_, info) => {
        // Respect the license's maximum-allowed version — don't surface newer updates.
        if (maxVersion && compareVersions(info.version, maxVersion) > 0) return;
        setUpdateBanner({ version: info.version });
      },
      'menu-my-license': () => setShowMyLicense(true),
      'menu-license-manager': () => license?.hasFeature('license_manager') && setShowLicenseManager(true),
      'menu-deactivate': () => { if (confirm('Deactivate this license on this machine?')) license?.deactivate(); },
      'menu-new':    () => { resetProject(); setCurrentFile(null); setDirty(false); clearSelection(); },
      'menu-save':   handleSave,
      'save-file-as': (e, fp) => saveToFile(fp),
      'load-file':   (e, { filePath, data }) => {
        if (blockIfTrial()) return;
        try { loadProject(JSON.parse(data)); setCurrentFile(filePath); setDirty(false); clearSelection(); }
        catch (err) { alert('Failed to load: ' + err.message); }
      },
      'open-recent': async (e, fp) => {
        if (blockIfTrial()) return;
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
      'menu-export-png':    () => { if (blockIfTrial()) return; license?.hasFeature('mvr_export') ? handleExportPNG() : alert('Your license does not include export features.'); },
      'menu-export-svg':    () => { if (blockIfTrial()) return; license?.hasFeature('mvr_export') ? handleExportSVG() : alert('Your license does not include export features.'); },
      'menu-report-instrument': () => license?.hasFeature('reports') ? setReport({ type: 'instrument' }) : alert('Your license does not include reports.'),
      'menu-report-channel':    () => license?.hasFeature('reports') ? setReport({ type: 'channel' })     : alert('Your license does not include reports.'),
      'pdf-opened':   (e, { dataUrl }) => license?.hasFeature('pdf_background') ? handlePdfData(dataUrl) : null,
      'image-opened': (e, { dataUrl, fileName }) => license?.hasFeature('pdf_background') ? handleImageData(dataUrl, fileName) : null,
      'load-mvr-file': async (e, { filePath, buffer }) => {
        if (blockIfTrial()) return;
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
        if (blockIfTrial()) return;
        if (!license?.hasFeature('mvr_export')) { alert('Your license does not include MVR export.'); return; }
        try {
          const buf = await exportMVR(project, allFixtureTypes);
          ipcRenderer.send('save-mvr-data', { filePath, buffer: Array.from(buf) });
        } catch (err) { alert('Failed to export MVR: ' + err.message); }
      },
    };
    Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.on(ch, fn));
    return () => Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn));
  }, [project, currentFile, undo, redo, license]);

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
        if (canEdit && license?.hasFeature('dimensioning') && k === 'm') setActiveTool('dimension');
        if (canEdit && k === 'c' && activeMode === 'cad') setActiveTool('calibrate');
        if (k === 'escape') setPendingFixture(null);
        if (k === '?' || (e.shiftKey && k === '/')) { e.preventDefault(); setShowShortcuts(true); }
        if (k === 'u' && license?.hasFeature('universe_view')) setShowUniverse(v => !v);
      }
      if ((e.ctrlKey||e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey||e.metaKey) && k === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey||e.metaKey) && k === 'g') { e.preventDefault(); handleGroupToggle(); }
      if (e.key === 'F12' && license?.hasFeature('dev_tools')) {
        e.preventDefault();
        ipcRenderer?.send('toggle-dev-tools');
      }
      if (e.key === 'F3') { e.preventDefault(); setObjectSnap(v => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentFile, project, undo, redo, allSelectedIds, groupInfo, activeMode]);

  const isFirst = useRef(true);
  useEffect(() => { if (isFirst.current) { isFirst.current = false; return; } setDirty(true); }, [project]);

  // After interacting with the native menu / dialogs, the renderer's webContents
  // can lose keyboard focus, leaving text inputs un-clickable. Whenever an
  // input-bearing modal opens, restore web-contents focus so its fields work.
  useEffect(() => {
    if ((showLicenseManager || showMyLicense || showAppSettings || showStudioSettings) && ipcRenderer) {
      ipcRenderer.invoke('focus-window').catch(() => {});
    }
  }, [showLicenseManager, showMyLicense, showAppSettings, showStudioSettings]);

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

  // ── Auto-save interval (every 2 minutes when enabled & licensed) ────────
  useEffect(() => {
    // No persistence in trial mode — everything stays temporary.
    if (isTrial || !autoSaveEnabled || !ipcRenderer || !license?.hasFeature('auto_save')) return;
    const id = setInterval(() => {
      ipcRenderer.invoke('autosave-write', JSON.stringify(project));
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [project, autoSaveEnabled, license]);


  function clearSelection() { setSelectedId(null); setSelectedObj(null); setSelectedIds([]); }
  function handleSave() { if (blockIfTrial()) return; if (currentFile) saveToFile(currentFile); else if (ipcRenderer) ipcRenderer.send('save-as-request'); }
  function saveToFile(fp) { if (blockIfTrial()) return; if (!fp || !ipcRenderer) return; ipcRenderer.send('save-data', { filePath: fp, data: JSON.stringify(project, null, 2) }); setCurrentFile(fp); setDirty(false); }
  function handleSelect(obj) { setSelectedId(obj?.id||null); setSelectedObj(obj||null); if (obj) setSelectedIds([]); }
  function handleMultiSelect(ids) { setSelectedIds(ids); setSelectedId(null); setSelectedObj(null); }

  function handleDelete() {
    if (!canEditCanvas) return;
    const toDelete = new Set(selectedIds.length ? selectedIds : selectedId ? [selectedId] : []);
    if (!toDelete.size) return;
    commitToActiveDrawing(d => {
      d.fixtures    = d.fixtures.filter(f => !toDelete.has(f.id));
      d.pipes       = d.pipes.filter(p => !toDelete.has(p.id));
      d.lines       = d.lines.filter(l => !toDelete.has(l.id));
      d.rectangles  = d.rectangles.filter(r => !toDelete.has(r.id));
      d.texts       = d.texts.filter(t => !toDelete.has(t.id));
      d.images      = (d.images||[]).filter(i => !toDelete.has(i.id));
      if (d.dimensions) d.dimensions = d.dimensions.filter(dim => !toDelete.has(dim.id));
    }, `Delete ${toDelete.size} object${toDelete.size !== 1 ? 's' : ''}`);
    clearSelection();
  }

  function commitToActiveDrawing(updater, label) {
    commit(proj => {
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId) || proj.drawings[0];
      if (d) updater(d);
      return proj;
    }, label);
  }

  // ── Mode ─────────────────────────────────────────────────────────────────
  function handleSetMode(mode) {
    commit(proj => { proj.activeMode = mode; return proj; }, `Switch to ${mode} mode`);
    // Clear selection so cable/infra inspectors don't bleed into the new mode
    clearSelection();
    // Reset any cable/infra tool when leaving cable mode
    if (mode !== 'cable') setActiveTool('select');
  }

  // ── Active layer ─────────────────────────────────────────────────────────
  function handleSetActiveLayer(id) {
    commit(proj => { proj.activeLayerId = id; return proj; }, 'Change active layer');
  }

  // ── Groups ───────────────────────────────────────────────────────────────
  function handleGroup() {
    if (!canEditCanvas) return;
    if (allSelectedIds.length < 2) return;
    const gid = generateId();
    commitToActiveDrawing(d => setGroupIdInDrawing(d, allSelectedIds, gid), `Group ${allSelectedIds.length} objects`);
  }
  function handleUngroup() {
    if (!canEditCanvas) return;
    if (!groupInfo) return;
    commitToActiveDrawing(d => setGroupIdInDrawing(d, allSelectedIds, null), 'Ungroup');
  }
  function handleGroupToggle() { if (groupInfo) handleUngroup(); else if (canGroup) handleGroup(); }

  function handleBulkUpdate(fields) {
    if (!canUseLibrary) return;
    commitToActiveDrawing(d => {
      allSelectedIds.forEach(id => {
        const f = d.fixtures?.find(f => f.id === id);
        if (f) Object.assign(f, fields);
      });
    }, `Edit ${allSelectedIds.length} fixtures`);
  }

  // Build a short "Edit X" label from the changed field names.
  function editLabel(noun, fields) {
    const keys = Object.keys(fields || {});
    return keys.length ? `Edit ${noun} ${keys[0]}` : `Edit ${noun}`;
  }

  // ── Object updates ───────────────────────────────────────────────────────
  function handleUpdateFixtureInstance(id, rawFields) {
    const cur = activeDrawing?.fixtures?.find(f => f.id === id);
    const fields = syncFields(rawFields, cur);
    commitToActiveDrawing(d => { const f = d.fixtures.find(f => f.id === id); if (f) Object.assign(f, fields); }, editLabel('fixture', rawFields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdatePipe(id, fields) {
    commitToActiveDrawing(d => { const p = d.pipes.find(p => p.id === id); if (p) Object.assign(p, fields); }, editLabel('pipe', fields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateText(id, fields) {
    commitToActiveDrawing(d => {
      const t = d.texts.find(t => t.id === id); if (t) Object.assign(t, fields);
    }, editLabel('text', fields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateObject(id, kind, fields) {
    const arrMap = { line:'lines', rect:'rectangles', image:'images' };
    const arr = arrMap[kind]; if (!arr) return;
    commitToActiveDrawing(d => { const obj = (d[arr]||[]).find(o => o.id === id); if (obj) Object.assign(obj, fields); }, editLabel(kind, fields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }

  function handleUpdateInfra(id, fields) {
    commitToActiveDrawing(d => {
      const item = (d.infrastructure||[]).find(i => i.id === id);
      if (item) Object.assign(item, fields);
    }, editLabel('infrastructure', fields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleUpdateCable(id, fields) {
    commitToActiveDrawing(d => {
      const cable = (d.cables||[]).find(c => c.id === id);
      if (cable) Object.assign(cable, fields);
    }, editLabel('cable', fields));
    setSelectedObj(prev => prev?.id === id ? { ...prev, ...fields } : prev);
  }
  function handleDeleteCable(id) {
    commitToActiveDrawing(d => { d.cables = (d.cables||[]).filter(c => c.id !== id); });
    clearSelection();
  }
  function handleStudioSettingsSave(settings) {
    commit(proj => { proj.meta = { ...proj.meta, ...settings }; return proj; }, 'Edit studio settings');
    setShowStudioSettings(false);
  }

  function handleImportGdtf(ft) {
    commit(proj => { proj.customFixtureTypes = [...(proj.customFixtureTypes||[]), ft]; return proj; }, `Import fixture ${ft?.name || ''}`.trim());
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
  function handleAddLayer(layer) { commit(proj => { if(!proj.layers) proj.layers=[]; proj.layers.push(layer); return proj; }, 'Add layer'); }
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
    commit(proj => { proj.drawings.push(d); proj.activeDrawingId = d.id; return proj; }, 'Add plot');
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

  function handleHistoryJump(i) {
    // Jump undo/redo history to index i
    const cur = historyIdx.current;
    if (i === cur) return;
    if (i < cur) { for (let j = 0; j < cur - i; j++) undo(); }
    else          { for (let j = 0; j < i - cur; j++) redo(); }
  }

  function handleSwapFixture(ids, newTypeId) {
    if (!canEditCanvas || !license?.hasFeature('fixture_swap')) return;
    const allTypes = [...fixtureTypesData, ...(project.customFixtureTypes || [])];
    const newType = allTypes.find(t => (t.id || t.name) === newTypeId);
    if (!newType) return;
    commitToActiveDrawing(d => {
      const idSet = new Set(ids);
      (d.fixtures || []).forEach(f => {
        if (!idSet.has(f.id)) return;
        f.fixtureTypeId = newType.id || newType.name;
        f.type = newType.name;
        if (newType.channels) f.channels = newType.channels;
        if (newType.powerW)   f.powerW   = newType.powerW;
      });
    }, `Swap ${ids.length} fixture${ids.length !== 1 ? 's' : ''} → ${newType.name}`);
  }

  function handleDuplicateAlongPath(id) {
    if (!canEditCanvas) return;
    const f = activeDrawing?.fixtures?.find(fx => fx.id === id);
    if (!f) return;
    const count = parseInt(window.prompt('Number of copies:', '4'), 10);
    if (!count || count < 1) return;
    const dx = parseInt(window.prompt('Spacing X (mm):', '500'), 10) || 500;
    const dy = parseInt(window.prompt('Spacing Y (mm):', '0'), 10) || 0;
    commitToActiveDrawing(d => {
      for (let i = 1; i <= count; i++) {
        d.fixtures.push({ ...JSON.parse(JSON.stringify(f)), id: generateId(), x: f.x + dx * i, y: f.y + dy * i, dmxAddress: null, channel: null });
      }
    }, `Duplicate fixture ×${count}`);
  }

  // ── CAD transforms (mirror / array / offset / align) ─────────────────────
  const KIND_ARRAY = { fixture:'fixtures', pipe:'pipes', line:'lines', rect:'rectangles', text:'texts', image:'images', annotation:'annotations', circle:'circles', arc:'arcs', polyline:'polylines', dimension:'dimensions', infra:'infrastructure' };
  function findObjKind(d, id) {
    for (const [kind, arrName] of Object.entries(KIND_ARRAY)) {
      const obj = (d[arrName] || []).find(o => o.id === id);
      if (obj) return { obj, kind, arrName };
    }
    return null;
  }
  function selectionBounds(d) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allSelectedIds.forEach(id => {
      const f = findObjKind(d, id); if (!f) return;
      const b = objectBounds(f.obj, f.kind);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    });
    return { minX, minY, maxX, maxY, cx: (minX+maxX)/2, cy: (minY+maxY)/2 };
  }

  function handleMirror() {
    if (!canEditCanvas || !allSelectedIds.length) return;
    const ans = (window.prompt('Mirror axis — V (vertical) or H (horizontal)?', 'V') || '').trim().toUpperCase();
    if (!ans) return;
    const axis = ans.startsWith('H') ? 'h' : 'v';
    commitToActiveDrawing(d => {
      const b = selectionBounds(d);
      const c = axis === 'v' ? b.cx : b.cy;
      allSelectedIds.forEach(id => {
        const f = findObjKind(d, id); if (!f) return;
        d[f.arrName].push(cloneWithId(mirrorObject(f.obj, f.kind, axis, c)));
      });
    }, 'Mirror selection');
  }

  function handleOffset() {
    if (!canEditCanvas || !allSelectedIds.length) return;
    const dist = parseFloat(window.prompt('Offset distance (mm, negative = other side):', '500'));
    if (!dist) return;
    commitToActiveDrawing(d => {
      allSelectedIds.forEach(id => {
        const f = findObjKind(d, id); if (!f) return;
        const off = offsetObject(f.obj, f.kind, dist);
        if (off) d[f.arrName].push(cloneWithId(off));
      });
    }, 'Offset selection');
  }

  function handleApplyArray(params) {
    setTransformMode(null);
    if (!canEditCanvas || !allSelectedIds.length) return;
    commitToActiveDrawing(d => {
      const b = selectionBounds(d);
      allSelectedIds.forEach(id => {
        const f = findObjKind(d, id); if (!f) return;
        if (params.type === 'grid') {
          for (let r = 0; r < params.rows; r++) for (let c = 0; c < params.cols; c++) {
            if (r === 0 && c === 0) continue;
            d[f.arrName].push(cloneWithId(translateObject(f.obj, f.kind, c * params.dx, r * params.dy)));
          }
        } else {
          const full = (params.angle % 360 === 0);
          const denom = full ? params.count : (params.count - 1);
          const step = (params.angle * Math.PI / 180) / (denom || 1);
          for (let i = 1; i < params.count; i++) {
            d[f.arrName].push(cloneWithId(rotateObject(f.obj, f.kind, b.cx, b.cy, step * i)));
          }
        }
      });
    }, 'Array selection');
  }

  function handleAlign(mode) {
    if (!canEditCanvas || allSelectedIds.length < 2) return;
    commitToActiveDrawing(d => {
      const items = allSelectedIds.map(id => findObjKind(d, id)).filter(Boolean)
        .map(f => ({ ...f, b: objectBounds(f.obj, f.kind) }));
      if (items.length < 2) return;
      const minX = Math.min(...items.map(i => i.b.minX)), maxX = Math.max(...items.map(i => i.b.maxX));
      const minY = Math.min(...items.map(i => i.b.minY)), maxY = Math.max(...items.map(i => i.b.maxY));
      const move = (f, dx, dy) => {
        const moved = translateObject(f.obj, f.kind, dx, dy);
        const idx = d[f.arrName].findIndex(o => o.id === f.obj.id);
        if (idx >= 0) d[f.arrName][idx] = moved;
      };
      if (mode === 'left')     items.forEach(i => move(i, minX - i.b.minX, 0));
      else if (mode === 'right')   items.forEach(i => move(i, maxX - i.b.maxX, 0));
      else if (mode === 'top')     items.forEach(i => move(i, 0, minY - i.b.minY));
      else if (mode === 'bottom')  items.forEach(i => move(i, 0, maxY - i.b.maxY));
      else if (mode === 'centerH') { const c = (minX+maxX)/2; items.forEach(i => move(i, c - (i.b.minX+i.b.maxX)/2, 0)); }
      else if (mode === 'centerV') { const c = (minY+maxY)/2; items.forEach(i => move(i, 0, c - (i.b.minY+i.b.maxY)/2)); }
      else if (mode === 'distH' || mode === 'distV') {
        const horiz = mode === 'distH';
        const sorted = [...items].sort((a, b) => horiz ? (a.b.minX+a.b.maxX) - (b.b.minX+b.b.maxX) : (a.b.minY+a.b.maxY) - (b.b.minY+b.b.maxY));
        const first = sorted[0], last = sorted[sorted.length-1];
        const c0 = horiz ? (first.b.minX+first.b.maxX)/2 : (first.b.minY+first.b.maxY)/2;
        const c1 = horiz ? (last.b.minX+last.b.maxX)/2 : (last.b.minY+last.b.maxY)/2;
        const gap = (c1 - c0) / (sorted.length - 1);
        sorted.forEach((it, i) => {
          const target = c0 + gap * i;
          const cur = horiz ? (it.b.minX+it.b.maxX)/2 : (it.b.minY+it.b.maxY)/2;
          move(it, horiz ? target - cur : 0, horiz ? 0 : target - cur);
        });
      }
    }, `Align (${mode})`);
  }

  // Join/trim two selected lines (or pipes) so they meet at their intersection.
  function handleCorner() {
    if (!canEditCanvas) return;
    commitToActiveDrawing(d => {
      const segs = allSelectedIds.map(id => findObjKind(d, id)).filter(f => f && (f.kind === 'line' || f.kind === 'pipe'));
      if (segs.length !== 2) return;
      const a = segs[0].obj, b = segs[1].obj;
      const den = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
      if (Math.abs(den) < 1e-9) return; // parallel
      const px = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.x1 - b.x2) - (a.x1 - a.x2) * (b.x1 * b.y2 - b.y1 * b.x2)) / den;
      const py = ((a.x1 * a.y2 - a.y1 * a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 * b.y2 - b.y1 * b.x2)) / den;
      const snapNearestEnd = (o) => {
        const d1 = Math.hypot(o.x1 - px, o.y1 - py), d2 = Math.hypot(o.x2 - px, o.y2 - py);
        if (d1 <= d2) { o.x1 = px; o.y1 = py; } else { o.x2 = px; o.y2 = py; }
      };
      snapNearestEnd(a); snapNearestEnd(b);
    }, 'Join corner');
  }

  function handleLoadDrawingTemplate(snapshot) {
    commit(proj => {
      const d = proj.drawings.find(d => d.id === proj.activeDrawingId) || proj.drawings[0];
      if (d && snapshot) Object.assign(d, { ...snapshot, id: d.id, name: d.name });
      return proj;
    }, 'Load drawing template');
    clearSelection();
  }

  function handleApplyTemplate(template) {
    if (template.snapshot) {
      loadProject(template.snapshot);
      setCurrentFile(null);
      setDirty(true);
      clearSelection();
    } else if (template.meta) {
      commit(proj => { proj.meta = { ...proj.meta, ...template.meta }; return proj; });
    }
  }

  function handlePrint() { /* SheetEditor handles its own print popup */ }

  const titleStr = `Lighting Plot${currentFile ? ` — ${currentFile.split(/[\\/]/).pop()}` : ''}${dirty ? ' •' : ''}`;
  useEffect(() => { document.title = titleStr; }, [titleStr]);

  return (
    <div style={styles.app}>
      {/* License expiry warning */}
      {(() => {
        const exp = license?.license?.expiresAt;
        if (!exp) return null;
        const daysLeft = Math.ceil((new Date(exp) - new Date()) / 86400000);
        if (daysLeft > 30) return null;
        return (
          <div style={{ ...styles.updateBanner, background: daysLeft <= 7 ? '#4a1a1a' : '#2a2a0a', borderBottomColor: daysLeft <= 7 ? '#fc8181' : '#f6e05e' }}>
            <span style={{ color: daysLeft <= 7 ? '#fc8181' : '#f6e05e' }}>
              {daysLeft <= 0 ? '⚠ License expired.' : `⚠ License expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`}
            </span>
            <button onClick={() => setShowMyLicense(true)}
              style={{ marginLeft:10, padding:'2px 12px', background:'transparent', border:`1px solid ${daysLeft<=7?'#fc8181':'#f6e05e'}`, borderRadius:3, color: daysLeft<=7?'#fc8181':'#f6e05e', cursor:'pointer', fontSize:11 }}>
              Manage License
            </button>
          </div>
        );
      })()}
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
        objectSnap={objectSnap} onToggleObjectSnap={() => setObjectSnap(v => !v)}
        onMirror={handleMirror} onArray={() => setTransformMode('array')}
        onOffset={handleOffset} onAlign={() => setTransformMode('align')}
        onCorner={handleCorner}
        hasSelection={allSelectedIds.length > 0}
        canCorner={allSelectedIds.length === 2 && allSelectedIds.every(id => {
          const o = getAllObjectsFromDrawing(activeDrawing || {}).find(x => x.id === id);
          return o && (o.kind === 'line' || o.kind === 'pipe');
        })}
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
        onReportFixture={() => license?.hasFeature('reports') ? setReport({ type: 'instrument' }) : null}
        onReportChannel={() => license?.hasFeature('reports') ? setReport({ type: 'channel' }) : null}
        features={license?.license?.features || []}
      />

      <div style={styles.main}>
        {/* Library only visible in CAD mode and when the fixture_library feature is licensed */}
        {activeMode === 'cad' && canUseLibrary && (
          <LibraryPanel
            builtinFixtures={fixtureTypesData}
            customFixtures={project.customFixtureTypes||[]}
            pendingFixture={pendingFixture}
            canEdit={canEditCanvas}
            onSelectFixture={f => { if (!canEditCanvas) return; setPendingFixture(f); setActiveTool('select'); }}
            onImportGdtf={handleImportGdtf}
            onDeleteCustomFixture={handleDeleteCustomFixture}
            onRenameFixture={handleRenameFixture}
            onUpdateFixture={handleUpdateFixtureType}
            onOpenGdtfBrowser={license?.hasFeature('gdtf_browser') ? () => setShowGdtfBrowser(true) : null}
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
              dmxConflicts={[...dmxConflicts]}
              onSwapFixture={(canEditCanvas && license?.hasFeature('fixture_swap')) ? (ids => setSwapFixtureIds(ids)) : undefined}
              onDuplicateAlongPath={handleDuplicateAlongPath}
              canEdit={canEditCanvas}
              objectSnap={objectSnap}
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
            // Fixture properties require the fixture_library feature; other
            // editable objects require cad_edit. Without the relevant permission
            // there is nothing to show.
            const isFixtureSel = kind === 'fixture' || selectedIds.length > 0;
            if (isFixtureSel && !canUseLibrary) return null;
            if (!isFixtureSel && selectedObj && !canEditCanvas) return null;
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
            <span style={styles.statusSep}>|</span>
            <span style={styles.statusItem}>Units:</span>
            <select
              style={styles.statusSelect}
              value={project.meta?.units || 'mm'}
              onChange={e => commit(proj => { proj.meta = { ...proj.meta, units: e.target.value }; return proj; }, `Set units to ${e.target.value}`)}
              title="Display units (geometry is always stored in mm)">
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="ft">ft</option>
              <option value="in">in</option>
            </select>
            <span style={{ flex:1 }} />
            {license?.hasFeature('universe_view') && <button style={styles.statusBtn} onClick={() => setShowUniverse(true)} title="Universe Overview">🌐 Universe</button>}
            {license?.hasFeature('revisions') && <button style={styles.statusBtn} onClick={() => setShowRevisions(true)} title="Revision History">📌 Revisions</button>}
            {license?.hasFeature('undo_history') && <button style={styles.statusBtn} onClick={() => setShowUndoHistory(true)} title="Undo History">↩ History</button>}
            {license?.hasFeature('templates') && <button style={styles.statusBtn} onClick={() => setShowTemplates(true)} title="Project Templates">📁 Templates</button>}
            {license?.hasFeature('templates') && <button style={styles.statusBtn} onClick={() => setShowDrawingTemplates(true)} title="Drawing Templates">📐 Drawing</button>}
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
          maxVersion={maxVersion}
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

      {showUndoHistory && (
        <UndoHistoryPanel
          historyStack={historyStack} historyIdx={historyIdx} historyLabels={historyLabels}
          onJump={handleHistoryJump}
          onClose={() => setShowUndoHistory(false)}
        />
      )}
      {showUniverse && (
        <UniverseOverviewModal
          fixtures={activeDrawing?.fixtures || []}
          onClose={() => setShowUniverse(false)}
        />
      )}
      {showRevisions && (
        <RevisionHistoryModal
          revisions={project.revisions || []}
          onSave={name => saveRevision(name)}
          onRestore={id => restoreRevision(id)}
          onClose={() => setShowRevisions(false)}
        />
      )}
      {swapFixtureIds && (
        <FixtureSwapModal
          fixtureIds={swapFixtureIds}
          allFixtureTypes={fixtureTypesData}
          customFixtureTypes={project.customFixtureTypes || []}
          onSwap={handleSwapFixture}
          onClose={() => setSwapFixtureIds(null)}
        />
      )}
      {showTemplates && (
        <ProjectTemplatesDialog
          currentProject={project}
          onSelect={handleApplyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
      {showDrawingTemplates && (
        <DrawingTemplatesModal
          currentDrawing={activeDrawing}
          onLoad={handleLoadDrawingTemplate}
          onClose={() => setShowDrawingTemplates(false)}
        />
      )}
      {transformMode && (
        <TransformModal
          mode={transformMode}
          count={allSelectedIds.length}
          onApplyArray={handleApplyArray}
          onAlign={handleAlign}
          onClose={() => setTransformMode(null)}
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
  statusBtn: { background:'none', border:'none', color:'#4a5568', cursor:'pointer', fontSize:10, padding:'0 6px' },
  statusSelect: { background:'#0d1b2a', border:'1px solid #0f3460', borderRadius:3, color:'#a0aec0', fontSize:10, padding:'1px 4px', cursor:'pointer', outline:'none' },
};
