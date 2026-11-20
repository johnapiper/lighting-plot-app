import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const { mergePdfs } = require('../lib/pdfExport.js');

async function makePdf(w, h) {
  const d = await PDFDocument.create();
  d.addPage([w, h]);
  return Buffer.from(await d.save());
}

describe('mergePdfs', () => {
  it('merges pages of different sizes in order', async () => {
    const merged = await mergePdfs([await makePdf(842, 595), await makePdf(595, 842), await makePdf(1191, 842)]);
    const doc = await PDFDocument.load(merged);
    const sizes = doc.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
    expect(sizes).toEqual([[842, 595], [595, 842], [1191, 842]]);
  });
});
