/**
 * EOSImport — imports patch data from an ETC EOS showfile (.esf2).
 *
 * ESF2 files are ZIP archives containing XML show data.
 * We extract channel list information (channel number, label, DMX address)
 * and let the user map it to existing fixtures in the active drawing.
 *
 * Matching strategy: EOS channel number ↔ fixture.channel field.
 * Un-matched channels can be ignored or used to update fixture labels.
 */
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

// ── XML channel parser ────────────────────────────────────────────────────────
/**
 * Parse a text string (XML or HTML-like) and extract EOS channel list.
 * Parses as HTML to get case-insensitive querySelector, which handles
 * EOS's mixed-case XML (Chan, chan, CHAN, Channel, etc.).
 */
function parseEOSText(text) {
  // Use HTML parser for case-insensitive element matching
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const channels = [];

  // Try every plausible element name EOS might use
  const candidates = [
    ...doc.querySelectorAll('chan'),
    ...doc.querySelectorAll('channel'),
  ];

  // Deduplicate by element identity
  const seen = new Set();
  const elems = candidates.filter(el => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });

  elems.forEach(el => {
    // Channel number — try attributes and child elements
    const num = (
      el.getAttribute('num') ||
      el.getAttribute('number') ||
      el.getAttribute('channelnum') ||
      el.querySelector('num,number,channelnum,channum')?.textContent ||
      ''
    ).trim();
    if (!num || isNaN(Number(num))) return;

    // Label
    const label = (
      el.getAttribute('label') ||
      el.getAttribute('name') ||
      el.getAttribute('description') ||
      el.querySelector('label,name,description')?.textContent ||
      ''
    ).trim();

    // DMX address — EOS stores as "universe/address" e.g. "1/1" or "1/1/1"
    const addr = extractAddress(el);

    channels.push({ num, label, address: addr });
  });

  return channels;
}

function extractAddress(el) {
  // Attribute variants
  for (const attr of ['addr', 'address', 'dmxaddr', 'dmxaddress', 'patch']) {
    const v = el.getAttribute(attr);
    if (v) return v.trim();
  }
  // Child elements: <intataddr>, <address>, <addr>, <dmx>, <patch>
  for (const sel of ['intataddr', 'address', 'addr', 'dmx', 'patch', 'chanpart']) {
    const child = el.querySelector(sel);
    if (child) {
      // Try attributes on child first
      for (const attr of ['addr', 'address', 'dmxaddr', 'at', 'universe']) {
        const v = child.getAttribute(attr);
        if (v) return v.trim();
      }
      const t = child.textContent?.trim();
      if (t) return t;
    }
  }
  return '';
}

// ── Diagnostic XML structure inspector ───────────────────────────────────────
function inspectXmlStructure(text, fileName) {
  // Parse both ways to compare
  const htmlDoc = new DOMParser().parseFromString(text, 'text/html');
  const xmlDoc  = new DOMParser().parseFromString(text, 'application/xml');

  // Collect unique tag names from html-parsed doc (body only, skipping html/head/body wrappers)
  const tagSet = new Set();
  const walk = (node) => {
    if (node.nodeType === 1) { tagSet.add(node.tagName.toLowerCase()); }
    node.childNodes.forEach(walk);
  };
  walk(htmlDoc.body || htmlDoc.documentElement);

  // Find the root element name from XML parse
  const xmlRoot = xmlDoc.documentElement?.tagName || '(parse error)';

  // Grab a 600-char snippet of raw XML
  const snippet = text.slice(0, 600).replace(/\s+/g, ' ');

  console.group(`[EOS Import] File: ${fileName}`);
  console.log('Root element (XML parse):', xmlRoot);
  console.log('All element names found (HTML parse):', [...tagSet].sort().join(', '));
  console.log('Raw snippet:', snippet);
  console.log('Total text length:', text.length);
  console.groupEnd();

  return { tags: tagSet, xmlRoot, snippet };
}

