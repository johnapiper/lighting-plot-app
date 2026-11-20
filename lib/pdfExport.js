'use strict';
/**
 * Multi-page PDF export (main process).
 * Each page is rendered by a hidden BrowserWindow with Chromium's printToPDF
 * (vector output, exact paper size from the page's @page rule), then the pages
 * are merged into one document with pdf-lib so sheets of different sizes /
 * orientations can live in one file.
 */
const { PDFDocument } = require('pdf-lib');

/**
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @param {Array<{ html: string }>} pages
 * @returns {Promise<Buffer>}
 */
async function renderPagesToPdf(BrowserWindow, pages) {
  const buffers = [];
  for (const page of pages) {
    const win = new BrowserWindow({
      show: false, width: 1200, height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page.html));
      buffers.push(await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
      }));
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
  if (buffers.length === 1) return buffers[0];
  return mergePdfs(buffers);
}

async function mergePdfs(buffers) {
  const out = await PDFDocument.create();
  for (const b of buffers) {
    const src = await PDFDocument.load(b);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach(p => out.addPage(p));
  }
  return Buffer.from(await out.save());
}

module.exports = { renderPagesToPdf, mergePdfs };
