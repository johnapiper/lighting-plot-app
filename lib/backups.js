'use strict';
/**
 * Rolling backups for saved project files (main process, CommonJS).
 *
 * Before a save overwrites an existing .lightplot file, the previous version is
 * copied to  <project folder>/Lighting Plot Backups/<project name>/  and only the
 * newest `keep` copies are retained. A new backup is skipped if the latest one is
 * younger than `minIntervalMs`, so rapid Ctrl+S presses don't churn the whole
 * history away.
 */
const fs = require('fs');
const path = require('path');

const BACKUP_DIR_NAME = 'Lighting Plot Backups';
const DEFAULT_KEEP = 10;
const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1000;

function backupDirFor(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(path.dirname(filePath), BACKUP_DIR_NAME, base);
}

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Backups for a project file, newest first: [{ path, name, mtimeMs, size }] */
function listBackups(filePath) {
  const dir = backupDirFor(filePath);
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter(n => n.toLowerCase().endsWith(path.extname(filePath).toLowerCase() || '.lightplot'))
    .map(n => {
      const p = path.join(dir, n);
      try { const st = fs.statSync(p); return { path: p, name: n, mtimeMs: st.mtimeMs, size: st.size }; }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? 1 : -1));
}

/**
 * Copy the current on-disk file into the backup folder (call BEFORE overwriting it).
 * Returns the backup path, or null when nothing was backed up. Never throws.
 */
function backupBeforeSave(filePath, opts = {}) {
  const keep = opts.keep ?? DEFAULT_KEEP;
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = opts.now ?? Date.now();
  try {
    if (keep <= 0 || !fs.existsSync(filePath)) return null;
    const existing = listBackups(filePath);
    if (existing[0] && now - existing[0].mtimeMs < minIntervalMs) return null;
    const dir = backupDirFor(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(filePath) || '.lightplot';
    const base = path.basename(filePath, ext);
    let dest = path.join(dir, `${base}_${stamp(new Date(now))}${ext}`);
    for (let i = 2; fs.existsSync(dest); i++) dest = path.join(dir, `${base}_${stamp(new Date(now))}-${i}${ext}`);
    fs.copyFileSync(filePath, dest);
    try { fs.utimesSync(dest, new Date(now), new Date(now)); } catch {}
    listBackups(filePath).slice(keep).forEach(b => { try { fs.unlinkSync(b.path); } catch {} });
    return dest;
  } catch {
    return null;
  }
}

module.exports = { backupBeforeSave, listBackups, backupDirFor, BACKUP_DIR_NAME, DEFAULT_KEEP, DEFAULT_MIN_INTERVAL_MS };