// ── Find XML files in the ZIP ─────────────────────────────────────────────────
async function extractChannelsFromESF2(file) {
  const arrayBuffer = await file.arrayBuffer();
  const diagLines = []; // human-readable diagnostics shown on failure

  // ── First: try as a ZIP archive (ESF2 and some ESF files) ─────────────────
  let zip = null;
  try { zip = await JSZip.loadAsync(arrayBuffer); } catch (e) {
    diagLines.push(`Not a ZIP archive (${e.message})`);
  }

  if (zip) {
    const allFiles = Object.values(zip.files).filter(f => !f.dir);
    diagLines.push(`ZIP contains ${allFiles.length} file(s): ${allFiles.map(f => f.name).join(', ')}`);

    // Detect EOS ESF2 binary format — identified by showdat.dat presence
    // ETC stores all show data as a proprietary binary blob; there is no XML inside
    const hasShowdat = allFiles.some(f => /showdat\.dat$/i.test(f.name));
    if (hasShowdat) {
      throw new Error(
        'EOS showfiles (.esf / .esf2) store patch data in a proprietary binary format ' +
        'that cannot be parsed without ETC\'s closed format specification.\n\n' +
        'Please export a Patch List CSV from EOS instead:\n' +
        '  Show Control → Reports → Patch List → Export CSV\n\n' +
        'Then import that .csv file here — all channels, labels and DMX addresses will be read correctly.'
      );
    }

    // Sort: prioritise patch/chan/show/fixture in name
    allFiles.sort((a, b) => {
      const score = n => /patch|chan|show|fixture/i.test(n) ? -1 : 0;
      return score(a.name) - score(b.name);
    });

    for (const zf of allFiles) {
      let text;
      try { text = await zf.async('string'); } catch { continue; }
      if (!/^\s*</.test(text)) {
        diagLines.push(`  ${zf.name}: skipped (not XML)`);
        continue;
      }
      const { tags } = inspectXmlStructure(text, zf.name);
      diagLines.push(`  ${zf.name}: XML found, elements: ${[...tags].sort().slice(0, 20).join(', ')}`);
      const channels = parseEOSText(text);
      if (channels.length > 0) return { channels, fileName: zf.name };
      diagLines.push(`    → 0 channels extracted`);
    }
  }

  // ── Fallback: try plain text with multiple encodings ─────────────────────
  const bytes = new Uint8Array(arrayBuffer);
  const hexHead = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  diagLines.push(`First bytes: ${hexHead}`);

  // ── Detect ETC proprietary binary ESF format ──────────────────────────────
  // Legacy .esf files start with the GUID {F2CC115C-666B-4719-...} in ASCII
  const asciiHead = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 40));
  if (asciiHead.startsWith('{F2CC115C') || asciiHead.startsWith('{f2cc115c')) {
    diagLines.push('Detected: ETC EOS legacy binary ESF format (GUID header)');
    // Last-ditch: brute-force scan for any embedded XML fragment
    const fullText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const xmlIdx = fullText.search(/<(?:ChanList|EosShowFile|ShowData|PatchData|Chan\s|Channel\s)/i);
    if (xmlIdx >= 0) {
      diagLines.push(`  Found XML-like content at byte ${xmlIdx} — attempting parse`);
      const channels = parseEOSText(fullText.slice(xmlIdx));
      if (channels.length > 0) return { channels, fileName: file.name };
      diagLines.push('  → 0 channels in embedded XML fragment');
    }
    console.warn('[EOS Import] Failed. Diagnostics:\n' + diagLines.join('\n'));
    throw new Error(
      'This is the legacy EOS binary showfile format (.esf) which cannot be parsed directly.\n\n' +
      'To import your patch, please use one of these methods from EOS:\n' +
      '  • Export a CSV — Show Control → Reports → Patch List → Export CSV\n' +
      '  • Save as ESF2 — File → Save As and choose ESF2 format (.esf2)\n\n' +
      'Then re-import that file here.'
    );
  }

  // Try several encodings — EOS ESF2/XML files are usually UTF-8 but can be UTF-16
  const encodings = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'];
  for (const enc of encodings) {
    let text;
    try {
      text = new TextDecoder(enc, { fatal: false }).decode(arrayBuffer);
      text = text.replace(/^﻿/, ''); // strip BOM
    } catch { continue; }

    if (!/^\s*</.test(text)) {
      diagLines.push(`  [${enc}]: doesn't start with < (first 40 chars: ${JSON.stringify(text.slice(0, 40))})`);
      continue;
    }
    const { tags } = inspectXmlStructure(text, file.name + ` (${enc})`);
    diagLines.push(`  [${enc}]: XML found, elements: ${[...tags].sort().slice(0, 20).join(', ')}`);
    const channels = parseEOSText(text);
    if (channels.length > 0) return { channels, fileName: file.name };
    diagLines.push('    → 0 channels extracted');
  }


  console.warn('[EOS Import] Failed. Diagnostics:\n' + diagLines.join('\n'));
  throw new Error(
    'Could not find channel patch data in the showfile.\n\n' +
    'Diagnostics (see browser console for full detail):\n' +
    diagLines.slice(0, 8).join('\n') + '\n\n' +
    'Supported formats: EOS ESF2 showfile (.esf2), legacy ESF showfile (.esf), or a Channel List CSV export from EOS (Show Control → Reports → Patch List).'
  );
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVChannels(text) {
  const allLines = text.split(/\r?\n/);

  // ── EOS full-show export (multi-section) ─────────────────────────────────
  // Detect by presence of section markers like START_CHANNELS
  const startIdx = allLines.findIndex(l => l.trim() === 'START_CHANNELS');
  if (startIdx !== -1) {
    const endIdx = allLines.findIndex((l, i) => i > startIdx && l.trim() === 'END_CHANNELS');
    const sectionLines = allLines.slice(startIdx + 1, endIdx === -1 ? undefined : endIdx)
      .filter(l => l.trim());
    return parseCSVSection(sectionLines, 'EOS full-show export (CHANNELS section)');
  }

  // ── Simple patch-list CSV (single section) ────────────────────────────────
  const lines = allLines.filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV file appears empty.');
  return parseCSVSection(lines, 'simple patch list');
}

