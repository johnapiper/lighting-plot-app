import React, { useState, useEffect, useRef } from 'react';

function Field({ label, value, onChange, readOnly, type = 'text', placeholder, title, children }) {
  return (
    <div style={styles.field} title={title}>
      <label style={styles.label}>{label}</label>
      {children || (
        <input
          style={{ ...styles.input, ...(readOnly ? styles.readOnly : {}) }}
          value={value ?? ''} type={type} placeholder={placeholder}
          onChange={e => onChange && onChange(e.target.value)}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

// Numeric input that lets the user type freely and only parses / clamps on
// Enter or blur. Escape reverts. ↑/↓ (or the mouse wheel while focused) step
// the value; Shift ×10, Alt ×0.1. `value` null/undefined shows the
// placeholder (used for "Mixed" in multi-select).
function NumberField({ label, value, onCommit, min = -Infinity, max = Infinity, step = 1, decimals = 2, placeholder, title }) {
  const fmt = v => (v == null || v === '' || isNaN(v)) ? '' : String(Number(Number(v).toFixed(decimals)));
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (!focused) setDraft(fmt(value)); }, [value, focused]);

  const trimmed = draft.trim();
  const invalid = trimmed !== '' && !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(trimmed) && !/^[-+.]$/.test(trimmed);
  const outOfRange = !invalid && trimmed !== '' && isFinite(Number(trimmed)) && (Number(trimmed) < min || Number(trimmed) > max);
  const clamp = n => Math.max(min, Math.min(max, n));

  function commitDraft() {
    const n = Number(trimmed);
    if (trimmed === '' || !isFinite(n) || invalid) { setDraft(fmt(value)); return; } // revert
    const c = clamp(n);
    setDraft(fmt(c));
    if (c !== Number(value)) onCommit(c);
  }
  function stepBy(dir, e) {
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const base = isFinite(Number(trimmed)) && trimmed !== '' ? Number(trimmed) : (Number(value) || 0);
    const c = clamp(Number((base + dir * step * mult).toFixed(decimals)));
    setDraft(fmt(c));
    onCommit(c);
  }
  // Wheel needs a non-passive listener to be able to preventDefault.
  useEffect(() => {
    const el = inputRef.current; if (!el) return;
    const onWheel = (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      stepBy(e.deltaY < 0 ? 1 : -1, e);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  return (
    <div style={styles.field} title={title}>
      <label style={styles.label}>{label}</label>
      <input
        ref={inputRef}
        style={{ ...styles.input, ...(invalid || outOfRange ? styles.inputError : {}) }}
        value={draft} inputMode="decimal" placeholder={placeholder}
        onFocus={e => { setFocused(true); e.target.select(); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setFocused(false); commitDraft(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commitDraft(); e.target.blur(); }
          else if (e.key === 'Escape') { setDraft(fmt(value)); setFocused(false); e.target.blur(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1, e); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1, e); }
          e.stopPropagation();
        }}
      />
      {invalid && <div style={styles.errText}>Enter a number</div>}
      {outOfRange && <div style={styles.errText}>Will be clamped to {min}–{max}</div>}
    </div>
  );
}

function parseDmx(str) {
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 2) return null;
  const u = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
  if (isNaN(u) || isNaN(c)) return null;
  return { universe: u, channel: c };
}

function validateDmx(raw) {
  if (!raw) return null;
  const parsed = parseDmx(raw);
  if (!parsed) return 'Use Universe/Channel, e.g. 1/1';
  if (parsed.universe < 1) return 'Universe must be 1 or more';
  if (parsed.channel < 1 || parsed.channel > 512) return 'Channel must be 1–512';
  return null;
}

// DMX address: edited as a local draft, validated inline, committed on
// Enter / blur only when valid. Escape reverts.
function DmxField({ value, onChange, placeholder = 'e.g. 1/1' }) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!focused) { setDraft(value ?? ''); setTouched(false); } }, [value, focused]);
  const error = touched ? validateDmx(draft.trim()) : null;

  function commitDraft() {
    const raw = draft.trim();
    setTouched(true);
    if (validateDmx(raw)) return false;
    const p = parseDmx(raw);
    const next = p ? `${p.universe}/${p.channel}` : '';
    if (next !== (value ?? '')) onChange(next);
    setTouched(false);
    return true;
  }
  return (
    <>
      <input style={{ ...styles.input, ...(error ? styles.inputError : {}) }} value={draft} placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setFocused(false); commitDraft(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { if (commitDraft()) e.target.blur(); }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setTouched(false); e.target.blur(); }
          e.stopPropagation();
        }} />
      {error && <div style={styles.errText}>{error} — not saved</div>}
    </>
  );
}

