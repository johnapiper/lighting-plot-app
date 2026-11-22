/**
 * Named views — saved layer-visibility sets ("FOH only", "Power only", "Focus").
 *
 * A view remembers which layers are visible. Applying one to the plot flips the
 * project's layers; a sheet viewport can also point at a view so one plot appears
 * differently on different sheets without touching the plot itself.
 *
 *   view = { id, name, layers: { [layerId]: boolean } }
 *
 * Layers that were added after a view was saved keep their current visibility.
 */

let seq = 0;
const newId = () => `view-${Date.now().toString(36)}-${seq++}`;

/** Snapshot the current layer visibility as a view. */
export function captureView(layers, name, id) {
  const map = {};
  (layers || []).forEach(l => { map[l.id] = l.visible !== false; });
  return { id: id || newId(), name: String(name || '').trim() || 'View', layers: map };
}

/** Layers with visibility taken from `view` (others unchanged). Returns the same array when nothing changes. */
export function applyViewToLayers(layers, view) {
  if (!view) return layers;
  let changed = false;
  const out = (layers || []).map(l => {
    if (!(l.id in view.layers)) return l;
    const vis = !!view.layers[l.id];
    if ((l.visible !== false) === vis) return l;
    changed = true;
    return { ...l, visible: vis };
  });
  return changed ? out : layers;
}

/** Layers as a viewport should draw them: the view's visibility, or the plot's own when no view is chosen / it was deleted. */
export function layersForViewport(layers, views, viewId) {
  if (!viewId) return layers;
  const view = (views || []).find(v => v.id === viewId);
  return applyViewToLayers(layers, view);
}

/** The view whose visibility exactly matches the current layers, if any. */
export function matchingView(layers, views) {
  return (views || []).find(v =>
    (layers || []).every(l => !(l.id in v.layers) || (l.visible !== false) === !!v.layers[l.id])
    && Object.keys(v.layers).some(id => (layers || []).some(l => l.id === id))
  ) || null;
}

/** Name that doesn't clash with an existing view ("Focus", "Focus 2", …). */
export function uniqueViewName(views, name) {
  const base = String(name || '').trim() || 'View';
  const taken = new Set((views || []).map(v => v.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

export const addView = (views, view) => [...(views || []), view];
export const renameView = (views, id, name) => (views || []).map(v => (v.id === id ? { ...v, name: String(name).trim() || v.name } : v));
export const deleteView = (views, id) => (views || []).filter(v => v.id !== id);
export const recaptureView = (views, id, layers) => (views || []).map(v => (v.id === id ? { ...v, layers: captureView(layers, v.name, v.id).layers } : v));
