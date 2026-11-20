import { useEffect } from 'react';
import { ipcRenderer } from '../bridge';

/**
 * Auto-save: ~5 s after the last change, while there are unsaved edits, write the
 * project to the recovery file (see RecoveryDialog). Not in trial mode, and paused
 * while a recovery decision is pending so it can't overwrite the recovered copy.
 */
export function useAutosaveWriter({ project, dirty, currentFile, enabled, canAutoSave, isTrial, recovery }) {
  useEffect(() => {
    if (isTrial || !enabled || !ipcRenderer || !canAutoSave || !dirty || recovery) return;
    const id = setTimeout(() => {
      ipcRenderer.invoke('autosave-write', JSON.stringify({
        autosaveVersion: 2, savedAt: new Date().toISOString(), currentFile, project,
      }));
    }, 5000);
    return () => clearTimeout(id);
  }, [project, dirty, currentFile, enabled, canAutoSave, isTrial, recovery]);
}