// Common value across items, or undefined when they differ ("Mixed").
function shared(items, key) {
  if (!items.length) return undefined;
  const first = items[0][key] ?? '';
  return items.every(i => (i[key] ?? '') === first) ? first : undefined;
}

const ALIGN_BUTTONS = [
  ['left', '⇤', 'Align left edges'], ['centerH', '↔', 'Align horizontal centres'], ['right', '⇥', 'Align right edges'],
  ['top', '⤒', 'Align top edges'], ['centerV', '↕', 'Align vertical centres'], ['bottom', '⤓', 'Align bottom edges'],
  ['distH', '⋯', 'Distribute horizontally (equal centre spacing)'], ['distV', '⋮', 'Distribute vertically (equal centre spacing)'],
];

function MultiSelectInspector({
  selectedCount, selectedFixtures = [], layers, groupInfo, onGroup, onUngroup,
  onBulkUpdate, onAlign, onPatchSequential, suggestStartAddress,
}) {
  const fx = selectedFixtures;
  const [startAddr, setStartAddr] = useState('');
  const [addrErr, setAddrErr] = useState(null);
  const mixedText = key => { const v = shared(fx, key); return v === undefined ? { value: '', placeholder: 'Mixed' } : { value: v, placeholder: '' }; };
  const rot = shared(fx, 'rotation');
  const layer = shared(fx, 'layerId');
  const hex = shared(fx, 'colourHex');

  return (
    <div style={styles.panel}>
      <div style={styles.header}>{selectedCount} selected{fx.length && fx.length !== selectedCount ? ` · ${fx.length} fixtures` : ''}</div>

      <div style={styles.section}>
        {groupInfo ? (
          <button style={styles.btnWide} onClick={onUngroup}>Ungroup ({groupInfo.memberCount} members) · Ctrl+G</button>
        ) : (
          <button style={styles.btnWide} onClick={onGroup}>Group · Ctrl+G</button>
        )}
      </div>

      {onAlign && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Align & distribute</div>
          <div style={styles.alignGrid}>
            {ALIGN_BUTTONS.map(([mode, icon, tip]) => (
              <button key={mode} style={styles.alignBtn} title={tip} onClick={() => onAlign(mode)}
                disabled={(mode === 'distH' || mode === 'distV') && selectedCount < 3}>{icon}</button>
            ))}
          </div>
        </div>
      )}

      {onBulkUpdate && fx.length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, padding: '8px 10px 2px' }}>Shared fixture properties</div>
          <Field label="Position" {...mixedText('position')} onChange={v => onBulkUpdate({ position: v })} />
          <Field label="Colour (gel)" {...mixedText('colour')} onChange={v => onBulkUpdate({ colour: v })} />
          <div style={styles.field}>
            <label style={styles.label}>Colour swatch</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={hex || '#ffffff'}
                style={{ width: 32, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: 'none' }}
                onChange={e => onBulkUpdate({ colourHex: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hex === undefined ? 'Mixed' : (hex || 'None')}</span>
            </div>
          </div>
          <Field label="Gobo" {...mixedText('gobo')} onChange={v => onBulkUpdate({ gobo: v })} />
          <Field label="Purpose" {...mixedText('purpose')} onChange={v => onBulkUpdate({ purpose: v })} />
          <NumberField label="Rotation°" value={rot === undefined ? null : (rot || 0)} placeholder="Mixed" step={15} decimals={1}
            onCommit={v => onBulkUpdate({ rotation: v })} />
          {layers?.length > 0 && (
            <div style={styles.field}>
              <label style={styles.label}>Layer</label>
              <select style={styles.input} value={layer === undefined ? '__mixed' : (layer || '')}
                onChange={e => { if (e.target.value !== '__mixed') onBulkUpdate({ layerId: e.target.value || null }); }}>
                {layer === undefined && <option value="__mixed">Mixed</option>}
                <option value="">— default —</option>
                {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          {onPatchSequential && (
            <div style={styles.field}>
              <label style={styles.label}>Patch sequentially</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input style={{ ...styles.input, flex: 1, ...(addrErr ? styles.inputError : {}) }}
                  value={startAddr} placeholder={`start e.g. ${suggestStartAddress?.() || '1/1'}`}
                  onFocus={() => { if (!startAddr && suggestStartAddress) setStartAddr(suggestStartAddress()); }}
                  onChange={e => { setStartAddr(e.target.value); setAddrErr(null); }}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.nextSibling?.click(); }} />
                <button style={{ ...styles.btn, marginTop: 0 }}
                  title="Assign consecutive DMX addresses (and channels) in plot order: top→bottom, left→right, stepping by each fixture's footprint"
                  onClick={() => {
                    const err = validateDmx(startAddr.trim()) || (!startAddr.trim() ? 'Enter a start address' : null);
                    if (err) { setAddrErr(err); return; }
                    onPatchSequential(startAddr.trim());
                  }}>Apply</button>
              </div>
              {addrErr
                ? <div style={styles.errText}>{addrErr}</div>
                : <div style={styles.hintText}>Order: top→bottom, left→right. Free start suggested.</div>}
            </div>
          )}
        </>
      )}
      <div style={{ ...styles.hintText, padding: '8px 10px' }}>Arrow keys nudge (Shift = grid, Alt = 1 mm) · Del removes</div>
    </div>
  );
}

