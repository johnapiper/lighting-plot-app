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
            message: 'Lighting Plot\nVersion 1.0.0\n\nA theatrical lighting design CAD tool.',
            type: 'info',
          }),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function menuOpen() {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Lighting Plot', extensions: ['lightplot'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('load-file', { filePath, data });
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

ipcMain.on('set-title', (event, title) => {
  mainWindow.setTitle(title);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
