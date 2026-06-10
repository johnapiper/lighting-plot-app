/**
 * GDTFBrowserPanel — native in-app browser for the GDTF Share fixture library.
 *
 * API (session-cookie based):
 *   POST /apis/public/login.php        { user, password } → { result, notice }
 *   GET  /apis/public/getList.php      → array of fixture revisions
 *   GET  /apis/public/downloadFile.php?rid=N → binary .gdtf stream
 *
 * Uses Node.js https module directly (bypasses CORS; nodeIntegration=true).
 * Session cookies are captured from login and replayed on subsequent requests.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { parseGdtf } from '../library/GdtfImporter';

// Node modules available because nodeIntegration:true
const https  = window.require('https');
const HOST   = 'gdtf-share.com';
const PER_PAGE = 30;

// ── Minimal HTTPS client with cookie jar ─────────────────────────────────────

let cookieJar = ''; // persists for the lifetime of this panel instance

function httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: HOST, path, method: 'GET', headers: { Cookie: cookieJar } },
      (res) => {
        captureCookies(res);
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(path, json) {
  const body = JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST, path, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Cookie: cookieJar,
        },
      },
      (res) => {
        captureCookies(res);
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function captureCookies(res) {
  const sc = res.headers['set-cookie'];
  if (!sc) return;
  // Merge new cookies into jar (keep name=value pairs, drop attributes)
  const jar = {};
  cookieJar.split(';').forEach(c => { const [k,v] = c.trim().split('='); if (k) jar[k.trim()] = v||''; });
  sc.forEach(c => { const [k,v] = c.split(';')[0].split('='); if (k) jar[k.trim()] = v||''; });
  cookieJar = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function parseJSON(buf) {
  try { return JSON.parse(buf.toString('utf8')); }
  catch { return null; }
}

// ── Field accessors (handle whatever shape the API returns) ──────────────────

function fMfr(r)  { return r.manufacturer || r.Manufacturer || r.vendor || ''; }
function fName(r) { return r.fixture || r.name || r.Name || r.FixtureName || r.model || ''; }
function fRev(r)  { return r.revision || r.Revision || r.revisionName || r.version || ''; }
function fRid(r)  { return r.rid || r.RID || r.revisionId || r.id || r.RevisionID; }

// ── Component ─────────────────────────────────────────────────────────────────

export default function GDTFBrowserPanel({ onImportGdtf, onClose }) {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loggedIn,  setLoggedIn]  = useState(false);
  const [loginErr,  setLoginErr]  = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [allRows,   setAllRows]   = useState(null);  // null = not loaded
  const [listErr,   setListErr]   = useState('');
  const [listBusy,  setListBusy]  = useState(false);

  const [query,     setQuery]     = useState('');
  const [page,      setPage]      = useState(1);

  const [importing, setImporting] = useState(null); // rid | 'done:rid'

  // Preview state — { row, ft } or null
  const [preview,   setPreview]   = useState(null);
  const [prevBusy,  setPrevBusy]  = useState(null); // rid being previewed

  // Reset cookie jar when panel mounts (fresh session each open)
  useEffect(() => { cookieJar = ''; }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e && e.preventDefault();
    setLoginBusy(true);
    setLoginErr('');
    try {
      const { status, body } = await httpsPost('/apis/public/login.php', { user: email, password });
      const data = parseJSON(body);
      if (!data) throw new Error(`Unexpected server response (HTTP ${status})`);
      if (!data.result) throw new Error(data.error || data.notice || `Login failed (${status})`);
      setLoggedIn(true);
      fetchList();
    } catch (err) {
      setLoginErr(err.message);
    } finally {
      setLoginBusy(false);
    }
  }

  // ── Fetch full library list ────────────────────────────────────────────────
  async function fetchList() {
    setListBusy(true);
    setListErr('');
    setAllRows(null);
    try {
      const { status, body } = await httpsGet('/apis/public/getList.php');
      if (status === 401) throw new Error('Session expired — please sign in again.');
      if (status !== 200) throw new Error(`Server error: HTTP ${status}`);
      const data = parseJSON(body);
      if (!data) throw new Error('Could not parse fixture list response.');
      const list = Array.isArray(data) ? data
        : (data.list || data.fixtures || data.data || data.result || []);
      if (!Array.isArray(list)) throw new Error('Unexpected fixture list format.');
      setAllRows(list);
      setPage(1);
    } catch (err) {
      setListErr(err.message);
    } finally {
      setListBusy(false);
    }
  }

  // ── Filter + paginate ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!allRows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r =>
      fMfr(r).toLowerCase().includes(q) || fName(r).toLowerCase().includes(q)
    );
  }, [allRows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [query]);

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport(row) {
    const id = fRid(row);
    if (id == null) { alert('Cannot determine revision ID for this fixture.'); return; }
    setImporting(String(id));
    try {
      const { status, body } = await httpsGet(`/apis/public/downloadFile.php?rid=${id}`);
      if (status !== 200) throw new Error(`Download failed: HTTP ${status}`);
      // body is a Node Buffer — convert to ArrayBuffer
      const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      const filename = `${fMfr(row)} ${fName(row)} ${fRev(row) || id}.gdtf`.replace(/\s+/g, ' ').trim();
      const ft = await parseGdtf(ab, filename);
      onImportGdtf(ft);
      setImporting('done:' + id);
      setTimeout(onClose, 900);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      setImporting(null);
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  async function handlePreview(row) {
    const id = fRid(row);
    if (id == null) return;
    setPrevBusy(String(id));
    try {
      const { status, body } = await httpsGet(`/apis/public/downloadFile.php?rid=${id}`);
      if (status !== 200) throw new Error(`Download failed: HTTP ${status}`);
      const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      const filename = `${fMfr(row)} ${fName(row)} ${fRev(row) || id}.gdtf`.replace(/\s+/g, ' ').trim();
      const ft = await parseGdtf(ab, filename);
      setPreview({ row, ft });
    } catch (err) {
      alert(`Preview failed: ${err.message}`);
    } finally {
      setPrevBusy(null);
    }
  }

  function confirmImportFromPreview() {
    if (!preview) return;
    onImportGdtf(preview.ft);
    setPreview(null);
    setImporting('done:' + String(fRid(preview.row)));
    setTimeout(onClose, 900);
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  function handleSignOut() {
    cookieJar = '';
    setLoggedIn(false);
    setAllRows(null);
    setQuery('');
    setListErr('');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel}>

        {/* Title bar */}
        <div style={S.titleBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#4a90d9' }}>🌐 GDTF Share</span>
            <span style={{ fontSize: 11, color: '#718096' }}>community fixture library</span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── LOGIN ──────────────────────────────────────────────────────── */}
        {!loggedIn && (
          <div style={S.loginWrap}>
            <div style={{ fontSize: 12, color: '#a0aec0', marginBottom: 14, lineHeight: 1.6 }}>
              Sign in with your{' '}
              <strong style={{ color: '#e0e0e0' }}>gdtf-share.com</strong> account to
              browse the community library and import fixtures directly into your plot.
            </div>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                style={S.inp} type="text"
                placeholder="Username or email"
                value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="username"
              />
              <input
                style={S.inp} type="password"
                placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {loginErr && <div style={S.errBox}>{loginErr}</div>}
              <button style={S.loginBtn} type="submit" disabled={loginBusy || !email || !password}>
                {loginBusy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div style={{ marginTop: 12, fontSize: 11, color: '#718096' }}>
              No account?{' '}
              <span style={S.link} onClick={() => {
                const { shell } = window.require('electron');
                shell.openExternal('https://gdtf-share.com/landing/pages/signUp.php');
              }}>
                Register on gdtf-share.com ↗
              </span>
            </div>
          </div>
        )}

        {/* ── LIBRARY BROWSER ─────────────────────────────────────────────── */}
        {loggedIn && (
          <>
            {/* Search + controls */}
            <div style={S.toolbar}>
              <input
                style={{ ...S.inp, flex: 1, fontSize: 12 }}
                placeholder="Search manufacturer or fixture name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {allRows && !listBusy && (
                <span style={{ fontSize: 10, color: '#718096', whiteSpace: 'nowrap' }}>
                  {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
              <button style={S.signOutBtn} title="Sign out" onClick={handleSignOut}>Sign out</button>
            </div>

            {/* Loading / error */}
            {listBusy && (
              <div style={S.banner}>
                <span style={{ opacity: 0.6 }}>⏳</span> Loading fixture library from gdtf-share.com…
              </div>
            )}
            {listErr && !listBusy && (
              <div style={{ ...S.banner, color: '#fc8181' }}>
                ⚠ {listErr}
                <button style={S.retryBtn} onClick={fetchList}>Retry</button>
              </div>
            )}

            {/* Table + optional preview pane */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* ── Fixture list ── */}
              <div style={{ ...S.tableWrap, flex: preview ? '0 0 55%' : 1 }}>
                {/* Header */}
                <div style={S.headerRow}>
                  <span style={{ flex: '0 0 140px', color: '#4a90d9' }}>Manufacturer</span>
                  <span style={{ flex: 1, color: '#4a90d9' }}>Fixture</span>
                  <span style={{ flex: '0 0 56px', color: '#4a90d9' }}>Rev</span>
                  <span style={{ flex: '0 0 108px' }} />
                </div>

                {!listBusy && !listErr && allRows !== null && pageRows.length === 0 && (
                  <div style={S.empty}>
                    {query ? 'No fixtures match your search.' : 'Library is empty.'}
                  </div>
                )}

                {pageRows.map((row, i) => {
                  const id       = String(fRid(row) ?? '');
                  const done     = importing === 'done:' + id;
                  const impBusy  = importing === id;
                  const prevThis = prevBusy  === id;
                  const isPreviewed = preview && String(fRid(preview.row) ?? '') === id;
                  return (
                    <div key={`${id}-${i}`} style={{
                      ...S.row,
                      background: isPreviewed ? 'rgba(74,144,217,0.1)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                      borderLeft: isPreviewed ? '2px solid #4a90d9' : '2px solid transparent',
                    }}>
                      <span style={{ ...S.cell, flex: '0 0 140px', color: '#a0aec0', fontSize: 11 }}>
                        {fMfr(row)}
                      </span>
                      <span style={{ ...S.cell, flex: 1, color: '#e0e0e0' }}>
                        {fName(row)}
                      </span>
                      <span style={{ ...S.cell, flex: '0 0 56px', color: '#4a6080', fontSize: 10 }}>
                        {fRev(row)}
                      </span>
                      <span style={{ flex: '0 0 108px', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button
                          style={{ ...S.previewBtn, ...(isPreviewed ? S.previewBtnActive : {}) }}
                          disabled={!!prevBusy || !!importing}
                          onClick={() => isPreviewed ? setPreview(null) : handlePreview(row)}
                          title="Preview fixture details"
                        >
                          {prevThis ? '…' : isPreviewed ? '◀ Hide' : '🔍 Preview'}
                        </button>
                        <button
                          style={{ ...S.importBtn, ...(done ? S.importDone : {}) }}
                          disabled={!!importing || !!prevBusy}
                          onClick={() => handleImport(row)}
                          title="Import directly without preview"
                        >
                          {done ? '✓' : impBusy ? '…' : 'Import'}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── Preview pane ── */}
              {preview && (
                <PreviewPane
                  ft={preview.ft}
                  row={preview.row}
                  onClose={() => setPreview(null)}
                  onImport={confirmImportFromPreview}
                  importing={!!importing}
                />
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={S.pager}>
                <button style={S.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                <span style={{ fontSize: 11, color: '#a0aec0' }}>Page {page} / {totalPages}</span>
                <button style={S.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Preview pane component ────────────────────────────────────────────────────

function PreviewPane({ ft, row, onClose, onImport, importing }) {
  return (
    <div style={{
      flex: '0 0 45%', borderLeft: '1px solid #0f3460', display: 'flex',
      flexDirection: 'column', overflow: 'hidden', background: '#0f1e35',
    }}>
      {/* Pane header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #0f3460', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e0e0e0' }}>Fixture Preview</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 14 }}
        >✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Symbol + name header */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
          <svg viewBox={ft.symbolViewBox} width="52" height="52"
            style={{ color: '#4a90d9', background: '#0d1b2a', borderRadius: 6,
              border: '1px solid #1a3a5c', flexShrink: 0 }}>
            <g dangerouslySetInnerHTML={{ __html: ft.symbol }} />
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e0', lineHeight: 1.3 }}>
              {ft.name}
            </div>
            <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>
              {ft.manufacturer}
            </div>
            {ft.gdtfCategory && (
              <div style={{
                display: 'inline-block', marginTop: 5,
                fontSize: 9, color: '#4a90d9', background: 'rgba(74,144,217,0.12)',
                border: '1px solid rgba(74,144,217,0.25)', borderRadius: 3, padding: '1px 6px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                {ft.gdtfCategory}
              </div>
            )}
          </div>
        </div>

        {/* Physical specs */}
        <PrevSection title="Physical">
          {ft.powerW   != null && <PrevRow label="Power"  value={`${ft.powerW} W`}  />}
          {ft.weightKg != null && <PrevRow label="Weight" value={`${ft.weightKg} kg`} />}
          {ft.powerW == null && ft.weightKg == null && (
            <span style={{ fontSize: 11, color: '#4a5568', fontStyle: 'italic' }}>
              Not specified in GDTF file
            </span>
          )}
        </PrevSection>

        {/* DMX modes */}
        <PrevSection title="DMX Modes">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={PS.th}>Mode</th>
                <th style={{ ...PS.th, textAlign: 'right' }}>Channels</th>
              </tr>
            </thead>
            <tbody>
              {ft.modes.map((m, i) => (
                <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={PS.td}>{m.name}</td>
                  <td style={{ ...PS.td, textAlign: 'right', color: '#a78bfa', fontFamily: 'monospace' }}>
                    {m.channelCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrevSection>

        {/* Rev / source */}
        <PrevSection title="Source">
          <PrevRow label="Revision" value={fRev(row) || '—'} />
          <PrevRow label="GDTF Share ID" value={String(fRid(row) ?? '—')} />
        </PrevSection>
      </div>

      {/* Footer — import button */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid #0f3460', flexShrink: 0,
        display: 'flex', gap: 8,
      }}>
        <button
          style={{
            flex: 1, padding: '8px', background: '#0f3460', border: '1px solid #4a90d9',
            borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
          disabled={importing}
          onClick={onImport}
        >
          ⬇ Import to Library
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '8px 12px', background: 'none', border: '1px solid #2a3a5a',
            borderRadius: 4, color: '#718096', cursor: 'pointer', fontSize: 12,
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}

function PrevSection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, color: '#4a90d9', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 6, borderBottom: '1px solid #0f3460', paddingBottom: 3,
      }}>{title}</div>
      {children}
    </div>
  );
}

function PrevRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
      padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ color: '#718096' }}>{label}</span>
      <span style={{ color: '#e0e0e0', fontFamily: /^\d/.test(value) ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

const PS = {
  th: {
    padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#4a5568',
    textAlign: 'left', borderBottom: '1px solid #0f3460',
  },
  td: {
    padding: '4px 6px', fontSize: 11, color: '#e0e0e0',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
  },
  panel: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: '90vw', maxWidth: 960, maxHeight: '84vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 16px 48px rgba(0,0,0,0.9)',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #0f3460', flexShrink: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#718096',
    cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1,
  },
  loginWrap: { padding: '22px 24px', flexShrink: 0 },
  inp: {
    background: '#0d1b2a', border: '1px solid #1a3a5c', borderRadius: 3,
    color: '#e0e0e0', fontSize: 13, padding: '7px 10px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  loginBtn: {
    padding: '9px', background: '#4a90d9', border: 'none',
    borderRadius: 4, color: '#fff', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
    opacity: 1,
  },
  errBox: {
    color: '#fc8181', fontSize: 11,
    background: 'rgba(252,129,129,0.08)', padding: '6px 10px', borderRadius: 3,
  },
  link: { color: '#4a90d9', cursor: 'pointer', textDecoration: 'underline' },
  toolbar: {
    display: 'flex', gap: 8, alignItems: 'center',
    padding: '9px 12px', borderBottom: '1px solid #0f3460', flexShrink: 0,
  },
  signOutBtn: {
    background: 'none', border: '1px solid #2a3a5a', borderRadius: 3,
    color: '#718096', cursor: 'pointer', fontSize: 10, padding: '4px 8px', whiteSpace: 'nowrap',
  },
  banner: {
    padding: '9px 14px', fontSize: 12, color: '#a0aec0',
    borderBottom: '1px solid #0f3460', flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  retryBtn: {
    background: 'none', border: '1px solid #fc8181', borderRadius: 3,
    color: '#fc8181', cursor: 'pointer', fontSize: 10, padding: '2px 8px',
  },
  tableWrap: { flex: 1, overflowY: 'auto' },
  headerRow: {
    display: 'flex', gap: 6, padding: '7px 14px',
    background: '#0f2040', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    position: 'sticky', top: 0, zIndex: 1,
  },
  row: {
    display: 'flex', gap: 6, alignItems: 'center',
    padding: '7px 14px', borderBottom: '1px solid rgba(15,52,96,0.4)',
  },
  cell: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 },
  empty: { padding: 28, textAlign: 'center', fontSize: 12, color: '#4a5568' },
  importBtn: {
    padding: '3px 10px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 3, color: '#4a90d9', cursor: 'pointer', fontSize: 11,
  },
  importDone: {
    background: '#0f3a1a', borderColor: '#68d391', color: '#68d391', cursor: 'default',
  },
  previewBtn: {
    padding: '3px 8px', background: 'transparent', border: '1px solid #2a3a5a',
    borderRadius: 3, color: '#718096', cursor: 'pointer', fontSize: 11,
  },
  previewBtnActive: {
    background: 'rgba(74,144,217,0.1)', borderColor: '#4a90d9', color: '#4a90d9',
  },
  pager: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
    padding: '8px 12px', borderTop: '1px solid #0f3460', flexShrink: 0,
  },
  pageBtn: {
    background: '#0f3460', border: '1px solid #1a4a7a',
    borderRadius: 3, color: '#a0aec0', cursor: 'pointer',
    fontSize: 11, padding: '4px 12px',
  },
};