function LayerField({ layerId, layers, onChange }) {
  if (!layers?.length) return null;
  return (
    <div style={styles.field}>
      <label style={styles.label}>Layer</label>
      <select style={styles.input} value={layerId || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— default —</option>
        {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  );
}

function ColourField({ colourHex, gelCode, onChangeHex, onChangeGel }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>Colour</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="color"
          value={colourHex || '#ffffff'}
          onChange={e => onChangeHex(e.target.value)}
          style={{ width: 28, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', background: 'none' }}
          title="Visual colour swatch"
        />
        <input
          style={{ ...styles.input, flex: 1 }}
          value={gelCode ?? ''}
          onChange={e => onChangeGel(e.target.value)}
          placeholder="Gel code e.g. R12"
        />
        {colourHex && (
          <button style={{ ...styles.iconBtn, color: 'var(--text-dim)' }} title="Clear colour" onClick={() => onChangeHex(null)}>×</button>
        )}
      </div>
    </div>
  );
}

function fmtKg(kg) {
  if (kg == null) return '—';
  return kg >= 10 ? `${kg.toFixed(0)} kg` : `${kg.toFixed(1)} kg`;
}

function StructureStats({ stats }) {
  const s = stats;
  const lenM = (s.totalLengthMm / 1000);
  return (
    <div style={{ borderTop: '2px solid var(--border)' }}>
      <div style={{ padding: '7px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Structure Summary
      </div>
      <div style={statStyles.rowWrap}>
        <div style={statStyles.row}><span style={statStyles.k}>Sections</span><span style={statStyles.v}>{s.memberCount} · {lenM.toFixed(2)} m</span></div>
        <div style={statStyles.row}><span style={statStyles.k}>Structure</span><span style={statStyles.v}>{fmtKg(s.structureKg)}</span></div>
        <div style={statStyles.row}><span style={statStyles.k}>Fixtures ({s.fixtures.length})</span><span style={statStyles.v}>{fmtKg(s.fixtureKg)}</span></div>
        <div style={statStyles.row}><span style={statStyles.k}>Cabling ({s.cables.length})</span><span style={statStyles.v}>{fmtKg(s.cableKg)}</span></div>
        <div style={{ ...statStyles.row, borderTop: '1px solid #1a3050', marginTop: 2, paddingTop: 4 }}>
          <span style={{ ...statStyles.k, color: 'var(--text)', fontWeight: 700 }}>Total load</span>
          <span style={{ ...statStyles.v, color: 'var(--success-text)', fontWeight: 700 }}>{fmtKg(s.totalKg)}</span>
        </div>
      </div>

      {s.fixtures.length > 0 && (
        <>
          <div style={statStyles.subhead}>Attached Fixtures</div>
          <div style={statStyles.list}>
            {s.fixtures.map(f => (
              <div key={f.id} style={statStyles.li}>
                <span style={statStyles.liName}>{f.label}{f.type ? ` · ${f.type}` : ''}</span>
                <span style={statStyles.liVal}>{fmtKg(f.weightKg)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {s.cables.length > 0 && (
        <>
          <div style={statStyles.subhead}>Cables to Structure</div>
          <div style={statStyles.list}>
            {s.cables.map(c => (
              <div key={c.id} style={statStyles.li}>
                <span style={{ ...statStyles.liName, textTransform: 'capitalize' }}>
                  {c.type}{c.subtype ? ` ${c.subtype}` : ''} · {(c.lengthMm / 1000).toFixed(1)} m
                </span>
                <span style={statStyles.liVal}>{fmtKg(c.weightKg)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const statStyles = {
  rowWrap: { padding: '2px 10px 6px' },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' },
  k: { color: 'var(--text-muted)' },
  v: { color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  subhead: { padding: '5px 10px 2px', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid var(--border)' },
  list: { padding: '0 10px 6px', maxHeight: 160, overflowY: 'auto' },
  li: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, padding: '2px 0', borderBottom: '1px solid #0f2440' },
  liName: { color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  liVal: { color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
};

export default function InspectorPanel({
  selected, onUpdateFixture, onUpdatePipe, onUpdateText, onUpdateObject,
  allFixtureTypes, dmxConflicts, selectedCount, selectedFixtures, layers,
  groupInfo, onGroup, onUngroup, onBulkUpdate, onAlign, onPatchSequential, suggestStartAddress,
  onAssignFreeAddress, onNextConflict, structureStats, onDeleteSelected,
}) {
  if (!selected) {
    if (selectedCount > 1) {
      return (
        <MultiSelectInspector
          selectedCount={selectedCount} selectedFixtures={selectedFixtures} layers={layers}
          groupInfo={groupInfo} onGroup={onGroup} onUngroup={onUngroup}
          onBulkUpdate={onBulkUpdate} onAlign={onAlign}
          onPatchSequential={onPatchSequential} suggestStartAddress={suggestStartAddress}
        />
      );
    }
    return <div style={styles.panel}><div style={styles.header}>Inspector</div><div style={styles.empty}>Nothing selected</div></div>;
  }

  if (selected.kind === 'fixture') {
    const f = selected;
    const ftype = allFixtureTypes?.find(t => t.id === f.fixtureTypeId);
    const hasModes = ftype?.modes?.length > 0;
    const conflict = dmxConflicts?.includes(f.id);
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Fixture {f.locked && '🔒'}</div>
        {conflict && (
          <div style={styles.conflict}>
            <div>⚠ DMX address overlaps another fixture</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {onAssignFreeAddress && (
                <button style={styles.conflictBtn} onClick={() => onAssignFreeAddress(f.id)}
                  title="Move this fixture to the first free range in its universe">Use next free address</button>
              )}
              {onNextConflict && (
                <button style={styles.conflictBtn} onClick={onNextConflict} title="Jump to the next conflicting fixture">Next ›</button>
              )}
            </div>
          </div>
        )}
        <Field label="Type" value={f.type} readOnly />
        {hasModes && (
          <Field label="DMX Mode">
            <select style={styles.input} value={f.dmxMode || ftype.defaultMode || ''}
              onChange={e => { const m = ftype.modes.find(m => m.name === e.target.value); onUpdateFixture(f.id, { dmxMode: e.target.value, dmxChannelCount: m?.channelCount || 1 }); }}>
              {ftype.modes.map(m => <option key={m.name} value={m.name}>{m.name} ({m.channelCount}ch)</option>)}
            </select>
          </Field>
        )}
        <Field label="Unit #" value={f.unit} onChange={v => onUpdateFixture(f.id, { unit: v })} />
        <Field label="Position" value={f.position} onChange={v => onUpdateFixture(f.id, { position: v })} />
        <Field label="Channel" value={f.channel} onChange={v => onUpdateFixture(f.id, { channel: v })} />
        <Field label={`DMX Address${conflict ? ' ⚠' : ''}`}>
          <DmxField value={f.dmxAddress} onChange={v => onUpdateFixture(f.id, { dmxAddress: v })} />
        </Field>
        <ColourField
          colourHex={f.colourHex}
          gelCode={f.colour}
          onChangeHex={v => onUpdateFixture(f.id, { colourHex: v || null })}
          onChangeGel={v => onUpdateFixture(f.id, { colour: v })}
        />
        <Field label="Gobo" value={f.gobo} onChange={v => onUpdateFixture(f.id, { gobo: v })} />
        <Field label="Purpose" value={f.purpose} onChange={v => onUpdateFixture(f.id, { purpose: v })} />
        <NumberField label="Rotation°" value={f.rotation ?? 0} step={15} decimals={1} onCommit={v => onUpdateFixture(f.id, { rotation: v })} />
        <NumberField label="Tilt°" value={f.tiltAngle ?? 0} min={-89} max={89} step={5} decimals={1} onCommit={v => onUpdateFixture(f.id, { tiltAngle: v })}
          title="Degrees from vertical (0 = straight down). Affects beam footprint on plan." />
        <NumberField label="Scale" value={f.scale || 1} min={0.1} max={20} step={0.1} decimals={2} onCommit={v => onUpdateFixture(f.id, { scale: v })} />
        <LayerField layerId={f.layerId} layers={layers} onChange={layerId => onUpdateFixture(f.id, { layerId })} />
        {/* Symbol override */}
        <Field label="Symbol">
          <select style={styles.input} value={f.symbolOverride || ''}
            onChange={e => onUpdateFixture(f.id, { symbolOverride: e.target.value || null })}>
            <option value="">— Default ({ftype?.name || 'type default'}) —</option>
            {(allFixtureTypes || []).filter(t => t.symbol).map(t => (
              <option key={t.id} value={t.symbol}>{t.name}</option>
            ))}
          </select>
        </Field>
        {/* Symbol colour override */}
        <Field label="Symbol Colour">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="color" value={f.symbolColor || '#ffffff'}
              style={{ width: 32, height: 22, padding: 1, border: '1px solid #2a4a6a', borderRadius: 3, cursor: 'pointer', background: 'none' }}
              onChange={e => onUpdateFixture(f.id, { symbolColor: e.target.value })}
              title="Symbol stroke colour" />
            <input type="text" value={f.symbolColor || ''}
              placeholder="default"
              style={{ ...styles.input, flex: 1 }}
              onChange={e => onUpdateFixture(f.id, { symbolColor: e.target.value || null })} />
            {f.symbolColor && (
              <button style={{ ...styles.iconBtn, color: 'var(--text-dim)' }} title="Reset to default"
                onClick={() => onUpdateFixture(f.id, { symbolColor: null })}>×</button>
            )}
          </div>
        </Field>
        {/* Notes */}
        <div style={styles.field}>
          <label style={styles.label}>Notes</label>
          <textarea
            style={{ ...styles.input, resize: 'vertical', minHeight: 54, fontFamily: 'inherit' }}
            value={f.notes ?? ''}
            placeholder="Add a note…"
            onChange={e => onUpdateFixture(f.id, { notes: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (selected.kind === 'pipe') {
    const p = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Pipe / Position {p.locked && '🔒'}</div>
        <Field label="Name" value={p.name} onChange={v => onUpdatePipe(p.id, { name: v })} />
        <Field label="Height above stage (m)" value={p.height} onChange={v => onUpdatePipe(p.id, { height: v })} />
        <LayerField layerId={p.layerId} layers={layers} onChange={layerId => onUpdatePipe(p.id, { layerId })} />
        {structureStats && <StructureStats stats={structureStats} />}
      </div>
    );
  }

  if (selected.kind === 'text') {
    const t = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Text {t.locked && '🔒'}</div>
        <Field label="Label" value={t.label} onChange={v => onUpdateText && onUpdateText(t.id, { label: v })} />
        <NumberField label="Font Size" value={t.fontSize || 14} min={1} max={500} decimals={1} onCommit={v => onUpdateText && onUpdateText(t.id, { fontSize: v })} />
        <NumberField label="Rotation°" value={t.rotation ?? 0} step={15} decimals={1} onCommit={v => onUpdateText && onUpdateText(t.id, { rotation: v })} />
        <LayerField layerId={t.layerId} layers={layers} onChange={layerId => onUpdateText && onUpdateText(t.id, { layerId })} />
        <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-dim)' }}>Double-click on canvas to edit inline</div>
      </div>
    );
  }

  if (selected.kind === 'annotation') {
    const a = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Annotation {a.locked && '🔒'}</div>
        <Field label="Note text" value={a.label} onChange={v => onUpdateText && onUpdateText(a.id, { label: v })} />
        <NumberField label="Width" value={a.w || 120} min={10} step={10} decimals={0} onCommit={v => onUpdateObject && onUpdateObject(a.id, 'annotation', { w: v })} />
        <NumberField label="Height" value={a.h || 50} min={10} step={10} decimals={0} onCommit={v => onUpdateObject && onUpdateObject(a.id, 'annotation', { h: v })} />
        <LayerField layerId={a.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(a.id, 'annotation', { layerId })} />
        <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-dim)' }}>Double-click on canvas to edit inline. Drag corner to resize.</div>
      </div>
    );
  }

  if (selected.kind === 'line') {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Line {selected.locked && '🔒'}</div>
        <LayerField layerId={selected.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(selected.id, 'line', { layerId })} />
      </div>
    );
  }

  if (selected.kind === 'rect') {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Rectangle {selected.locked && '🔒'}</div>
        <NumberField label="Rotation°" value={selected.rotation ?? 0} step={15} decimals={1} onCommit={v => onUpdateObject && onUpdateObject(selected.id, 'rect', { rotation: v })} />
        <LayerField layerId={selected.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(selected.id, 'rect', { layerId })} />
      </div>
    );
  }

  if (selected.kind === 'image') {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Image {selected.locked && '🔒'}</div>
        <NumberField label="Rotation°" value={selected.rotation ?? 0} step={15} decimals={1} onCommit={v => onUpdateObject && onUpdateObject(selected.id, 'image', { rotation: v })} />
        <NumberField label="Opacity" value={selected.opacity ?? 1} min={0} max={1} step={0.05} decimals={2} onCommit={v => onUpdateObject && onUpdateObject(selected.id, 'image', { opacity: v })} />
        <LayerField layerId={selected.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(selected.id, 'image', { layerId })} />
      </div>
    );
  }

  if (selected.kind === 'dimension') {
    const dm = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Dimension {dm.locked && '🔒'}</div>
        <div style={{ padding: '6px 10px', fontSize: 10, color: dm.locked ? '#7fd0a0' : 'var(--text-dim)', lineHeight: 1.4 }}>
          {dm.locked
            ? 'Constrained: dragging an attached object keeps this measurement fixed.'
            : 'Reference dimension (not constrained).'}
        </div>
        <NumberField label="Locked length (mm)" value={dm.value != null ? Math.round(dm.value) : null} min={1} step={10} decimals={0}
          onCommit={v => onUpdateObject && onUpdateObject(dm.id, 'dimension', { value: v })} />
        <div style={styles.field}>
          <label style={styles.label}>Constraint</label>
          <button style={{ ...styles.btn, marginTop: 0 }}
            onClick={() => onUpdateObject && onUpdateObject(dm.id, 'dimension', { locked: !dm.locked })}>
            {dm.locked ? 'Unlock (make reference)' : 'Lock as constraint'}
          </button>
        </div>
        <div style={{ padding: '8px 10px' }}>
          <button style={{ ...styles.btn, color: 'var(--danger-text)', borderColor: 'var(--danger-border)', width: '100%' }}
            onClick={() => onDeleteSelected && onDeleteSelected()}>
            🗑 Delete dimension (unconstrain)
          </button>
        </div>
      </div>
    );
  }

  return <div style={styles.panel}><div style={styles.header}>Inspector</div><div style={styles.empty}>Select an object</div></div>;
}

const styles = {
  panel: { width: '100%', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: '1 1 auto', minHeight: 180 },
  header: { padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  conflict: { padding: '6px 10px', background: 'var(--danger-bg)', color: 'var(--danger-text)', fontSize: 11, borderBottom: '1px solid var(--danger-border)' },
  conflictBtn: { background: '#4a1a1a', border: '1px solid #e53e3e', borderRadius: 3, color: 'var(--danger-text)', cursor: 'pointer', fontSize: 10, padding: '2px 6px' },
  section: { padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 },
  btnWide: { width: '100%', background: 'var(--border)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 11, padding: '4px 8px' },
  alignGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 },
  alignBtn: { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '3px 0' },
  inputError: { borderColor: '#e53e3e' },
  errText: { fontSize: 10, color: 'var(--danger-text)', marginTop: 2 },
  hintText: { fontSize: 10, color: 'var(--text-faint)', marginTop: 2 },
  btn: { background: 'var(--border)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '3px 10px', marginTop: 4 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 },
  empty: { padding: 16, color: 'var(--text-faint)', fontSize: 12, textAlign: 'center' },
  field: { padding: '5px 10px', borderBottom: '1px solid var(--border)' },
  label: { display: 'block', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 },
  input: { width: '100%', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontSize: 12, padding: '3px 6px', boxSizing: 'border-box', outline: 'none' },
  readOnly: { color: 'var(--text-dim)', cursor: 'default' },
};
