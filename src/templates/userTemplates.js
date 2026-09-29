// User-saved project / drawing templates.
//
// Stored as files in the app's userData folder via the main process (see
// 'templates-*' IPC in main.js). Templates used to live in localStorage, which
// is lost when app data is cleared; on first read those are migrated across.
// The localStorage copy is left in place as a backup.
import { useState, useEffect } from 'react';
import { generateId } from '../canvas/geometry';
import { toast } from '../components/Toast';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

const LEGACY_KEYS = { project: 'lplot-user-templates', drawing: 'lplot-drawing-templates' };

function readLegacy(kind) {
  try { return JSON.parse(localStorage.getItem(LEGACY_KEYS[kind]) || '[]'); } catch { return []; }
}

export async function loadUserTemplates(kind) {
  if (!ipcRenderer) return readLegacy(kind); // browser dev build: no main process
  const stored = await ipcRenderer.invoke('templates-read', kind);
  if (Array.isArray(stored)) return stored;
  const legacy = readLegacy(kind);
  if (legacy.length) await ipcRenderer.invoke('templates-write', kind, legacy);
  return legacy;
}

export async function saveUserTemplates(kind, list) {
  if (!ipcRenderer) { localStorage.setItem(LEGACY_KEYS[kind], JSON.stringify(list)); return; }
  const ok = await ipcRenderer.invoke('templates-write', kind, list);
  if (!ok) throw new Error('Could not write templates file');
}

// Returns the saved file path, or null if the user cancelled.
export async function exportUserTemplates(kind, list) {
  if (!ipcRenderer) return null;
  return ipcRenderer.invoke('templates-export', { kind, templates: list });
}

// Returns `existing` plus the imported templates (fresh ids, so importing the
// same file twice gives copies rather than clobbering), or null if cancelled.
export async function importUserTemplates(kind, existing) {
  if (!ipcRenderer) return null;
  const incoming = await ipcRenderer.invoke('templates-import', kind);
  if (!incoming) return null;
  const valid = incoming.filter(t => t && typeof t.name === 'string' && t.snapshot);
  return [...existing, ...valid.map(t => ({ ...t, id: generateId() }))];
}

// ipcRenderer.invoke wraps main-process errors in "Error invoking remote method …".
function cleanError(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// State + persistence for a template dialog. `setTemplates` saves immediately.
export function useUserTemplates(kind) {
  const [templates, setState] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    loadUserTemplates(kind)
      .then(list => { if (live) setState(list); })
      .catch(err => toast('Could not load templates: ' + cleanError(err), 'error'))
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [kind]);

  async function setTemplates(list) {
    const prev = templates;
    setState(list);
    try { await saveUserTemplates(kind, list); }
    catch (err) { setState(prev); toast('Could not save templates: ' + cleanError(err), 'error'); }
  }
  async function exportAll() {
    try {
      const fp = await exportUserTemplates(kind, templates);
      if (fp) toast(`Exported ${templates.length} template${templates.length !== 1 ? 's' : ''}`, 'success');
    } catch (err) { toast('Export failed: ' + cleanError(err), 'error'); }
  }
  async function importFile() {
    try {
      const merged = await importUserTemplates(kind, templates);
      if (!merged) return;
      const added = merged.length - templates.length;
      await setTemplates(merged);
      toast(`Imported ${added} template${added !== 1 ? 's' : ''}`, 'success');
    } catch (err) { toast('Import failed: ' + cleanError(err), 'error'); }
  }
  return { templates, setTemplates, loaded, exportAll, importFile, canTransfer: !!ipcRenderer };
}
