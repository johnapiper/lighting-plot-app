/**
 * InfraInspector — inspector panel for infrastructure items
 * (power distro, DMX node, network switch, network port)
 * and cable connections.
 */
import React, { useState } from 'react';
import { CABLE_TYPES, CIRCUIT_RATINGS, calcCircuitLoad, wattsToAmps } from '../cabling/ratings';
import { formatLength, calcCableRoute } from '../cabling/routing';
import { generateId } from '../canvas/geometry';

// ── Shared field component ─────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 10, color: '#718096', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 9, color: '#4a5568', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input style={inp} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  );
}
function NumInput({ value, onChange, min, max, step }) {
  return (
    <input type="number" style={inp} value={value ?? ''} min={min} max={max} step={step || 1}
      onChange={e => onChange(Number(e.target.value))} />
  );
}
function Select({ value, onChange, options }) {
  return (
    <select style={inp} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

const inp = {
  width: '100%', background: '#0d1b2a', border: '1px solid #0f3460',
  borderRadius: 3, color: '#e0e0e0', fontSize: 12, padding: '4px 7px',
  outline: 'none', boxSizing: 'border-box',
};

// ── Distro inspector ───────────────────────────────────────────────────────
function DistroInspector({ item, onChange }) {
  function addCircuit() {
    onChange({
      ...item,
      circuits: [
        ...(item.circuits || []),
        { id: generateId(), label: `Cct ${(item.circuits?.length || 0) + 1}`, rating: '16A' },
      ],
    });
  }
  function updateCircuit(cid, patch) {
    onChange({ ...item, circuits: (item.circuits || []).map(c => c.id === cid ? { ...c, ...patch } : c) });
  }
  function removeCircuit(cid) {
    onChange({ ...item, circuits: (item.circuits || []).filter(c => c.id !== cid) });
  }

  return (
    <>
      <Field label="Label"><TextInput value={item.label} onChange={v => onChange({ ...item, label: v })} /></Field>
      <Field label="Type"><div style={{ fontSize: 11, color: '#fbbf24' }}>Power Distribution Unit</div></Field>

      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 10, marginBottom: 6, borderTop: '1px solid #0f3460', paddingTop: 8 }}>
        Circuits ({(item.circuits || []).length})
      </div>
      {(item.circuits || []).map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input style={{ ...inp, flex: 1 }} value={c.label} onChange={e => updateCircuit(c.id, { label: e.target.value })} placeholder="Label" />
          <select style={{ ...inp, width: 90 }} value={c.rating} onChange={e => updateCircuit(c.id, { rating: e.target.value })}>
            {CIRCUIT_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}
            onClick={() => removeCircuit(c.id)}>✕</button>
        </div>
      ))}
      <button style={{ ...addBtn, marginTop: 4 }} onClick={addCircuit}>+ Add Circuit</button>
    </>
  );
}

// ── Node inspector ─────────────────────────────────────────────────────────
function NodeInspector({ item, onChange }) {
  return (
    <>
      <Field label="Label"><TextInput value={item.label} onChange={v => onChange({ ...item, label: v })} /></Field>
      <Field label="Type"><div style={{ fontSize: 11, color: '#a78bfa' }}>DMX Node</div></Field>
      <Field label="First Universe">
        <NumInput value={item.universeStart || 1} min={1} max={256}
          onChange={v => onChange({ ...item, universeStart: v })} />
      </Field>
      <Field label="Universe Outputs">
        <NumInput value={item.universeCount || 1} min={1} max={64}
          onChange={v => onChange({ ...item, universeCount: v })} />
      </Field>
      <Field label="Network Connection" hint="ID of switch or netport this node is plugged into">
        <TextInput value={item.networkId || ''} onChange={v => onChange({ ...item, networkId: v || null })} placeholder="(none)" />
      </Field>
    </>
  );
}

// ── Switch inspector ───────────────────────────────────────────────────────
function SwitchInspector({ item, onChange }) {
  return (
    <>
      <Field label="Label"><TextInput value={item.label} onChange={v => onChange({ ...item, label: v })} /></Field>
      <Field label="Type"><div style={{ fontSize: 11, color: '#34d399' }}>Network Switch</div></Field>
      <Field label="Ports">
        <NumInput value={item.ports || 8} min={1} max={48}
          onChange={v => onChange({ ...item, ports: v })} />
      </Field>
      <Field label="Uplink (switch/netport ID)" hint="Leave blank if directly connected to venue network">
        <TextInput value={item.networkId || ''} onChange={v => onChange({ ...item, networkId: v || null })} placeholder="(none)" />
      </Field>
    </>
  );
}

