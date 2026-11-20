import { ipcRenderer } from './bridge';

// ── File reads (through the main process; the renderer has no fs) ──────────
export async function readTextFile(fp) {
  const r = await ipcRenderer.invoke('read-file', { filePath: fp });
  if (!r?.ok) throw new Error(r?.reason || 'Could not read file');
  return r.text;
}
export async function readBinaryFile(fp) {
  const r = await ipcRenderer.invoke('read-file', { filePath: fp, binary: true });
  if (!r?.ok) throw new Error(r?.reason || 'Could not read file');
  return r.buffer;
}

// ── PDF render ─────────────────────────────────────────────────────────────
// Uses pdfjs-dist v4 (compatible with Electron 31 / Chromium 126). The main process
// tells us where pdf.js lives; it is then imported by file URL.
export async function renderPdfToDataUrl(pdfDataUrl) {
  const paths = await ipcRenderer.invoke('pdfjs-paths');
  const pdfjsLib = await new Function('p', 'return import(p)')(paths.pdfjs);
  pdfjsLib.GlobalWorkerOptions.workerSrc = paths.worker;
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

