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
 * Parse XML document and extract EOS channel list.
 * Tries multiple known EOS XML schemas (varies by firmware version).
 */
function parseEOSChannels(xmlDoc) {
  const channels = [];

  // Schema A: <EosShowFile><ChanList><Chan Num="1" Label="..." ...>
  const chanListA = xmlDoc.querySelectorAll('ChanList > Chan, ChannelList > Channel, Chan');
  if (chanListA.length > 0) {
    chanListA.forEach(el => {
      const num     = el.getAttribute('Num') || el.getAttribute('num') || el.getAttribute('Number') || '';
      const label   = el.getAttribute('Label') || el.getAttribute('label') || el.getAttribute('Name') || '';
      const addr    = parseAddress(el);
      if (num) channels.push({ num: num.trim(), label: label.trim(), address: addr });
    });
    return channels;
  }

  // Schema B: flat <channel> elements with child elements
  xmlDoc.querySelectorAll('channel').forEach(el => {
    const num   = el.querySelector('number,num,chan_num')?.textContent || el.getAttribute('number') || '';
    const label = el.querySelector('label,name')?.textContent || el.getAttribute('label') || '';
    const addr  = el.querySelector('address,addr,dmx_addr')?.textContent || '';
    if (num) channels.push({ num: num.trim(), label: label.trim(), address: addr.trim() });
  });

  return channels;
}

function parseAddress(el) {
  // Try attribute variants
  const raw = el.getAttribute('Addr') || el.getAttribute('addr') || el.getAttribute('DMXAddr') || '';
  if (raw) return raw.trim();
  // Try child <IntAtAddr> or <Address>
  const child = el.querySelector('IntAtAddr,Address,addr');
  if (child) {
    const a = child.getAttribute('Addr') || child.getAttribute('addr') || child.textContent || '';
    return a.trim();
  }
  return '';
}

// ── Find XML files in the ZIP ─────────────────────────────────────────────────
async function extractChannelsFromESF2(file) {
  const arrayBuffer = await file.arrayBuffer();
  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error('Could not open file as a ZIP archive. Make sure you selected an .esf2 file.');
  }

  // Collect all XML-like files
  const xmlFiles = Object.values(zip.files).filter(f =>
    !f.dir && /\.(xml|esf|eos)$/i.test(f.name)
  );

  if (xmlFiles.length === 0) {
    throw new Error('No XML data found inside the showfile. Ensure this is an EOS ESF2 showfile.');
  }

  // Try each file until we find channels
  const parser = new DOMParser();
  for (const zf of xmlFiles) {
    const text = await zf.async('string');
    let doc;
    try {
      doc = parser.parseFromString(text, 'application/xml');
    } catch { continue; }
    const parseError = doc.querySelector('parsererror');
    if (parseError) continue;
    const channels = parseEOSChannels(doc);
    if (channels.length > 0) return { channels, fileName: zf.name };
  }

  throw new Error(
    'Could not find channel patch data in the showfile.\n' +
    'Try exporting a Channel List report from EOS (Show Control → Reports → Patch List) and import the CSV instead.'
  );
}

// ── CSV fallback parser ───────────────────────────────────────────────────────
function parseCSVChannels(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV file appears empty.');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const numIdx   = header.findIndex(h => ['chan','channel','channelnum','num','number'].includes(h));
  const labelIdx = header.findIndex(h => ['label','name','description','fixture'].includes(h));
  const addrIdx  = header.findIndex(h => ['address','addr','dmx','dmxaddress','patch'].includes(h));
  if (numIdx === -1) throw new Error('Could not find a "Channel" column in the CSV.');
  return lines.slice(1).map(l => {
    const cols = l.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    return {
      num:     cols[numIdx]  || '',
      label:   labelIdx !== -1 ? (cols[labelIdx] || '') : '',
      address: addrIdx  !== -1 ? (cols[addrIdx]  || '') : '',
    };
  }).filter(r => r.num);
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
              Select an EOS <strong>.esf2</strong> showfile or a channel list <strong>.csv</strong> export
              from EOS (Show Control → Reports → Patch List → Export CSV).
            </p>
            <p style={S.para}>
              Channels are matched to existing fixtures by their <em>Channel Number</em> field.
              Only matched fixtures will be updated.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={S.btn} onClick={() => fileRef.current?.click()}>
                📁 Choose File (.esf2 or .csv)
              </button>
              <input ref={fileRef} type="file" accept=".esf2,.esf,.xml,.csv"
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