function parseCSVSection(lines, sourceDesc) {
  if (lines.length < 2) throw new Error(`No data rows found in ${sourceDesc}.`);

  // Split respecting quoted fields
  function splitCSV(line) {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }

  const header = splitCSV(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));

  // Channel number column
  const numIdx = header.findIndex(h => ['channel','chan','channelnum','num','number'].includes(h));
  if (numIdx === -1) throw new Error(`Could not find a Channel column in ${sourceDesc}.\nHeaders found: ${header.join(', ')}`);

  // Label — prefer 'label' over 'fixture_type'
  const labelIdx = (() => {
    for (const name of ['label','name','description','fixture']) {
      const i = header.indexOf(name); if (i !== -1) return i;
    }
    return -1;
  })();

  // Address — EOS uses 'address' column
  const addrIdx = (() => {
    for (const name of ['address','addr','dmx','dmxaddress','patch']) {
      const i = header.indexOf(name); if (i !== -1) return i;
    }
    return -1;
  })();

  // Manufacturer (EOS full-show export has this)
  const mfrIdx = header.findIndex(h => ['manufacturer','mfr','make'].includes(h));

  return lines.slice(1)
    .map(l => splitCSV(l))
    .filter(cols => cols[numIdx]?.trim())
    .map(cols => {
      const num     = cols[numIdx]?.trim() || '';
      const rawAddr = addrIdx  !== -1 ? (cols[addrIdx]?.trim()  || '') : '';
      const label   = labelIdx !== -1 ? (cols[labelIdx]?.trim() || '') : '';
      const mfr     = mfrIdx   !== -1 ? (cols[mfrIdx]?.trim()  || '') : '';
      // Normalise EOS address: "1/49<60" → "1/49", "49<60" → "49", "1/43" → "1/43"
      const address = rawAddr.replace(/<\d+$/, '');
      return { num, label, address, manufacturer: mfr };
    })
    .filter(r => r.num && !isNaN(Number(r.num)));
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EOSImport({ drawing, fixtureTypes, onClose, onApply }) {
  const [step, setStep]         = useState('choose'); // choose | preview | done
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [channels, setChannels] = useState([]);
  const [sourceFile, setSource] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [fieldMap, setFieldMap] = useState({ label: true, channel: true, address: false });
  const fileRef = useRef(null);

  // Build fixture lookup by channel number for match preview
  const fixtureByChannel = {};
  (drawing?.fixtures || []).forEach(f => {
    if (f.channel) fixtureByChannel[String(f.channel).trim()] = f;
  });

  async function handleFile(file) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      let result;
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const chs = parseCSVChannels(text);
        result = { channels: chs, fileName: file.name };
      } else {
        result = await extractChannelsFromESF2(file);
      }
      setChannels(result.channels);
      setSource(`${file.name} → ${result.fileName || file.name} (${result.channels.length} channels)`);
      setSelected(new Set(result.channels.map(c => c.num)));
      setStep('preview');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(val) {
    setSelected(val ? new Set(channels.map(c => c.num)) : new Set());
  }

  function applyImport() {
    const toImport = channels.filter(c => selected.has(c.num));
    onApply(toImport, fieldMap);
    setStep('done');
  }

  // ── Step: choose file ─────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={S.box}>
          <div style={S.title}>📂 Import Patch from ETC EOS Showfile</div>
          <div style={S.body}>
            <p style={S.para}>
              Import a <strong>Patch List CSV</strong> exported from EOS:
            </p>
            <p style={{ ...S.para, fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)',
              padding: '6px 10px', borderRadius: 3, marginBottom: 8 }}>
              Show Control → Reports → Patch List → Export CSV
            </p>
            <p style={S.para}>
              EOS showfiles (.esf / .esf2) store data in a proprietary binary format — only the
              CSV export can be parsed. Channels are matched to existing fixtures by their{' '}
              <em>Channel Number</em> field.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={S.btn} onClick={() => fileRef.current?.click()}>
                📁 Choose Patch List CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.esf2,.esf,.xml"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            </div>
            {loading && <div style={{ color: '#a0aec0', marginTop: 12 }}>⏳ Parsing showfile…</div>}
            {error   && <div style={{ color: '#ef4444', marginTop: 12, whiteSpace: 'pre-wrap' }}>⚠ {error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Step: done ────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={S.box}>
          <div style={S.title}>✅ Import Complete</div>
          <div style={S.body}>
            <p style={S.para}>Fixture patch data has been applied to the drawing.</p>
            <button style={S.btn} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: preview ─────────────────────────────────────────────────────────
  const allSel = selected.size === channels.length;
  const matchedCount = channels.filter(c => selected.has(c.num) && fixtureByChannel[c.num]).length;

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.box, width: '90vw', maxWidth: 900, height: '80vh' }}>
        <div style={S.title}>
          📋 EOS Import Preview
          <span style={{ fontSize: 11, color: '#718096', fontWeight: 400, marginLeft: 12 }}>{sourceFile}</span>
        </div>

        {/* What to import */}
        <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid #0f3460', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#a0aec0' }}>Update fields:</span>
          {[['label', 'Label / Name'], ['channel', 'Channel Number'], ['address', 'DMX Address']].map(([k, lab]) => (
            <label key={k} style={{ fontSize: 11, color: '#e0e0e0', display: 'flex', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={fieldMap[k]} onChange={e => setFieldMap(m => ({ ...m, [k]: e.target.checked }))} />
              {lab}
            </label>
          ))}
        </div>

        {/* Channel table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 32 }}>
                  <input type="checkbox" checked={allSel} onChange={e => toggleAll(e.target.checked)} />
                </th>
                <th style={S.th}>Ch #</th>
                <th style={S.th}>EOS Label</th>
                <th style={S.th}>Type / Mfr</th>
                <th style={S.th}>DMX Address</th>
                <th style={S.th}>Matched Fixture</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c, i) => {
                const match = fixtureByChannel[c.num];
                const ftype = match ? fixtureTypes.find(t => t.id === match.fixtureTypeId) : null;
                const isSel = selected.has(c.num);
                return (
                  <tr key={c.num} style={{ background: i%2===0?'transparent':'rgba(255,255,255,0.02)',
                    opacity: isSel ? 1 : 0.45 }}>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <input type="checkbox" checked={isSel}
                        onChange={e => setSelected(s => {
                          const n = new Set(s);
                          e.target.checked ? n.add(c.num) : n.delete(c.num);
                          return n;
                        })} />
                    </td>
                    <td style={{ ...S.td, color: '#60b0ff', fontWeight: 700 }}>{c.num}</td>
                    <td style={S.td}>{c.label || <em style={{ color: '#4a5568' }}>—</em>}</td>
                    <td style={{ ...S.td, fontSize: 10, color: '#718096' }}>{c.manufacturer || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', color: '#a78bfa' }}>{c.address || '—'}</td>
                    <td style={S.td}>
                      {match
                        ? <span style={{ color: '#34d399' }}>{ftype?.name || match.type || 'Fixture'} #{match.unit || match.channel || match.id.slice(0,6)}</span>
                        : <em style={{ color: '#718096' }}>No match</em>}
                    </td>
                    <td style={S.td}>
                      {match
                        ? <span style={{ color: '#34d399' }}>✓ Will update</span>
                        : <span style={{ color: '#4a5568' }}>Skip</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #0f3460', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#a0aec0', flex: 1 }}>
            {selected.size} selected · {matchedCount} will be updated in drawing
          </span>
          <button style={S.btn} disabled={matchedCount === 0} onClick={applyImport}>
            ✅ Apply to Drawing
          </button>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 980,
  },
  box: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: '90vw', maxWidth: 560,
    display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
    overflow: 'hidden',
  },
  title: {
    padding: '12px 16px', borderBottom: '1px solid #0f3460',
    fontSize: 14, fontWeight: 700, color: '#e0e0e0',
    display: 'flex', alignItems: 'baseline', gap: 8,
  },
  body: { padding: '16px', flex: 1 },
  para: { fontSize: 12, color: '#a0aec0', marginBottom: 8, lineHeight: 1.6 },
  btn: {
    padding: '7px 18px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  cancelBtn: {
    padding: '7px 14px', background: 'none', border: '1px solid #4a5568',
    borderRadius: 4, color: '#718096', cursor: 'pointer', fontSize: 12,
  },
  th: {
    padding: '6px 10px', background: '#0f3460', color: '#4a90d9',
    textAlign: 'left', fontSize: 11, fontWeight: 700, position: 'sticky', top: 0,
  },
  td: { padding: '5px 10px', color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
};
