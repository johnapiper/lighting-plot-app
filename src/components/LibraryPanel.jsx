import React, { useRef, useState } from 'react';
import { FixturePreview } from '../fixtures/FixtureSymbol';
import { parseGdtf } from '../library/GdtfImporter';
import FixturePropertiesModal from './FixturePropertiesModal';
import { useToolHints } from './ToolHint';

export default function LibraryPanel({
  builtinFixtures, customFixtures, pendingFixture,
  onSelectFixture, onImportGdtf, onDeleteCustomFixture,
  onRenameFixture, onUpdateFixture, onOpenGdtfBrowser,
  canEdit = true,
}) {
  const fileRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [propertiesFixture, setPropertiesFixture] = useState(null);
  const [search, setSearch] = useState('');

  const allFixtures = [...builtinFixtures, ...customFixtures];
  const searchLow = search.toLowerCase();
  const filtered = search
    ? allFixtures.filter(f => f.name?.toLowerCase().includes(searchLow) || f.category?.toLowerCase().includes(searchLow))
    : allFixtures;
  const categories = [...new Set(filtered.map(f => f.category))];
  const isCustom = (f) => f.source === 'gdtf' || customFixtures.some(c => c.id === f.id);

  async function handleFileChange(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const ft = await parseGdtf(buf, file.name);
        onImportGdtf(ft);
      } catch (err) {
        alert(`Failed to import ${file.name}:\n${err.message}`);
      }
    }
    e.target.value = '';
  }

  function openCtx(e, f) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, fixture: f });
  }

  function closeCtx() { setCtxMenu(null); }

  function handleDuplicate(f) {
    const copy = {
      ...JSON.parse(JSON.stringify(f)),
      id: 'custom-' + Math.random().toString(36).slice(2, 8),
      name: 'Copy of ' + f.name,
      source: 'gdtf',
    };
    onImportGdtf(copy);
    closeCtx();
  }

  function startRename(f) {
    setRenamingId(f.id);
    setRenameVal(f.name);
    closeCtx();
  }

  function commitRename(f) {
    if (renameVal.trim() && onRenameFixture) onRenameFixture(f.id, renameVal.trim());
    setRenamingId(null);
  }

  function handleDelete(f) {
    onDeleteCustomFixture(f.id);
    closeCtx();
  }

  function openProperties(f) {
    setPropertiesFixture(f);
    closeCtx();
  }

  return (
    <div style={styles.panel} onClick={closeCtx}>
      <div style={styles.header}>Fixture Library</div>

      {canEdit && (
        <button style={styles.importBtn} onClick={() => fileRef.current.click()}>
          + Import GDTF
        </button>
      )}
      {onOpenGdtfBrowser && (
        <button style={{ ...styles.importBtn, background: '#0f2a4a', borderColor: '#2a6090', marginTop: 0 }}
          onClick={onOpenGdtfBrowser}>
          🌐 GDTF Share…
        </button>
      )}
      <input ref={fileRef} type="file" accept=".gdtf" multiple style={{ display: 'none' }} onChange={handleFileChange} />

      <div style={{ padding: '4px 8px', position: 'relative' }}>
        <input
          style={styles.searchInput}
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button style={styles.searchClear} onClick={() => setSearch('')}>✕</button>
        )}
      </div>
      {search && (
        <div style={{ padding: '2px 10px 4px', fontSize: 9, color: '#718096' }}>
          {filtered.length} fixture{filtered.length !== 1 ? 's' : ''}
        </div>
      )}

      {pendingFixture && (
        <div style={styles.hint}>Click canvas to place<br /><strong>{pendingFixture.name}</strong></div>
      )}

      {categories.map(cat => (
        <div key={cat}>
          <div style={styles.category}>{cat}</div>
          {filtered.filter(f => f.category === cat).map(f => (
            <div key={f.id} style={styles.itemWrap}>
              {renamingId === f.id ? (
                <div style={{ flex: 1, padding: '4px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input autoFocus
                    style={{ flex: 1, background: '#0d1b2a', border: '1px solid #4a90d9', borderRadius: 3, color: '#e0e0e0', fontSize: 11, padding: '2px 5px', outline: 'none' }}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => commitRename(f)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(f);
                      if (e.key === 'Escape') setRenamingId(null);
                      e.stopPropagation();
                    }}
                  />
                  <button style={{ ...styles.deleteBtn, color: '#68d391' }} onClick={() => commitRename(f)}>✓</button>
                  <button style={styles.deleteBtn} onClick={() => setRenamingId(null)}>✕</button>
                </div>
              ) : (
                <button
                  style={{ ...styles.item, ...(pendingFixture?.id === f.id ? styles.itemActive : {}) }}
                  onClick={() => onSelectFixture(f)}
                  onContextMenu={e => openCtx(e, f)}
                  title={`${f.name}\nRight-click for options`}
                >
                  <FixturePreview fixtureType={f} />
                  <span style={styles.itemName}>{f.name}</span>
                  {isCustom(f) && <span style={styles.gdtfBadge}>GDTF</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Fixture Properties Modal */}
      {propertiesFixture && (
        <FixturePropertiesModal
          fixture={propertiesFixture}
          onSave={updated => { if (onUpdateFixture) onUpdateFixture(updated); }}
          onClose={() => setPropertiesFixture(null)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
            background: '#16213e', border: '1px solid #0f3460',
            borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
            zIndex: 999, minWidth: 160,
          }}
          onMouseLeave={closeCtx}
        >
          <div style={ctxItem} onClick={() => openProperties(ctxMenu.fixture)}>
            ⚙️ Properties…
          </div>
          <div style={{ ...ctxItem, borderTop: '1px solid #0f3460' }} onClick={() => handleDuplicate(ctxMenu.fixture)}>
            📋 Duplicate
          </div>
          {isCustom(ctxMenu.fixture) && (
            <div style={ctxItem} onClick={() => startRename(ctxMenu.fixture)}>
              ✏️ Rename…
            </div>
          )}
          {isCustom(ctxMenu.fixture) && (
            <div style={{ ...ctxItem, borderTop: '1px solid #0f3460', color: '#fc8181' }}
              onClick={() => handleDelete(ctxMenu.fixture)}>
              🗑 Delete
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ctxItem = {
  padding: '9px 14px', cursor: 'pointer', fontSize: 13,
  color: '#e0e0e0', transition: 'background 0.1s',
};

const styles = {
  panel: {
    width: 150, background: '#16213e', borderRight: '1px solid #0f3460',
    display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0,
    position: 'relative',
  },
  header: {
    padding: '8px 10px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#4a90d9', borderBottom: '1px solid #0f3460',
  },
  importBtn: {
    margin: 8, padding: '5px 8px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 11, fontWeight: 600,
  },
  hint: {
    padding: '6px 8px', background: '#0f3460', color: '#00aaff',
    fontSize: 10, textAlign: 'center', lineHeight: 1.4,
  },
  category: {
    padding: '6px 10px 2px', fontSize: 9, color: '#718096',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  itemWrap: {
    position: 'relative', display: 'flex', alignItems: 'stretch',
    borderBottom: '1px solid #0f3460',
  },
  item: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
    padding: '6px 8px', background: 'transparent', border: 'none',
    color: '#e0e0e0', cursor: 'pointer', textAlign: 'center',
  },
  itemActive: { background: '#0f3460', color: '#00aaff' },
  itemName: { fontSize: 9, marginTop: 3, lineHeight: 1.2, wordBreak: 'break-word' },
  gdtfBadge: {
    fontSize: 8, background: '#1a3a5c', color: '#4a90d9',
    borderRadius: 2, padding: '1px 3px', marginTop: 2,
  },
  deleteBtn: {
    background: 'transparent', border: 'none', color: '#4a5568',
    cursor: 'pointer', fontSize: 11, padding: '0 3px',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 4,
    color: '#e0e0e0', fontSize: 11, padding: '4px 22px 4px 7px', outline: 'none',
  },
  searchClear: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 11, padding: 0,
  },
};
