'use strict';
/**
 * Preload bridge — the ONLY door between the page and the main process.
 *
 * The renderer runs with nodeIntegration off and contextIsolation + sandbox on, so
 * page code (including anything a crafted project/GDTF/MVR file might smuggle in)
 * has no access to Node, the filesystem or arbitrary IPC. It can only call the
 * channels listed here. Keep these lists in sync with main.js — tests/ipc.test.js
 * fails if they drift.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Renderer → main, fire-and-forget (ipcMain.on)
const SEND = [
  'save-data', 'save-as-request', 'open-request', 'export-png', 'export-svg', 'open-image-request',
  'open-pdf-request', 'export-csv', 'save-mvr-data', 'set-title', 'license-features', 'set-dirty',
  'close-confirmed', 'toggle-dev-tools',
];

// Renderer → main, request/response (ipcMain.handle)
const INVOKE = [
  'backups-open', 'get-app-version', 'unsaved-prompt', 'save-as-dialog', 'focus-window',
  'gdtf-save-credentials', 'gdtf-load-credentials', 'gdtf-clear-credentials',
  'license-save-key', 'license-load-key', 'license-clear-key', 'machine-id-get',
  'trial-read', 'trial-write', 'autosave-write', 'autosave-read', 'autosave-clear',
  'templates-read', 'templates-write', 'templates-export', 'templates-import',
  'get-pref', 'set-pref', 'license-save-token', 'license-load-token',
  'print-sheet', 'export-file', 'import-file', 'read-file', 'file-info', 'open-external',
  'pdfjs-paths', 'gdtf-http', 'export-pdf', 'check-for-updates', 'download-update', 'install-update',
];

// Main → renderer (webContents.send / event.reply)
const RECEIVE = [
  'image-opened', 'pdf-opened', 'close-requested', 'export-mvr-request', 'load-file', 'load-mvr-file',
  'menu-app-settings', 'menu-check-updates', 'menu-deactivate', 'menu-delete', 'menu-export-dxf',
  'menu-export-eos-patch', 'menu-export-magic-sheet', 'menu-export-png', 'menu-export-svg', 'menu-fit',
  'menu-import-dxf', 'menu-license-manager', 'menu-my-license', 'menu-new', 'menu-redo', 'menu-save',
  'menu-select-all', 'menu-toggle-grid', 'menu-toggle-layers', 'menu-toggle-rulers', 'menu-undo',
  'menu-zoom-in', 'menu-zoom-out', 'menu-report-instrument', 'menu-report-channel', 'open-recent', 'save-file-as',
  'update-available', 'update-download-progress', 'update-downloaded', 'update-error', 'update-not-available',
];

const allow = (list, channel, kind) => {
  if (!list.includes(channel)) throw new Error(`IPC ${kind} channel not allowed: ${channel}`);
};

let nextSub = 1;
const subs = new Map();   // id → { channel, handler }

contextBridge.exposeInMainWorld('lplot', {
  ipc: {
    send(channel, ...args) { allow(SEND, channel, 'send'); ipcRenderer.send(channel, ...args); },
    invoke(channel, ...args) { allow(INVOKE, channel, 'invoke'); return ipcRenderer.invoke(channel, ...args); },
    // Returns a numeric id (functions can't be compared across the bridge); see src/bridge.js.
    subscribe(channel, callback) {
      allow(RECEIVE, channel, 'receive');
      const handler = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, handler);
      const id = nextSub++;
      subs.set(id, { channel, handler });
      return id;
    },
    unsubscribe(id) {
      const s = subs.get(id);
      if (!s) return;
      ipcRenderer.removeListener(s.channel, s.handler);
      subs.delete(id);
    },
  },
});
