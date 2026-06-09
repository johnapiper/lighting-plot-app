import React, { useState, useRef } from 'react';
import { parseGdtf } from '../library/GdtfImporter';

const API = 'https://gdtf-share.com';

export default function GDTFBrowserPanel({ onImportGdtf, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loginStatus, setLoginStatus] = useState(null); // null | 'loading' | 'ok' | string(error)

  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState(null);
  const [searchStatus, setSearchStatus] = useState(null);
  const [importing, setImporting] = useState(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 20;

  async function handleLogin(e) {
    e && e.preventDefault();
    setLoginStatus('loading');
    try {
      const res = await fetch(`${API}/apis/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: email, password }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.token) throw new Error(data.message || 'No token returned');
      setToken(data.token);
      setLoginStatus('ok');
      doSearch(1, data.token);
    } catch (err) {
      setLoginStatus(err.message);
    }
  }

  async function doSearch(pg, tk) {
    const useToken = tk || token;
    if (!useToken) { setSearchStatus('Login first to search'); return; }
    setSearchStatus('loading');
    setResults(null);
    try {
      const params = new URLSearchParams({ keywords: keywords || '', perPage: PER_PAGE, pageNumber: pg });
      const res = await fetch(`${API}/apis/v1/shares?${params}`, {
        headers: { Authorization: `Bearer ${useToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.list || []);
      setTotal(data.total || data.count || 0);
      setPage(pg);
      setSearchStatus(null);
    } catch (err) {
      setSearchStatus(err.message);
    }
  }

  async function handleImport(fixture) {
    const key = fixture.fixtureid || fixture.id;
    setImporting(key);
    try {
      // Try latest revision first
      const revId = fixture.revisions?.[fixture.revisions.length - 1]?.revisionid;
      const url = revId
        ? `${API}/apis/v1/shares/${key}/download?revisionId=${revId}`
        : `${API}/apis/v1/shares/${key}/download`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const name = `${fixture.manufacturername || ''} ${fixture.fixturename || fixture.name || 'Unknown'}.gdtf`.trim();
      const ft = await parseGdtf(buf, name);
      onImportGdtf(ft);
      alert(`Imported: ${ft.name}`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div style={sty.overlay}>
      <div style={sty.panel}>
        {/* Header */}
        <div style={sty.header}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4a90d9' }}>GDTF Share Browser</div>
            <div style={{ fontSize: 10, color: '#718096', marginTop: 2 }}>gdtf-share.com — community fixture library</div>
          </div>
          <button style={sty.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Login */}
        <div style={sty.section}>
          <div style={sty.sectionTitle}>Login</div>
          {loginStatus === 'ok' ? (
            <div style={{ color: '#68d391', fontSize: 12, padding: '6px 0' }}>✓ Logged in</div>
          ) : (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={sty.inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input style={sty.inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
              <button style={sty.btn} type="submit" disabled={loginStatus === 'loading'}>
                {loginStatus === 'loading' ? 'Logging in…' : 'Login'}
              </button>
              {loginStatus && loginStatus !== 'loading' && loginStatus !== 'ok' && (
                <div style={{ color: '#fc8181', fontSize: 11 }}>{loginStatus}</div>
              )}
            </form>
          )}
        </div>

        {/* Search */}
        <div style={sty.section}>
          <div style={sty.sectionTitle}>Search Fixtures</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ ...sty.inp, flex: 1 }}
              placeholder="Manufacturer, model…"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(1)}
            />
            <button style={sty.btn} onClick={() => doSearch(1)} disabled={searchStatus === 'loading'}>
              {searchStatus === 'loading' ? '…' : '🔍'}
            </button>
          </div>
          {searchStatus && searchStatus !== 'loading' && (
            <div style={{ color: '#fc8181', fontSize: 11, marginBottom: 6 }}>{searchStatus}</div>
          )}
        </div>

        {/* Results */}
        <div style={sty.results}>
          {results === null && (
            <div style={sty.empty}>Login and search to browse GDTF Share fixtures</div>
          )}
          {results?.length === 0 && (
            <div style={sty.empty}>No fixtures found</div>
          )}
          {results?.map(f => {
            const key = f.fixtureid || f.id;
            const revCount = f.revisions?.length || 1;
            return (
              <div key={key} style={sty.row}>
                <div style={sty.rowInfo}>
                  <div style={sty.rowName}>{f.manufacturername || f.manufacturer || ''} {f.fixturename || f.name}</div>
                  <div style={sty.rowMeta}>{revCount} revision{revCount !== 1 ? 's' : ''}</div>
                </div>
                <button
                  style={{ ...sty.btn, padding: '4px 10px', flexShrink: 0 }}
                  onClick={() => handleImport(f)}
                  disabled={importing === key}
                >
                  {importing === key ? '…' : 'Import'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {total > PER_PAGE && results?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid #0f3460', fontSize: 11, color: '#a0aec0' }}>
            <button style={{ ...sty.btn, padding: '3px 10px' }} disabled={page <= 1} onClick={() => doSearch(page - 1)}>‹ Prev</button>
            <span>Page {page} of {Math.ceil(total / PER_PAGE)} ({total} total)</span>
            <button style={{ ...sty.btn, padding: '3px 10px' }} disabled={page >= Math.ceil(total / PER_PAGE)} onClick={() => doSearch(page + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}

const sty = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 },
  panel: { background: '#16213e', border: '1px solid #0f3460', borderRadius: 6, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.8)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 },
  section: { padding: '10px 14px', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  sectionTitle: { fontSize: 9, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 },
  inp: { background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '5px 8px', outline: 'none' },
  btn: { background: '#0f3460', border: '1px solid #1a4a7a', borderRadius: 4, color: '#a0aec0', cursor: 'pointer', fontSize: 12, padding: '5px 12px' },
  results: { flex: 1, overflowY: 'auto', padding: '6px 0' },
  empty: { color: '#4a5568', fontSize: 12, textAlign: 'center', padding: 24 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #0f3460' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 12, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 10, color: '#718096', marginTop: 2 },
};
