const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let store;
try {
  const StoreModule = require('electron-store');
  const Store = StoreModule.default || StoreModule;
  store = new Store({ name: 'lighting-plot-prefs' });
} catch (e) {
  store = null;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Lighting Plot',
    backgroundColor: '#1a1a2e',
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  buildMenu();
}

function getRecentFiles() {
  if (!store) return [];
  return store.get('recentFiles', []);
}

function addRecentFile(filePath) {
  if (!store) return;
  let recent = store.get('recentFiles', []);
  recent = [filePath, ...recent.filter(f => f !== filePath)].slice(0, 10);
  store.set('recentFiles', recent);
  buildMenu();
}

function buildMenu() {
  const recentFiles = getRecentFiles();
  const recentMenuItems = recentFiles.length
    ? recentFiles.map(f => ({
        label: path.basename(f),
        click: () => mainWindow.webContents.send('open-recent', f),
      }))
    : [{ label: 'No Recent Files', enabled: false }];

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: menuOpen },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: menuSaveAs },
        { type: 'separator' },
        { label: 'Recent Files', submenu: recentMenuItems },
        { type: 'separator' },
        { label: 'Export PNG…', click: () => mainWindow.webContents.send('menu-export-png') },
        { label: 'Export SVG…', click: () => mainWindow.webContents.send('menu-export-svg') },
        { label: 'Export MVR…', click: menuExportMVR },
        { label: 'Import MVR…', click: menuOpenMVR },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu-undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow.webContents.send('menu-redo') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => mainWindow.webContents.send('menu-select-all') },
        { label: 'Delete', accelerator: 'Delete', click: () => mainWindow.webContents.send('menu-delete') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.send('menu-zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('menu-zoom-out') },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.send('menu-fit') },
        { type: 'separator' },
        { label: 'Toggle Grid', click: () => mainWindow.webContents.send('menu-toggle-grid') },
        { label: 'Toggle Rulers', click: () => mainWindow.webContents.send('menu-toggle-rulers') },
        { label: 'Toggle Layers', click: () => mainWindow.webContents.send('menu-toggle-layers') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Reports',
      submenu: [
        { label: 'Instrument Schedule', click: () => mainWindow.webContents.send('menu-report-instrument') },
        { label: 'Channel Hookup', click: () => mainWindow.webContents.send('menu-report-channel') },
        { label: 'Dimmer Schedule', click: () => mainWindow.webContents.send('menu-report-dimmer') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Lighting Plot',
          click: () => dialog.showMessageBox(mainWindow, {
            title: 'About Lighting Plot',
            message: `Lighting Plot\nVersion ${app.getVersion()}\n\nA theatrical lighting design CAD tool.\n\n© ${new Date().getFullYear()} John Piper. All rights reserved.\nUnauthorised copying or distribution is prohibited.`,
            type: 'info',
          }),
        },
        {
          label: 'App Settings…',
          click: () => mainWindow.webContents.send('menu-app-settings'),
        },
        { type: 'separator' },
        {
          label: 'License Manager…',
          click: () => mainWindow.webContents.send('menu-license-manager'),
        },
        {
          label: 'Deactivate License…',
          click: () => mainWindow.webContents.send('menu-deactivate'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function menuOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'Lighting Plot / MVR', extensions: ['lightplot', 'mvr'] },
      { name: 'Lighting Plot', extensions: ['lightplot'] },
      { name: 'MVR (My Virtual Rig)', extensions: ['mvr'] },
    ],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mvr') {
      const buf = fs.readFileSync(filePath);
      mainWindow.webContents.send('load-mvr-file', { filePath, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    } else {
      const data = fs.readFileSync(filePath, 'utf8');
      mainWindow.webContents.send('load-file', { filePath, data });
    }
    addRecentFile(filePath);
  }
}

async function menuSaveAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Lighting Plot', extensions: ['lightplot'] }],
    defaultPath: 'untitled.lightplot',
  });
  if (!result.canceled && result.filePath) {
    mainWindow.webContents.send('save-file-as', result.filePath);
  }
}

async function menuExportMVR() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'MVR (My Virtual Rig)', extensions: ['mvr'] }],
    defaultPath: 'lighting-plot.mvr',
  });
  if (!result.canceled && result.filePath) {
    mainWindow.webContents.send('export-mvr-request', result.filePath);
  }
}

