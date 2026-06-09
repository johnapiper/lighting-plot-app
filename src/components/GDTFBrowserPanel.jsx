import React, { useState } from 'react';
import { parseGdtf } from '../library/GdtfImporter';

// Electron shell for opening external URLs
const { shell } = window.require ? window.require('electron') : { shell: null };
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

// How to open gdtf-share.com in the system browser
function openExternal(url) {
  if (shell) shell.openExternal(url);
  else window.open(url, '_blank');
}

export default function GDTFBrowserPanel({ onImportGdtf, onClose }) {
  const [importing, setImporting] = useState(false);

  // Handle a .gdtf file dropped or selected via a hidden input
  async function handleFiles(files) {
    setImporting(true);
    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.gdtf')) continue;
      try {
        const buf = await file.arrayBuffer();
        const ft = await parseGdtf(buf, file.name);
        onImportGdtf(ft);
      } catch (err) {
        alert(`Failed to import ${file.name}:\n${err.message}`);
      }
    }
    setImporting(false);
    onClose();
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div style={sty.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sty.panel}>
        {/* Header */}
        <div style={sty.header}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4a90d9' }}>🌐 GDTF Share — Fixture Import</div>
            <div style={{ fontSize: 10, color: '#718096', marginTop: 2 }}>gdtf-share.com community fixture library</div>
          </div>
          <button style={sty.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Instructions */}
        <div style={sty.body}>
          {/* Step 1 */}
          <div style={sty.step}>
            <div style={sty.stepNum}>1</div>
            <div style={sty.stepContent}>
              <div style={sty.stepTitle}>Browse & download a fixture from GDTF Share</div>
              <div style={sty.stepDesc}>
                Search for your fixture on the website. Find the fixture, click it, and download the <code style={sty.code}>.gdtf</code> file to your computer.
              </div>
              <button style={sty.primaryBtn} onClick={() => openExternal('https://gdtf-share.com/share.php?v=gdtf')}>
                Open gdtf-share.com ↗
              </button>
            </div>
          </div>

          <div style={sty.divider} />

          {/* Step 2 */}
          <div style={sty.step}>
            <div style={sty.stepNum}>2</div>
            <div style={sty.stepContent}>
              <div style={sty.stepTitle}>Drop the downloaded .gdtf file here</div>
              <div style={sty.stepDesc}>
                Drag and drop the <code style={sty.code}>.gdtf</code> file onto the box below, or click it to browse for the file.
              </div>
              {/* Drop zone */}
              <label style={sty.dropZone}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}>
                <input type="file" accept=".gdtf" multiple style={{ display: 'none' }}
                  onChange={e => handleFiles(e.target.files)} />
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 12, color: '#a0aec0' }}>
                  {importing ? 'Importing…' : 'Drop .gdtf file here or click to browse'}
                </div>
              </label>
            </div>
          </div>

          <div style={sty.divider} />

          {/* Alternative: Fixture Builder */}
          <div style={{ padding: '10px 0 4px', fontSize: 11, color: '#718096', textAlign: 'center' }}>
            Want to create a custom fixture?{' '}
            <span style={{ color: '#4a90d9', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => openExternal('https://fixturebuilder.gdtf-share.com')}>
              Open GDTF Fixture Builder ↗
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const sty = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
  },
  panel: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: 460, display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #0f3460',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#718096',
    cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
  },
  body: { padding: '16px 20px' },
  step: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    width: 26, height: 26, borderRadius: '50%',
    background: '#0f3460', border: '1px solid #4a90d9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, color: '#4a90d9', flexShrink: 0,
  },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 5 },
  stepDesc: { fontSize: 11, color: '#a0aec0', lineHeight: 1.5, marginBottom: 10 },
  code: { background: '#0d1b2a', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', fontSize: 11, color: '#68d391' },
  primaryBtn: {
    padding: '7px 16px', background: '#4a90d9', border: 'none',
    borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  dropZone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    border: '2px dashed #1a3a5c', borderRadius: 6,
    padding: '24px 16px', cursor: 'pointer',
    background: '#0d1b2a', transition: 'border-color 0.2s',
    width: '100%', boxSizing: 'border-box',
  },
  divider: { borderTop: '1px solid #0f3460', margin: '14px 0' },
};
