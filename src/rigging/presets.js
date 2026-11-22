/**
 * Rigging rating presets — a small table of bar and hoist models so a designer can
 * pick "48 mm tube" or "500 kg hoist" instead of typing numbers every time.
 *
 * IMPORTANT: the built-in rows are ILLUSTRATIVE EXAMPLES, not manufacturer data.
 * Real rated capacities depend on span, load type and the manufacturer's tables.
 * Edit the list (Rigging ▸ Presets…) with the figures from your own equipment's
 * documentation; the project keeps its own copy.
 *
 *   bar:   { id, kind:'bar',   name, weightKgPerM, capacityKg }   capacityKg = total load the bar may carry
 *   hoist: { id, kind:'hoist', name, capacityKg }                  capacityKg = working load limit per hoist
 */

export const EXAMPLE_PRESETS = [
  { id: 'ex-bar-steel48',  kind: 'bar',   name: 'Steel tube 48.3 × 3.2 (example)',    weightKgPerM: 3.56, capacityKg: 150 },
  { id: 'ex-bar-alu48',    kind: 'bar',   name: 'Aluminium tube 48.3 × 3.2 (example)', weightKgPerM: 1.22, capacityKg: 100 },
  { id: 'ex-truss-290',    kind: 'bar',   name: 'Box truss 290 × 290 (example)',       weightKgPerM: 8,    capacityKg: 400 },
  { id: 'ex-truss-400',    kind: 'bar',   name: 'Box truss 400 × 400 (example)',       weightKgPerM: 14,   capacityKg: 800 },
  { id: 'ex-hoist-250',    kind: 'hoist', name: 'Chain hoist 250 kg (example)',        capacityKg: 250 },
  { id: 'ex-hoist-500',    kind: 'hoist', name: 'Chain hoist 500 kg (example)',        capacityKg: 500 },
  { id: 'ex-hoist-1000',   kind: 'hoist', name: 'Chain hoist 1000 kg (example)',       capacityKg: 1000 },
  { id: 'ex-hoist-2000',   kind: 'hoist', name: 'Chain hoist 2000 kg (example)',       capacityKg: 2000 },
];

/** The presets in effect for a project: its own list if it has one, else the examples. */
export function getPresets(project) {
  return Array.isArray(project?.rigPresets) ? project.rigPresets : EXAMPLE_PRESETS;
}

export const barPresets = (list) => list.filter(p => p.kind === 'bar');
export const hoistPresets = (list) => list.filter(p => p.kind === 'hoist');

/** Fields to set on a pipe when a bar preset is chosen (or cleared with null). */
export function barPresetFields(preset) {
  if (!preset) return { presetId: undefined };
  return { presetId: preset.id, weightKgPerM: preset.weightKgPerM, capacityKg: preset.capacityKg };
}

/** Fields to set on a pipe when a hoist preset is chosen: new default rating + every existing hoist. */
export function hoistPresetFields(pipe, preset) {
  const cap = preset ? preset.capacityKg : undefined;
  return {
    hoistPresetId: preset ? preset.id : undefined,
    hoistCapacityKg: cap,
    hoists: (Array.isArray(pipe.hoists) ? pipe.hoists : []).map(h => ({ ...h, capacityKg: cap })),
  };
}

let seq = 0;
/** A blank preset row for the editor. */
export function newPreset(kind = 'bar') {
  return kind === 'hoist'
    ? { id: `p-${Date.now().toString(36)}-${seq++}`, kind, name: 'New hoist', capacityKg: 500 }
    : { id: `p-${Date.now().toString(36)}-${seq++}`, kind, name: 'New bar', weightKgPerM: 2, capacityKg: 150 };
}

/** Clean a preset list coming from the editor: trim names, drop non-numeric, keep ids unique. */
export function sanitizePresets(list) {
  const seen = new Set();
  const out = [];
  for (const p of list || []) {
    const name = String(p.name || '').trim();
    const cap = Number(p.capacityKg);
    if (!name || !Number.isFinite(cap) || cap <= 0) continue;
    const kind = p.kind === 'hoist' ? 'hoist' : 'bar';
    let id = p.id || `p-${out.length}`;
    while (seen.has(id)) id += '_';
    seen.add(id);
    const row = { id, kind, name, capacityKg: cap };
    if (kind === 'bar') { const w = Number(p.weightKgPerM); row.weightKgPerM = Number.isFinite(w) && w >= 0 ? w : 0; }
    out.push(row);
  }
  return out;
}