async function menuOpenMVR() {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'MVR (My Virtual Rig)', extensions: ['mvr'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const filePath = result.filePaths[0];
    const buf = fs.readFileSync(filePath);
    mainWindow.webContents.send('load-mvr-file', { filePath, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    addRecentFile(filePath);
  }
}

ipcMain.on('save-data', (event, { filePath, data }) => {
  fs.writeFileSync(filePath, data, 'utf8');
  addRecentFile(filePath);
  mainWindow.setTitle(`Lighting Plot — ${path.basename(filePath)}`);
});

ipcMain.on('save-as-request', async (event) => {
  menuSaveAs();
});

ipcMain.on('open-request', async (event) => {
  menuOpen();
});

ipcMain.on('export-png', async (event, dataUrl) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
    defaultPath: 'lighting-plot.png',
  });
  if (!result.canceled && result.filePath) {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(result.filePath, base64, 'base64');
  }
});

ipcMain.on('export-svg', async (event, svgContent) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'SVG Image', extensions: ['svg'] }],
    defaultPath: 'lighting-plot.svg',
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, svgContent, 'utf8');
  }
});

ipcMain.on('open-image-request', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const fp = result.filePaths[0];
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    event.reply('image-opened', { dataUrl: `data:${mime};base64,${data.toString('base64')}`, fileName: path.basename(fp) });
  }
});

ipcMain.on('open-pdf-request', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const data = fs.readFileSync(result.filePaths[0]);
    const base64 = data.toString('base64');
    event.reply('pdf-opened', { dataUrl: `data:application/pdf;base64,${base64}` });
  }
});

ipcMain.on('export-csv', async (event, { filename, csv }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    defaultPath: filename,
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, csv, 'utf8');
  }
});

ipcMain.on('save-mvr-data', (event, { filePath, buffer }) => {
  fs.writeFileSync(filePath, Buffer.from(buffer));
  mainWindow.setTitle(`Lighting Plot — ${path.basename(filePath)}`);
});

ipcMain.on('set-title', (event, title) => {
  mainWindow.setTitle(title);
});

ipcMain.handle('get-app-version', () => app.getVersion());

// ── GDTF Share credential storage (safeStorage = OS keychain encryption) ─────
const { safeStorage } = require('electron');
ipcMain.handle('gdtf-save-credentials', (event, { email, password }) => {
  if (!store) return;
  store.set('gdtfEmail', email);
  if (safeStorage.isEncryptionAvailable()) {
    store.set('gdtfPassword', safeStorage.encryptString(password).toString('base64'));
  }
});
ipcMain.handle('gdtf-load-credentials', () => {
  if (!store) return { email: '', password: '' };
  const email = store.get('gdtfEmail', '');
  const enc   = store.get('gdtfPassword', '');
  let password = '';
  if (enc && safeStorage.isEncryptionAvailable()) {
    try { password = safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch {}
  }
  return { email, password };
});
ipcMain.handle('gdtf-clear-credentials', () => {
  if (!store) return;
  store.delete('gdtfEmail');
  store.delete('gdtfPassword');
});

// ── License key storage (encrypted via safeStorage) ──────────────────────
ipcMain.handle('license-save-key', (event, { key }) => {
  if (!store) return;
  if (safeStorage.isEncryptionAvailable()) {
    store.set('licenseKey', safeStorage.encryptString(key).toString('base64'));
  } else {
    store.set('licenseKey', key);
  }
});
ipcMain.handle('license-load-key', () => {
  if (!store) return '';
  const enc = store.get('licenseKey', '');
  if (!enc) return '';
  if (safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch {}
  }
  return enc;
});
ipcMain.handle('license-clear-key', () => {
  if (!store) return;
  store.delete('licenseKey');
});
ipcMain.handle('license-save-token', (event, { token }) => {
  if (!store) return;
  if (safeStorage.isEncryptionAvailable()) {
    store.set('licenseGhToken', safeStorage.encryptString(token).toString('base64'));
  }
});
ipcMain.handle('license-load-token', () => {
  if (!store) return '';
  const enc = store.get('licenseGhToken', '');
  if (!enc) return '';
  if (safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch {}
  }
  return '';
});

ipcMain.handle('print-sheet', async (event, { html }) => {
  return new Promise((resolve) => {
    const { BrowserWindow: BW } = require('electron');
    const printWin = new BW({
      width: 1200, height: 900, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print(
        { silent: false, printBackground: true, color: true },
        (success, failureReason) => {
          if (!printWin.isDestroyed()) printWin.close();
          resolve({ success, failureReason: failureReason || null });
        }
      );
    });
    printWin.webContents.once('crashed', () => { if (!printWin.isDestroyed()) printWin.close(); resolve({ success: false }); });
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
