import React, { useState, useEffect } from 'react';
import {
  fetchDatabase, writeDatabase,
  addLicense, revokeLicense, updateLicense, deleteLicense, invalidateCache,
  addRightsGroup, updateRightsGroup, deleteRightsGroup,
} from '../license/licenseService';
import { FEATURES } from '../license/features';

const { ipcRenderer } = require('electron');

export default function LicenseManager({ onClose }) {
  const [db, setDb]           = useState(null);
  const [token, setToken]     = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [errMsg, setErrMsg]   = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [newLicenseKey, setNewLicenseKey] = useState(null);
  const [tab, setTab]         = useState('list');

  // per-tab form state
  const [addForm, setAddForm] = useState({
    name: '', email: '', rights: [], expiresAt: oneYearFromNow(), notes: '',
  });
  const [editingLicense, setEditingLicense] = useState(null); // license key being edited
  const [editForm, setEditForm] = useState({});

  const [editingGroup, setEditingGroup]   = useState(null); // group id being edited
  const [editGroupForm, setEditGroupForm] = useState({ name: '', features: [] });
  const [addGroupForm, setAddGroupForm]   = useState({ id: '', name: '', features: [] });
  const [showAddGroup, setShowAddGroup]   = useState(false);

  useEffect(() => { loadToken(); loadDb(); }, []);

  async function loadToken() {
    const t = await ipcRenderer.invoke('license-load-token');
    if (t) { setToken(t); setTokenSaved(true); }
  }

  async function loadDb() {
    setBusy(true); setErrMsg('');
    try { invalidateCache(); setDb(await fetchDatabase()); }
    catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  async function saveToken() {
    if (!token.trim()) return;
    await ipcRenderer.invoke('license-save-token', { token: token.trim() });
    setTokenSaved(true); flash('GitHub token saved (encrypted).');
  }

  // ── License: add ──────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const { newDb, newKey } = await addLicense(db, addForm);
      await writeDatabase(newDb, token);
      setDb(newDb);
      setNewLicenseKey(newKey);
      setAddForm({ name: '', email: '', rights: [], expiresAt: oneYearFromNow(), notes: '' });
      flash('License created.');
      setTab('list');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  // ── License: start editing ────────────────────────────────────────────────
  function startEditLicense(l) {
    setEditingLicense(l.key);
    setEditForm({
      name:      l.name,
      email:     l.email,
      rights:    Array.isArray(l.rights) ? [...l.rights] : (l.rights ? [l.rights] : []),
      expiresAt: l.expiresAt,
      notes:     l.notes || '',
    });
  }

  async function saveEditLicense() {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const newDb = updateLicense(db, editingLicense, editForm);
      await writeDatabase(newDb, token);
      setDb(newDb);
      setEditingLicense(null);
      flash('License updated.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  // ── License: revoke / delete ──────────────────────────────────────────────
  async function handleRevoke(key, name) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    if (!confirm(`Revoke license for "${name}"?`)) return;
    setBusy(true); setErrMsg('');
    try {
      const newDb = revokeLicense(db, key);
      await writeDatabase(newDb, token);
      setDb(newDb); flash('License revoked.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  async function handleReactivate(key) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const newDb = updateLicense(db, key, { active: true });
      await writeDatabase(newDb, token);
      setDb(newDb); flash('License reactivated.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  async function handleDeleteLicense(key, name) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    if (!confirm(`Permanently delete license for "${name}"? This cannot be undone.`)) return;
    setBusy(true); setErrMsg('');
    try {
      const newDb = deleteLicense(db, key);
      await writeDatabase(newDb, token);
      setDb(newDb); flash('License deleted.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  // ── Rights groups ─────────────────────────────────────────────────────────
  function startEditGroup(g) {
    setEditingGroup(g.id);
    setEditGroupForm({ name: g.name, features: [...(g.features || [])] });
  }

  async function saveEditGroup() {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    setBusy(true); setErrMsg('');
    try {
      const newDb = updateRightsGroup(db, editingGroup, editGroupForm);
      await writeDatabase(newDb, token);
      setDb(newDb); setEditingGroup(null); flash('Group updated.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  async function handleAddGroup(e) {
    e.preventDefault();
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    if (!addGroupForm.id.trim() || !addGroupForm.name.trim()) {
      setErrMsg('Group ID and name are required.'); return;
    }
    setBusy(true); setErrMsg('');
    try {
      const newDb = addRightsGroup(db, {
        id: addGroupForm.id.toLowerCase().replace(/\s+/g, '_'),
        name: addGroupForm.name,
        features: addGroupForm.features,
      });
      await writeDatabase(newDb, token);
      setDb(newDb);
      setAddGroupForm({ id: '', name: '', features: [] });
      setShowAddGroup(false);
      flash('Group created.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  async function handleDeleteGroup(id, name) {
    if (!token) { setErrMsg('Save a GitHub token first (Token tab).'); return; }
    const usedBy = (db.licenses || []).filter(l => (Array.isArray(l.rights) ? l.rights : [l.rights]).includes(id));
    const warn = usedBy.length
      ? `\n\nWarning: ${usedBy.length} license(s) use this group — they will lose its features.`
      : '';
    if (!confirm(`Delete group "${name}"?${warn}`)) return;
    setBusy(true); setErrMsg('');
    try {
      const newDb = deleteRightsGroup(db, id);
      await writeDatabase(newDb, token);
      setDb(newDb); flash('Group deleted.');
    } catch (e) { setErrMsg(e.message); }
    finally { setBusy(false); }
  }

  function flash(msg) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); }

  const licenses = db?.licenses || [];
  const groups   = db?.rightsGroups || [];

  const groupsById = Object.fromEntries(groups.map(g => [g.id, g]));

  function rightsLabel(rights) {
    const arr = Array.isArray(rights) ? rights : (rights ? [rights] : []);
    return arr.map(id => groupsById[id]?.name || id).join(', ') || '—';
  }

  // Feature checkboxes used in both Add Group and Edit Group
  function FeatureChecklist({ value, onChange }) {
    const byGroup = {};
    for (const f of FEATURES) {
      if (!byGroup[f.group]) byGroup[f.group] = [];
      byGroup[f.group].push(f);
    }
    return (
      <div style={{ columns: 2, columnGap: 16 }}>
        {Object.entries(byGroup).map(([grp, feats]) => (
          <div key={grp} style={{ breakInside: 'avoid', marginBottom: 10 }}>
            <div style={{ color: '#718096', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{grp}</div>
            {feats.map(f => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={value.includes(f.id)}
                  onChange={e => onChange(e.target.checked
                    ? [...value, f.id]
                    : value.filter(x => x !== f.id))}
                  style={{ accentColor: '#4a90d9' }} />
                <span style={{ color: '#c0c8d8', fontSize: 12 }}>{f.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Rights multi-select (groups list with checkboxes)
  function RightsSelector({ value, onChange }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {groups.map(g => {
          const on = value.includes(g.id);
          return (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              background: on ? '#2a4a6a' : '#0d1b2a', border: `1px solid ${on ? '#4a90d9' : '#1a3a5c'}`,
              borderRadius: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={on}
                onChange={e => onChange(e.target.checked ? [...value, g.id] : value.filter(x => x !== g.id))}
                style={{ accentColor: '#4a90d9' }} />
              <span style={{ color: on ? '#e0e0e0' : '#718096', fontSize: 12 }}>{g.name}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>🔑 License Manager</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {[['list', `Licenses (${licenses.length})`], ['add', '+ New License'], ['groups', `Rights Groups (${groups.length})`], ['token', '⚙ Token']].map(([id, label]) => (
            <button key={id} style={{ ...S.tab, ...(tab === id ? S.tabActive : {}) }}
              onClick={() => { setTab(id); setErrMsg(''); setEditingLicense(null); setEditingGroup(null); }}>
              {label}
            </button>
          ))}
          <button style={{ ...S.tab, marginLeft: 'auto' }} onClick={loadDb} disabled={busy}>↻</button>
        </div>

        {errMsg    && <div style={S.errBox}>{errMsg}</div>}
        {successMsg && <div style={S.okBox}>{successMsg}</div>}

        {newLicenseKey && (
          <div style={S.keyBanner}>
            <span style={{ color: '#68d391', fontWeight: 700 }}>New key — copy now, won't be shown again:</span>
            <div style={S.keyDisplay}>{newLicenseKey}</div>
            <button style={S.copyBtn} onClick={() => { navigator.clipboard.writeText(newLicenseKey); flash('Copied!'); }}>Copy</button>
            <button style={{ ...S.copyBtn, background: 'none', border: '1px solid #2a4a6a', marginLeft: 8 }}
              onClick={() => setNewLicenseKey(null)}>Dismiss</button>
          </div>
        )}

        <div style={S.body}>

          {/* ── LIST TAB ─────────────────────────────────────────────────────── */}
          {tab === 'list' && (
            <table style={S.table}>
              <thead>
                <tr>{['Name / Key', 'Rights', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {licenses.length === 0 && (
                  <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#4a5568' }}>No licenses yet.</td></tr>
                )}
                {licenses.map(l => (
                  <React.Fragment key={l.key}>
                    <tr style={l.active ? {} : { opacity: 0.45 }}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{l.name}</div>
                        <div style={{ fontSize: 10, color: '#4a6a8a', fontFamily: 'monospace' }}>{l.key}</div>
                        {l.email && <div style={{ fontSize: 10, color: '#718096' }}>{l.email}</div>}
                      </td>
                      <td style={S.td}><span style={{ color: '#a0c4e8', fontSize: 12 }}>{rightsLabel(l.rights)}</span></td>
                      <td style={S.td} nowrap="true">{l.expiresAt}</td>
                      <td style={S.td}>
                        {!l.active ? <span style={{ color: '#fc8181' }}>Revoked</span>
                          : new Date(l.expiresAt) < new Date() ? <span style={{ color: '#f6ad55' }}>Expired</span>
                          : <span style={{ color: '#68d391' }}>Active</span>}
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                        <button style={S.iconBtn} title="Edit" onClick={() => editingLicense === l.key ? setEditingLicense(null) : startEditLicense(l)}>✎</button>
                        {l.active
                          ? <button style={{ ...S.iconBtn, color: '#f6ad55' }} title="Revoke" onClick={() => handleRevoke(l.key, l.name)} disabled={busy}>⊘</button>
                          : <button style={{ ...S.iconBtn, color: '#68d391' }} title="Reactivate" onClick={() => handleReactivate(l.key)} disabled={busy}>↺</button>
                        }
                        <button style={{ ...S.iconBtn, color: '#fc8181' }} title="Delete" onClick={() => handleDeleteLicense(l.key, l.name)} disabled={busy}>✕</button>
                      </td>
                    </tr>
                    {editingLicense === l.key && (
                      <tr>
                        <td colSpan={5} style={{ ...S.td, background: '#0d1b2a', padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <LabelField label="Name">
                              <input style={S.inp} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </LabelField>
                            <LabelField label="Email">
                              <input style={S.inp} type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                            </LabelField>
                            <LabelField label="Expires">
                              <input style={S.inp} type="date" value={editForm.expiresAt} onChange={e => setEditForm(f => ({ ...f, expiresAt: e.target.value }))} />
                            </LabelField>
                            <LabelField label="Notes">
                              <input style={S.inp} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                            </LabelField>
                          </div>
                          <LabelField label="Rights groups">
                            <RightsSelector value={editForm.rights} onChange={v => setEditForm(f => ({ ...f, rights: v }))} />
                          </LabelField>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button style={{ ...S.btn, padding: '7px 18px', background: '#4a90d9' }} onClick={saveEditLicense} disabled={busy}>Save</button>
                            <button style={{ ...S.btn, padding: '7px 18px', background: 'none', border: '1px solid #1a3a5c', color: '#718096' }} onClick={() => setEditingLicense(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          {/* ── ADD TAB ──────────────────────────────────────────────────────── */}
          {tab === 'add' && (
            <form onSubmit={handleAdd} style={S.form}>
              <LabelField label="Name *">
                <input style={S.inp} value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
              </LabelField>
              <LabelField label="Email">
                <input style={S.inp} type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
              </LabelField>
              <LabelField label="Expires">
                <input style={S.inp} type="date" value={addForm.expiresAt} onChange={e => setAddForm(f => ({ ...f, expiresAt: e.target.value }))} required />
              </LabelField>
              <LabelField label="Notes">
                <input style={S.inp} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
              </LabelField>
              <LabelField label="Rights groups">
                <RightsSelector value={addForm.rights} onChange={v => setAddForm(f => ({ ...f, rights: v }))} />
              </LabelField>
              <button style={{ ...S.btn, marginTop: 16, padding: '10px 24px', background: '#4a90d9' }}
                type="submit" disabled={busy || !token}>
                {busy ? 'Creating…' : 'Create License'}
              </button>
              {!token && <div style={{ color: '#f6ad55', fontSize: 11, marginTop: 8 }}>⚠ Add a GitHub token first (Token tab).</div>}
            </form>
          )}

          {/* ── GROUPS TAB ───────────────────────────────────────────────────── */}
          {tab === 'groups' && (
            <div>
              {groups.map(g => (
                <div key={g.id} style={S.groupCard}>
                  {editingGroup === g.id ? (
                    <>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#4a6a8a', flex: 'none' }}>{g.id}</span>
                        <input style={{ ...S.inp, flex: 1 }} value={editGroupForm.name}
                          onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Display name" />
                      </div>
                      <FeatureChecklist value={editGroupForm.features}
                        onChange={v => setEditGroupForm(f => ({ ...f, features: v }))} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button style={{ ...S.btn, padding: '6px 16px', background: '#4a90d9' }} onClick={saveEditGroup} disabled={busy}>Save</button>
                        <button style={{ ...S.btn, padding: '6px 16px', background: 'none', border: '1px solid #1a3a5c', color: '#718096' }} onClick={() => setEditingGroup(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, color: '#e0e0e0', fontSize: 14 }}>{g.name}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#4a6a8a' }}>{g.id}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(g.features || []).map(fid => {
                            const feat = FEATURES.find(f => f.id === fid);
                            return (
                              <span key={fid} style={{ background: '#0d1b2a', border: '1px solid #1a3a5c', borderRadius: 3, padding: '2px 7px', fontSize: 10, color: '#a0c4e8' }}>
                                {feat?.label || fid}
                              </span>
                            );
                          })}
                          {(g.features || []).length === 0 && <span style={{ color: '#4a5568', fontSize: 12 }}>No features</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={S.iconBtn} title="Edit group" onClick={() => startEditGroup(g)}>✎</button>
                        <button style={{ ...S.iconBtn, color: '#fc8181' }} title="Delete group" onClick={() => handleDeleteGroup(g.id, g.name)} disabled={busy}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new group */}
              {showAddGroup ? (
                <form onSubmit={handleAddGroup} style={{ ...S.groupCard, background: '#0a1525', marginTop: 12 }}>
                  <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>New Group</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <LabelField label="ID (slug)">
                      <input style={S.inp} value={addGroupForm.id} placeholder="e.g. premium"
                        onChange={e => setAddGroupForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/\s+/g,'_') }))} required />
                    </LabelField>
                    <LabelField label="Display name">
                      <input style={S.inp} value={addGroupForm.name} placeholder="e.g. Premium"
                        onChange={e => setAddGroupForm(f => ({ ...f, name: e.target.value }))} required />
                    </LabelField>
                  </div>
                  <LabelField label="Features">
                    <FeatureChecklist value={addGroupForm.features}
                      onChange={v => setAddGroupForm(f => ({ ...f, features: v }))} />
                  </LabelField>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="submit" style={{ ...S.btn, padding: '7px 18px', background: '#4a90d9' }} disabled={busy || !token}>Create Group</button>
                    <button type="button" style={{ ...S.btn, padding: '7px 18px', background: 'none', border: '1px solid #1a3a5c', color: '#718096' }} onClick={() => setShowAddGroup(false)}>Cancel</button>
                  </div>
                  {!token && <div style={{ color: '#f6ad55', fontSize: 11, marginTop: 8 }}>⚠ Add a GitHub token first (Token tab).</div>}
                </form>
              ) : (
                <button style={{ ...S.btn, marginTop: 12, padding: '8px 18px', background: '#1a3a5c', border: '1px solid #2a5a8a', color: '#a0c4e8' }}
                  onClick={() => setShowAddGroup(true)}>+ Add Rights Group</button>
              )}
            </div>
          )}

          {/* ── TOKEN TAB ────────────────────────────────────────────────────── */}
          {tab === 'token' && (
            <div style={S.form}>
              <p style={{ color: '#a0aec0', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                A GitHub Personal Access Token with <strong style={{ color: '#e0e0e0' }}>repo</strong> scope
                is required to create, edit, or delete licenses and rights groups.
                The token is stored encrypted on this machine and never transmitted except directly to GitHub.
              </p>
              <LabelField label="GitHub PAT">
                <input style={S.inp} type="password" value={token}
                  onChange={e => { setToken(e.target.value); setTokenSaved(false); }}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
              </LabelField>
              <button style={{ ...S.btn, marginTop: 12, padding: '9px 20px', background: '#4a90d9' }}
                onClick={saveToken} disabled={!token.trim()}>
                {tokenSaved ? '✓ Saved' : 'Save Token'}
              </button>
              <p style={{ color: '#4a5568', fontSize: 11, marginTop: 16 }}>
                Encrypted using the OS keychain (Windows DPAPI / macOS Keychain).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelField({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#718096', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function oneYearFromNow() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const S = {
  overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  panel:    { background: '#16213e', border: '1px solid #0f3460', borderRadius: 8, width: '92vw', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' },
  header:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  title:    { fontSize: 16, fontWeight: 700, color: '#e0e0e0' },
  closeBtn: { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 18 },
  tabs:     { display: 'flex', borderBottom: '1px solid #0f3460', flexShrink: 0, padding: '0 16px' },
  tab:      { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', padding: '10px 14px', fontSize: 13 },
  tabActive:{ color: '#4a90d9', borderBottom: '2px solid #4a90d9' },
  errBox:   { margin: '8px 16px 0', padding: '8px 12px', background: 'rgba(252,129,129,0.12)', border: '1px solid #fc8181', borderRadius: 4, color: '#fc8181', fontSize: 12 },
  okBox:    { margin: '8px 16px 0', padding: '8px 12px', background: 'rgba(104,211,145,0.12)', border: '1px solid #68d391', borderRadius: 4, color: '#68d391', fontSize: 12 },
  body:     { flex: 1, overflow: 'auto', padding: 16 },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:       { textAlign: 'left', padding: '6px 10px', color: '#718096', borderBottom: '1px solid #0f3460', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' },
  td:       { padding: '8px 10px', borderBottom: '1px solid rgba(15,52,96,0.5)', color: '#e0e0e0', verticalAlign: 'middle' },
  form:     { maxWidth: 520, paddingTop: 8 },
  inp:      { width: '100%', background: '#0d1b2a', border: '1px solid #1a3a5c', borderRadius: 4, color: '#e0e0e0', fontSize: 13, padding: '7px 10px', boxSizing: 'border-box' },
  btn:      { padding: '5px 12px', background: '#2a4a6a', border: 'none', borderRadius: 4, color: '#c0d8f0', fontSize: 12, cursor: 'pointer' },
  iconBtn:  { background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 15, padding: '2px 5px' },
  groupCard:{ background: '#0f1e35', border: '1px solid #0f3460', borderRadius: 6, padding: 14, marginBottom: 10 },
  keyBanner:{ margin: '8px 16px', padding: 14, background: 'rgba(104,211,145,0.08)', border: '1px solid #68d391', borderRadius: 6 },
  keyDisplay:{ fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.15em', color: '#68d391', margin: '10px 0', fontWeight: 700 },
  copyBtn:  { padding: '6px 14px', background: '#276749', border: 'none', borderRadius: 4, color: '#c6f6d5', fontSize: 12, cursor: 'pointer' },
};
