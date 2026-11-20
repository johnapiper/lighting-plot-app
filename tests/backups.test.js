import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { backupBeforeSave, listBackups, backupDirFor } = require('../lib/backups.js');

let dir, file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lplot-bk-'));
  file = path.join(dir, 'My Show.lightplot');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('rolling backups', () => {
  it('does nothing when the file does not exist yet', () => {
    expect(backupBeforeSave(file)).toBeNull();
  });

  it('copies the previous version into the backup folder', () => {
    fs.writeFileSync(file, 'v1');
    const b = backupBeforeSave(file, { now: Date.now() });
    expect(b).toBeTruthy();
    expect(path.dirname(b)).toBe(backupDirFor(file));
    expect(fs.readFileSync(b, 'utf8')).toBe('v1');
  });

  it('skips a backup when the latest one is recent', () => {
    fs.writeFileSync(file, 'v1');
    const t = Date.now();
    expect(backupBeforeSave(file, { now: t })).toBeTruthy();
    expect(backupBeforeSave(file, { now: t + 60_000 })).toBeNull();
    expect(listBackups(file)).toHaveLength(1);
  });

  it('keeps only the newest N backups', () => {
    fs.writeFileSync(file, 'x');
    const t0 = Date.now() - 100 * 3600_000;
    for (let i = 0; i < 6; i++) backupBeforeSave(file, { now: t0 + i * 3600_000, keep: 3 });
    const kept = listBackups(file);
    expect(kept).toHaveLength(3);
    expect(kept[0].mtimeMs).toBeGreaterThan(kept[2].mtimeMs);
  });

  it('is disabled when keep is 0', () => {
    fs.writeFileSync(file, 'x');
    expect(backupBeforeSave(file, { keep: 0 })).toBeNull();
  });
});
