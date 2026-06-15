import React from 'react';

function Field({ label, value, onChange, readOnly, type = 'text', children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children || (
        <input
          style={{ ...styles.input, ...(readOnly ? styles.readOnly : {}) }}
          value={value ?? ''} type={type}
          onChange={e => onChange && onChange(e.target.value)}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function parseDmx(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 2) return null;
  const u = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
  if (isNaN(u) || isNaN(c)) return null;
  return { universe: u, channel: c };
}

function DmxField({ value, onChange }) {
  function handleBlur(e) {
    const raw = e.target.value.trim();
    if (!raw) { onChange(''); return; }
    const parsed = parseDmx(raw);
    if (!parsed) { alert('DMX address must be Universe/Channel, e.g. 1/1'); return; }
    if (parsed.channel < 1 || parsed.channel > 512) { alert('Channel must be 1–512'); return; }
    onChange(`${parsed.universe}/${parsed.channel}`);
  }
  return <input style={styles.input} value={value ?? ''} onChange={e => onChange(e.target.value)} onBlur={handleBlur} placeholder="e.g. 1/1" />;
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
          style={{ width: 28, height: 24, padding: 0, border: '1px solid #0f3460', borderRadius: 3, cursor: 'pointer', background: 'none' }}
          title="Visual colour swatch"
        />
        <input
          style={{ ...styles.input, flex: 1 }}
          value={gelCode ?? ''}
          onChange={e => onChangeGel(e.target.value)}
          placeholder="Gel code e.g. R12"
        />
        {colourHex && (
          <button style={{ ...styles.iconBtn, color: '#718096' }} title="Clear colour" onClick={() => onChangeHex(null)}>×</button>
        )}
      </div>
    </div>
  );
}

export default function InspectorPanel({
  selected, onUpdateFixture, onUpdatePipe, onUpdateText, onUpdateObject,
  allFixtureTypes, dmxConflicts, selectedCount, layers,
  groupInfo, onGroup, onUngroup, onBulkUpdate, structureStats,
}) {
  if (!selected) {
    if (selectedCount > 1) {
      return (
        <div style={styles.panel}>
          <div style={styles.header}>Inspector</div>
          <div style={styles.multi}>
            <div style={{ marginBottom: 8 }}>{selectedCount} items selected</div>
            {groupInfo ? (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: '#a0aec0' }}>Group ({groupInfo.memberCount} members)</span>
                <br /><button style={{ ...styles.btn, marginTop: 4 }} onClick={onUngroup}>Ungroup</button>
              </div>
            ) : (
              <div style={{ marginBottom: 8 }}>
                <button style={styles.btn} onClick={onGroup}>Group (Ctrl+G)</button>
              </div>
            )}
            {onBulkUpdate && (
              <div style={{ borderTop: '1px solid #0f3460', paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: '#4a90d9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Bulk Edit</div>
                <div style={styles.field}>
                  <label style={styles.label}>Colour</label>
                  <input type="color" defaultValue="#ffffff"
                    style={{ width: 32, height: 24, padding: 0, border: '1px solid #0f3460', borderRadius: 3, cursor: 'pointer', background: 'none' }}
                    onChange={e => onBulkUpdate({ colourHex: e.target.value })} />
                </div>
                {layers?.length > 0 && (
                  <div style={styles.field}>
                    <label style={styles.label}>Layer</label>
                    <select style={styles.input} defaultValue="" onChange={e => { if (e.target.value) onBulkUpdate({ layerId: e.target.value }); }}>
                      <option value="">— apply layer —</option>
                      {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#718096', marginTop: 4 }}>Del to remove</div>
          </div>
        </div>
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
        {conflict && <div style={styles.conflict}>⚠ DMX address conflict</div>}
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
        <Field label="Rotation°" value={f.rotation ?? 0} type="number" onChange={v => onUpdateFixture(f.id, { rotation: Number(v) })} />
        <Field label="Tilt°" value={f.tiltAngle ?? 0} type="number" onChange={v => onUpdateFixture(f.id, { tiltAngle: Math.max(-89, Math.min(89, Number(v))) })}
          title="Degrees from vertical (0 = straight down). Affects beam footprint on plan." />
        <Field label="Scale" value={(f.scale || 1).toFixed(2)} type="number" onChange={v => onUpdateFixture(f.id, { scale: Math.max(0.1, Number(v)) })} />
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
              <button style={{ ...styles.iconBtn, color: '#718096' }} title="Reset to default"
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
      </div>
    );
  }

  if (selected.kind === 'text') {
    const t = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Text {t.locked && '🔒'}</div>
        <Field label="Label" value={t.label} onChange={v => onUpdateText && onUpdateText(t.id, { label: v })} />
        <Field label="Font Size" value={t.fontSize || 14} type="number" onChange={v => onUpdateText && onUpdateText(t.id, { fontSize: Number(v) })} />
        <Field label="Rotation°" value={t.rotation ?? 0} type="number" onChange={v => onUpdateText && onUpdateText(t.id, { rotation: Number(v) })} />
        <LayerField layerId={t.layerId} layers={layers} onChange={layerId => onUpdateText && onUpdateText(t.id, { layerId })} />
        <div style={{ padding: '6px 10px', fontSize: 10, color: '#718096' }}>Double-click on canvas to edit inline</div>
      </div>
    );
  }

  if (selected.kind === 'annotation') {
    const a = selected;
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Annotation {a.locked && '🔒'}</div>
        <Field label="Note text" value={a.label} onChange={v => onUpdateText && onUpdateText(a.id, { label: v })} />
        <Field label="Width" value={a.w || 120} type="number" onChange={v => onUpdateObject && onUpdateObject(a.id, 'annotation', { w: Number(v) })} />
        <Field label="Height" value={a.h || 50} type="number" onChange={v => onUpdateObject && onUpdateObject(a.id, 'annotation', { h: Number(v) })} />
        <LayerField layerId={a.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(a.id, 'annotation', { layerId })} />
        <div style={{ padding: '6px 10px', fontSize: 10, color: '#718096' }}>Double-click on canvas to edit inline. Drag corner to resize.</div>
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
        <Field label="Rotation°" value={selected.rotation ?? 0} type="number" onChange={v => onUpdateObject && onUpdateObject(selected.id, 'rect', { rotation: Number(v) })} />
        <LayerField layerId={selected.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(selected.id, 'rect', { layerId })} />
      </div>
    );
  }

  if (selected.kind === 'image') {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Image {selected.locked && '🔒'}</div>
        <Field label="Rotation°" value={selected.rotation ?? 0} type="number" onChange={v => onUpdateObject && onUpdateObject(selected.id, 'image', { rotation: Number(v) })} />
        <Field label="Opacity" value={selected.opacity ?? 1} type="number" onChange={v => onUpdateObject && onUpdateObject(selected.id, 'image', { opacity: Math.max(0, Math.min(1, Number(v))) })} />
        <LayerField layerId={selected.layerId} layers={layers} onChange={layerId => onUpdateObject && onUpdateObject(selected.id, 'image', { layerId })} />
      </div>
    );
  }

  return <div style={styles.panel}><div style={styles.header}>Inspector</div><div style={styles.empty}>Select an object</div></div>;
}

const styles = {
  panel: { width: '100%', background: '#16213e', display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: '1 1 auto', minHeight: 180 },
  header: { padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a90d9', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  conflict: { padding: '6px 10px', background: '#3a1a1a', color: '#fc8181', fontSize: 11, borderBottom: '1px solid #7a2a2a' },
  multi: { padding: '14px 12px', color: '#4a90d9', fontSize: 12, textAlign: 'center', lineHeight: 1.8 },
  btn: { background: '#0f3460', border: '1px solid #4a90d9', borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 11, padding: '3px 10px', marginTop: 4 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#718096', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 },
  empty: { padding: 16, color: '#4a5568', fontSize: 12, textAlign: 'center' },
  field: { padding: '5px 10px', borderBottom: '1px solid #0f3460' },
  label: { display: 'block', fontSize: 9, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 },
  input: { width: '100%', background: '#0d1b2a', border: '1px solid #0f3460', borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '3px 6px', boxSizing: 'border-box', outline: 'none' },
  readOnly: { color: '#718096', cursor: 'default' },
};