// ── NetPort inspector ──────────────────────────────────────────────────────
function NetPortInspector({ item, onChange }) {
  return (
    <>
      <Field label="Label"><TextInput value={item.label} onChange={v => onChange({ ...item, label: v })} /></Field>
      <Field label="Type"><div style={{ fontSize: 11, color: '#10b981' }}>Network Port / Floor Box</div></Field>
      <Field label="Port ID / Patch Panel" hint="e.g. 'Panel A Port 12'">
        <TextInput value={item.portRef || ''} onChange={v => onChange({ ...item, portRef: v })} />
      </Field>
    </>
  );
}

// ── Cable inspector ────────────────────────────────────────────────────────
export function CableInspector({ cable, fromLabel, toLabel, lengthMm, loadInfo, onChange, onDelete }) {
  const powerTypes   = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'power').map(([k,v]) => ({ value: k, label: v.label }));
  const dmxTypes     = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'dmx').map(([k,v]) => ({ value: k, label: v.label }));
  const networkTypes = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'network').map(([k,v]) => ({ value: k, label: v.label }));

  const subtypeOptions = cable.cableType === 'power'   ? powerTypes
                       : cable.cableType === 'dmx'     ? dmxTypes
                       : cable.cableType === 'network' ? networkTypes
                       : [...powerTypes, ...dmxTypes, ...networkTypes];

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', marginBottom: 10 }}>Cable</div>
      <Field label="Label">
        <TextInput value={cable.label || ''} onChange={v => onChange({ ...cable, label: v })} />
      </Field>
      <Field label="Cable Type">
        <Select value={cable.cableType} options={[
          { value: 'power',   label: 'Power' },
          { value: 'dmx',     label: 'DMX' },
          { value: 'network', label: 'Network' },
        ]} onChange={v => onChange({ ...cable, cableType: v, subtype: null })} />
      </Field>
      {cable.cableType && (
        <Field label="Connector / Subtype">
          <Select value={cable.subtype || ''} options={subtypeOptions}
            onChange={v => onChange({ ...cable, subtype: v })} />
        </Field>
      )}
      <div style={{ fontSize: 10, color: '#4a5568', marginTop: 8 }}>
        From: <span style={{ color: '#e0e0e0' }}>{fromLabel || cable.fromId}</span>
      </div>
      <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 8 }}>
        To: <span style={{ color: '#e0e0e0' }}>{toLabel || cable.toId}</span>
      </div>
      <div style={{ fontSize: 10, color: '#4a5568' }}>
        Est. Length: <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{formatLength(lengthMm)}</span>
      </div>
      {loadInfo && (
        <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4,
          background: loadInfo.overloaded ? '#450a0a' : '#0a2a1a',
          border: `1px solid ${loadInfo.overloaded ? '#ef4444' : '#166534'}` }}>
          <div style={{ fontSize: 10, color: loadInfo.overloaded ? '#ef4444' : '#34d399', fontWeight: 600 }}>
            {loadInfo.overloaded ? '⚠ OVERLOADED' : '✓ OK'}
          </div>
          <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 2 }}>
            Load: {loadInfo.totalAmps}A / {loadInfo.maxAmps}A · {loadInfo.utilizationPct}%
          </div>
          <div style={{ fontSize: 10, color: '#a0aec0' }}>
            {loadInfo.totalWatts}W / {loadInfo.maxWatts}W
          </div>
        </div>
      )}
      <button style={{ ...addBtn, background: '#1a0a0a', border: '1px solid #7f1d1d', color: '#ef4444', marginTop: 12, width: '100%' }}
        onClick={onDelete}>Delete Cable</button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function InfraInspector({ item, onChange }) {
  if (!item) return null;
  const inspectors = { distro: DistroInspector, node: NodeInspector, switch: SwitchInspector, netport: NetPortInspector };
  const Inspector  = inspectors[item.type];
  if (!Inspector) return null;

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#a0aec0', marginBottom: 10, textTransform: 'capitalize' }}>
        {item.type === 'distro' ? '⚡' : item.type === 'node' ? '🎛' : item.type === 'switch' ? '🌐' : '🔌'} {item.type}
      </div>
      <Inspector item={item} onChange={onChange} />
      <Field label="Position (X / Y)" hint="World units">
        <div style={{ display: 'flex', gap: 4 }}>
          <NumInput value={Math.round(item.x)} onChange={v => onChange({ ...item, x: v })} />
          <NumInput value={Math.round(item.y)} onChange={v => onChange({ ...item, y: v })} />
        </div>
      </Field>
      {item.onStructureId && (
        <div style={{ fontSize: 10, color: '#e0c060', marginTop: 4 }}>
          📎 Hung on structure
        </div>
      )}
    </div>
  );
}

const addBtn = {
  padding: '4px 10px', background: '#0f3460', border: '1px solid #4a90d9',
  borderRadius: 3, color: '#4a90d9', cursor: 'pointer', fontSize: 11, fontWeight: 600,
};
