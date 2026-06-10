/**
 * FixturePropertiesModal — edit all GDTF-like attributes of a fixture type.
 *
 * Covers: manufacturer, model, weight, power consumption, beam angle,
 * colour type, DMX modes (name + channel count), IP rating, notes, and more.
 */
import React, { useState } from 'react';
import { SYMBOL_CATALOGUE } from '../library/GdtfImporter';

const COLOUR_TYPES = [
  'RGB', 'RGBW', 'RGBWW', 'RGBWA', 'CMY', 'Fixed White', 'Fixed Colour',
  'Tungsten', 'LED White', 'Variable White', 'Gobo', 'Laser', 'None',
];

const IP_RATINGS = [
  'IP20', 'IP44', 'IP54', 'IP65', 'IP66', 'IP67', 'IP68',
];

export default function FixturePropertiesModal({ fixture, onSave, onClose }) {
  const [form, setForm] = useState({
    name:            fixture.name        || '',
    manufacturer:    fixture.manufacturer || '',
    model:           fixture.model        || fixture.name || '',
    category:        fixture.category    || 'Fixture',
    weightKg:        fixture.weightKg    != null ? String(fixture.weightKg)    : '',
    powerW:          fixture.powerW      != null ? String(fixture.powerW)      : '',
    beamAngle:       fixture.beamAngle   != null ? String(fixture.beamAngle)   : '',
    colourType:      fixture.colourType  || '',
    ipRating:        fixture.ipRating    || '',
    lensDesc:        fixture.lensDesc    || '',
    notes:           fixture.notes       || '',
    dmxModes:        fixture.dmxModes    ? JSON.parse(JSON.stringify(fixture.dmxModes))
                                         : [{ name: 'Default', channels: fixture.defaultChannelCount || 1 }],
    // Symbol
    symbolId:        fixture.symbolId    || 'Generic',
    symbol:          fixture.symbol      || '',
    symbolViewBox:   fixture.symbolViewBox || '-20 -22 40 44',
    symbolColour:    fixture.symbolColour || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addMode() {
    setForm(f => ({ ...f, dmxModes: [...f.dmxModes, { name: `Mode ${f.dmxModes.length + 1}`, channels: 1 }] }));
  }

  function removeMode(i) {
    setForm(f => ({ ...f, dmxModes: f.dmxModes.filter((_, idx) => idx !== i) }));
  }

  function updateMode(i, key, val) {
    setForm(f => {
      const modes = [...f.dmxModes];
      modes[i] = { ...modes[i], [key]: key === 'channels' ? Number(val) || 1 : val };
      return { ...f, dmxModes: modes };
    });
  }

  function handleSave() {
    // Resolve chosen symbol entry
    const symEntry = SYMBOL_CATALOGUE.find(s => s.id === form.symbolId);
    const updated = {
      ...fixture,
      name:          form.name.trim()         || fixture.name,
      manufacturer:  form.manufacturer.trim(),
      model:         form.model.trim(),
      category:      form.category.trim()     || fixture.category,
      weightKg:      form.weightKg     !== '' ? Number(form.weightKg)     : undefined,
      powerW:        form.powerW       !== '' ? Number(form.powerW)       : undefined,
      beamAngle:     form.beamAngle    !== '' ? Number(form.beamAngle)    : undefined,
      colourType:    form.colourType,
      ipRating:      form.ipRating,
      lensDesc:      form.lensDesc.trim(),
      notes:         form.notes.trim(),
      dmxModes:      form.dmxModes,
      defaultChannelCount: form.dmxModes[0]?.channels || 1,
      // Symbol
      symbolId:      form.symbolId,
      symbol:        symEntry ? symEntry.symbol        : (form.symbol || fixture.symbol),
      symbolViewBox: symEntry ? symEntry.symbolViewBox : (form.symbolViewBox || fixture.symbolViewBox),
      symbolColour:  form.symbolColour || undefined,
    };
    // Strip undefined fields for clean storage
    Object.keys(updated).forEach(k => updated[k] === undefined && delete updated[k]);
    onSave(updated);
    onClose();
  }

  return (
    <div style={S.overlay}>
      <div style={S.window}>
        {/* Title */}
        <div style={S.titleBar}>
          <span>⚙️ Fixture Properties — <em style={{ fontWeight: 400 }}>{fixture.name}</em></span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* Left column */}
          <div style={S.col}>
            <Section title="Identity">
              <Field label="Name">
                <Input value={form.name} onChange={v => set('name', v)} />
              </Field>
              <Field label="Manufacturer">
                <Input value={form.manufacturer} onChange={v => set('manufacturer', v)} placeholder="e.g. Robe" />
              </Field>
              <Field label="Model">
                <Input value={form.model} onChange={v => set('model', v)} placeholder="e.g. T1 Profile" />
              </Field>
              <Field label="Category">
                <Input value={form.category} onChange={v => set('category', v)} placeholder="e.g. Moving Head" />
              </Field>
            </Section>

            <Section title="Physical">
              <Field label="Weight (kg)">
                <Input type="number" value={form.weightKg} onChange={v => set('weightKg', v)} placeholder="e.g. 18.5" min="0" step="0.1" />
              </Field>
              <Field label="Power (W)">
                <Input type="number" value={form.powerW} onChange={v => set('powerW', v)} placeholder="e.g. 650" min="0" />
              </Field>
              <Field label="IP Rating">
                <select value={form.ipRating} onChange={e => set('ipRating', e.target.value)} style={S.select}>
                  <option value="">— None —</option>
                  {IP_RATINGS.map(ip => <option key={ip} value={ip}>{ip}</option>)}
                </select>
              </Field>
            </Section>

            <Section title="Notes">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Additional information…"
                rows={3}
                style={S.textarea}
              />
            </Section>
          </div>

          {/* Right column */}
          <div style={S.col}>
            <Section title="Optics">
              <Field label="Beam Angle (°)">
                <Input type="number" value={form.beamAngle} onChange={v => set('beamAngle', v)} placeholder="e.g. 22" min="0" max="360" step="0.1" />
              </Field>
              <Field label="Colour Type">
                <select value={form.colourType} onChange={e => set('colourType', e.target.value)} style={S.select}>
                  <option value="">— Select —</option>
                  {COLOUR_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Lens">
                <Input value={form.lensDesc} onChange={v => set('lensDesc', v)} placeholder="e.g. PC / Fresnel / Zoom 15–35°" />
              </Field>
            </Section>

            <Section title="Symbol">
              {/* Symbol picker — grid of SVG thumbnails */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {SYMBOL_CATALOGUE.map(s => {
                  const active = form.symbolId === s.id;
                  return (
                    <button
                      key={s.id}
                      title={s.label}
                      onClick={() => set('symbolId', s.id)}
                      style={{
                        background: active ? '#0f3460' : '#0d1b2a',
                        border: `1px solid ${active ? '#4a90d9' : '#1a3a5c'}`,
                        borderRadius: 4, padding: 4, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      }}
                    >
                      <svg
                        viewBox={s.symbolViewBox} width="34" height="34"
                        style={{ color: active ? '#4a90d9' : '#a0aec0', display: 'block' }}
                      >
                        <g dangerouslySetInnerHTML={{ __html: s.symbol }} />
                      </svg>
                      <span style={{ fontSize: 8, color: active ? '#4a90d9' : '#718096', whiteSpace: 'nowrap' }}>
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Symbol colour */}
              <Field label="Symbol Colour">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={form.symbolColour || '#e0e0e0'}
                    onChange={e => set('symbolColour', e.target.value)}
                    style={{ width: 36, height: 28, padding: 2, background: 'none',
                      border: '1px solid #1a3a5c', borderRadius: 3, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11, color: '#a0aec0', flex: 1 }}>
                    {form.symbolColour || 'Default (white)'}
                  </span>
                  {form.symbolColour && (
                    <button
                      onClick={() => set('symbolColour', '')}
                      style={{ background: 'none', border: 'none', color: '#718096',
                        cursor: 'pointer', fontSize: 11, padding: 0 }}
                      title="Reset to default colour"
                    >Reset</button>
                  )}
                </div>
              </Field>
              {/* Live preview */}
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: '#4a5568' }}>Preview:</span>
                {(() => {
                  const sym = SYMBOL_CATALOGUE.find(s => s.id === form.symbolId);
                  return sym ? (
                    <svg viewBox={sym.symbolViewBox} width="44" height="44"
                      style={{ color: form.symbolColour || '#e0e0e0', background: '#0d1b2a',
                        borderRadius: 4, border: '1px solid #1a3a5c' }}>
                      <g dangerouslySetInnerHTML={{ __html: sym.symbol }} />
                    </svg>
                  ) : null;
                })()}
              </div>
            </Section>

            <Section title="DMX Modes">
              {form.dmxModes.map((mode, i) => (
                <div key={i} style={S.modeRow}>
                  <input
                    value={mode.name}
                    onChange={e => updateMode(i, 'name', e.target.value)}
                    placeholder="Mode name"
                    style={{ ...S.input, flex: 1 }}
                  />
                  <input
                    type="number" min="1" max="512"
                    value={mode.channels}
                    onChange={e => updateMode(i, 'channels', e.target.value)}
                    style={{ ...S.input, width: 52 }}
                    title="Channel count"
                  />
                  <span style={{ fontSize: 10, color: '#718096', marginLeft: 2 }}>ch</span>
                  {form.dmxModes.length > 1 && (
                    <button style={S.removeBtn} onClick={() => removeMode(i)} title="Remove mode">✕</button>
                  )}
                </div>
              ))}
              <button style={S.addModeBtn} onClick={addMode}>+ Add Mode</button>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.saveBtn} onClick={handleSave}>Save Properties</button>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: '#4a90d9', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 8, borderBottom: '1px solid #0f3460', paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7, gap: 8 }}>
      <span style={{ fontSize: 11, color: '#a0aec0', width: 110, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder, min, max, step }) {
  return (
    <input
      type={type} value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min} max={max} step={step}
      style={S.input}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  window: {
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 8,
    width: 760, maxHeight: '88vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
  },
  titleBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #0f3460',
    fontSize: 14, fontWeight: 700, color: '#e0e0e0',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 16,
  },
  body: {
    display: 'flex', gap: 24, padding: '16px 20px', overflowY: 'auto', flex: 1,
  },
  col: { flex: 1 },
  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '12px 16px', borderTop: '1px solid #0f3460',
  },
  input: {
    width: '100%', background: '#0d1b2a', border: '1px solid #1a3a5c',
    borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '5px 8px', outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%', background: '#0d1b2a', border: '1px solid #1a3a5c',
    borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '5px 8px',
  },
  textarea: {
    width: '100%', background: '#0d1b2a', border: '1px solid #1a3a5c',
    borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '6px 8px',
    outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  modeRow: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  removeBtn: {
    background: 'transparent', border: 'none', color: '#fc8181', cursor: 'pointer',
    fontSize: 11, padding: '0 2px',
  },
  addModeBtn: {
    marginTop: 4, padding: '4px 10px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 3, color: '#4a90d9', cursor: 'pointer', fontSize: 11,
  },
  saveBtn: {
    padding: '8px 20px', background: '#0f3460', border: '1px solid #4a90d9',
    borderRadius: 4, color: '#4a90d9', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  cancelBtn: {
    padding: '8px 14px', background: '#3a1a1a', border: '1px solid #7a2a2a',
    borderRadius: 4, color: '#fc8181', cursor: 'pointer', fontSize: 13,
  },
};
