import { useState, useCallback, useRef } from 'react';
import { generateId } from '../canvas/geometry';
import { initialProject, syncDimensionsLayer, migrateProject, checkSchemaVersion } from './model';

export * from './model';

const MAX_HISTORY = 50;
const COALESCE_MS = 1200;
function clone(s) { return JSON.parse(JSON.stringify(s)); }

// ── Store hook ────────────────────────────────────────────────────────────
export function useProjectStore() {
  const [project, setProject] = useState(clone(initialProject));
  const history = useRef([clone(initialProject)]);
  const labels  = useRef(['Initial state']);   // parallel to history: one summary per state
  const idx = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Bump on every history mutation so panels reading the refs re-render.
  const [, setHistoryVersion] = useState(0);

  // Consecutive commits sharing a coalesce key within COALESCE_MS (e.g. typing
  // into one inspector field, or holding an arrow key) collapse into a single
  // undo step.
  const lastCoalesce = useRef({ key: null, at: 0 });

  const commit = useCallback((updater, label, opts) => {
    const key = opts?.coalesceKey || null;
    const now = Date.now();
    const merge = !!key && lastCoalesce.current.key === key && now - lastCoalesce.current.at < COALESCE_MS;
    lastCoalesce.current = { key, at: now };
    setProject(prev => {
      const next = syncDimensionsLayer(typeof updater === 'function' ? updater(clone(prev)) : clone(updater));
      if (merge && idx.current === history.current.length - 1 && idx.current > 0) {
        history.current[idx.current] = clone(next);
        return next;
      }
      history.current = history.current.slice(0, idx.current + 1);
      labels.current  = labels.current.slice(0, idx.current + 1);
      history.current.push(clone(next));
      labels.current.push(label || 'Edit');
      if (history.current.length > MAX_HISTORY) { history.current.shift(); labels.current.shift(); }
      idx.current = history.current.length - 1;
      setCanUndo(idx.current > 0); setCanRedo(false);
      return next;
    });
    setHistoryVersion(v => v + 1);
  }, []);

  const softUpdate = useCallback((updater) => {
    setProject(prev => {
      const next = syncDimensionsLayer(typeof updater === 'function' ? updater(clone(prev)) : clone(updater));
      history.current[idx.current] = clone(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    lastCoalesce.current.key = null;
    if (idx.current <= 0) return;
    idx.current--;
    setProject(clone(history.current[idx.current]));
    setCanUndo(idx.current > 0); setCanRedo(true);
    setHistoryVersion(v => v + 1);
  }, []);

  const redo = useCallback(() => {
    lastCoalesce.current.key = null;
    if (idx.current >= history.current.length - 1) return;
    idx.current++;
    setProject(clone(history.current[idx.current]));
    setCanUndo(true); setCanRedo(idx.current < history.current.length - 1);
    setHistoryVersion(v => v + 1);
  }, []);

  // Returns 'newer' when the file came from a newer build (caller should warn).
  const loadProject = useCallback((p) => {
    const schemaStatus = checkSchemaVersion(p);
    const loaded = syncDimensionsLayer(migrateProject({ ...clone(initialProject), ...clone(p) }));
    history.current = [loaded]; labels.current = ['Opened project']; idx.current = 0;
    lastCoalesce.current.key = null;
    setProject(loaded); setCanUndo(false); setCanRedo(false);
    setHistoryVersion(v => v + 1);
    return schemaStatus;
  }, []);

  const resetProject = useCallback(() => {
    const fresh = clone(initialProject);
    history.current = [fresh]; labels.current = ['New project']; idx.current = 0;
    lastCoalesce.current.key = null;
    setProject(fresh); setCanUndo(false); setCanRedo(false);
    setHistoryVersion(v => v + 1);
  }, []);

  const saveRevision = useCallback((name) => {
    commit(p => {
      const revs = [...(p.revisions || [])];
      revs.push({ id: generateId(), name: name || `Rev ${revs.length + 1}`, timestamp: new Date().toISOString(), snapshot: clone({ ...p, revisions: [] }) });
      if (revs.length > 20) revs.shift();
      return { ...p, revisions: revs };
    }, `Saved revision "${name || 'untitled'}"`);
  }, [commit]);

  const restoreRevision = useCallback((revisionId) => {
    lastCoalesce.current.key = null;
    setProject(prev => {
      const rev = (prev.revisions || []).find(r => r.id === revisionId);
      if (!rev) return prev;
      const restored = { ...clone(rev.snapshot), revisions: clone(prev.revisions) };
      history.current = history.current.slice(0, idx.current + 1);
      labels.current  = labels.current.slice(0, idx.current + 1);
      history.current.push(clone(restored));
      labels.current.push(`Restored revision "${rev.name}"`);
      if (history.current.length > MAX_HISTORY) { history.current.shift(); labels.current.shift(); }
      idx.current = history.current.length - 1;
      setCanUndo(true); setCanRedo(false);
      return restored;
    });
    setHistoryVersion(v => v + 1);
  }, []);

  return {
    project, commit, softUpdate, undo, redo, canUndo, canRedo,
    loadProject, resetProject, saveRevision, restoreRevision,
    historyStack: history, historyIdx: idx, historyLabels: labels,
  };
}
