import React, { useState, useMemo, useRef, useEffect } from 'react';
import ModalA11y from './ModalA11y';
import Icon from './Icon';

// Ctrl+K / Ctrl+Shift+P command palette.
// commands: [{ id, label, group, shortcut?, icon?, keywords?, disabled?, locked?, run() }]
// Recently-run commands float to the top when the query is empty.
const RECENT_KEY = 'lplot-palette-recent';
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
function saveRecent(ids) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 8))); } catch {} }

// Subsequence match with a bonus for word starts / contiguous runs.
function score(q, text) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 || t[direct - 1] === ' ' ? 200 : 0);
  let s = 0, ti = 0, run = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return 0;
    run = i === ti ? run + 1 : 0;
    s += 10 + run * 5 + (i === 0 || t[i - 1] === ' ' ? 15 : 0);
    ti = i + 1;
  }
  return s;
}

export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  const recent = useMemo(loadRecent, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const avail = commands.filter(c => !c.disabled);
    if (!q) {
      const rec = recent.map(id => avail.find(c => c.id === id)).filter(Boolean).map(c => ({ ...c, group: 'Recent' }));
      const recIds = new Set(rec.map(c => c.id));
      return [...rec, ...avail.filter(c => !recIds.has(c.id))];
    }
    return avail
      .map(c => ({ c, s: Math.max(score(q, c.label), score(q, `${c.group} ${c.label} ${c.keywords || ''}`) * 0.6) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.c);
  }, [query, commands, recent]);

  useEffect(() => { setIdx(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  function run(cmd) {
    if (!cmd) return;
    saveRecent([cmd.id, ...recent.filter(id => id !== cmd.id)]);
    onClose();
    // Let the palette unmount (and focus return) before the command opens its own UI.
    setTimeout(() => cmd.run(), 0);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 8)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[idx]); }
  }

  let lastGroup = null;
  return (
    <div style={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalA11y onClose={onClose} label="Command palette">
        <div style={styles.box}>
          <div style={styles.inputRow}>
            <Icon name="search" size={16} style={{ color: 'var(--text-dim)' }} />
            <input data-autofocus style={styles.input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Type a command — tools, panels, reports, view…" spellCheck={false}
              role="combobox" aria-expanded="true" aria-controls="cmdp-list"
              aria-activedescendant={results[idx] ? `cmdp-${results[idx].id}` : undefined} />
            <kbd style={styles.kbd}>Esc</kbd>
          </div>
          <div ref={listRef} id="cmdp-list" role="listbox" style={styles.list}>
            {results.length === 0 && <div style={styles.empty}>No matching commands</div>}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <React.Fragment key={`${c.group}-${c.id}`}>
                  {header && <div style={styles.group}>{header}</div>}
                  <div id={`cmdp-${c.id}`} role="option" aria-selected={i === idx} data-idx={i}
                    style={{ ...styles.item, ...(i === idx ? styles.itemActive : {}) }}
                    onMouseMove={() => i !== idx && setIdx(i)} onClick={() => run(c)}>
                    <span style={styles.iconCell}>{c.icon ? <Icon name={c.icon} size={15} /> : null}</span>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {c.locked && <Icon name="lock" size={12} style={{ color: 'var(--text-faint)' }} title="Not in your license" />}
                    {c.shortcut && <kbd style={styles.kbd}>{c.shortcut}</kbd>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div style={styles.footer}>
            <span><kbd style={styles.kbd}>↑</kbd><kbd style={styles.kbd}>↓</kbd> navigate</span>
            <span><kbd style={styles.kbd}>Enter</kbd> run</span>
            <span style={{ marginLeft: 'auto' }}>{results.length} command{results.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </ModalA11y>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3500, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' },
  box: { width: 560, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', borderRadius: 10, boxShadow: '0 18px 60px var(--shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 15, padding: '4px 0' },
  list: { maxHeight: '52vh', overflowY: 'auto', padding: '4px 0' },
  group: { padding: '8px 14px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  item: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' },
  itemActive: { background: 'var(--border)', color: 'var(--text)' },
  iconCell: { width: 16, display: 'inline-flex', color: 'var(--accent)' },
  empty: { padding: '18px 14px', fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' },
  kbd: { fontFamily: 'inherit', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', marginLeft: 3 },
  footer: { display: 'flex', gap: 14, padding: '6px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' },
};
