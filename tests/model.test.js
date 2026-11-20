import { describe, it, expect } from 'vitest';
import {
  migrateProject, checkSchemaVersion, initialProject, CURRENT_SCHEMA_VERSION, makeDrawing, DEFAULT_LAYERS,
} from '../src/store/model';

const clone = o => JSON.parse(JSON.stringify(o));

describe('migrateProject', () => {
  it('upgrades the old flat format into drawings + a sheet', () => {
    const old = { pipes: [{ id: 'p1' }], fixtures: [{ id: 'f1' }], meta: { title: 'Old' } };
    const m = migrateProject(clone(old));
    expect(m.drawings).toHaveLength(1);
    expect(m.drawings[0].pipes).toEqual([{ id: 'p1' }]);
    expect(m.drawings[0].fixtures).toEqual([{ id: 'f1' }]);
    expect(m.sheets).toHaveLength(1);
    expect(m.sheets[0].viewports[0].drawingId).toBe(m.drawings[0].id);
  });

  it('moves drawing annotations to the sheet', () => {
    const d = makeDrawing('d1', 'P'); d.annotations = [{ id: 'an1' }];
    const m = migrateProject({ drawings: [d], meta: {} });
    expect(m.sheets[0].annotations).toEqual([{ id: 'an1' }]);
    expect(m.drawings[0].annotations).toBeUndefined();
  });

  it('fills in missing arrays and studio heights', () => {
    const m = migrateProject({ drawings: [{ id: 'd1', pipes: [], fixtures: [] }], sheets: [{ id: 's1' }], meta: {} });
    const d = m.drawings[0];
    expect(d.infrastructure).toEqual([]);
    expect(d.cables).toEqual([]);
    expect(d.polylines).toEqual([]);
    expect(m.sheets[0].keyBlocks).toEqual([]);
    expect(m.meta.gridHeight).toBe(6000);
    expect(m.meta.rigHeight).toBe(5500);
    expect(m.layers).toEqual(DEFAULT_LAYERS);
  });

  it('stamps the current schema version and is idempotent', () => {
    const once = migrateProject(clone({ ...initialProject, schemaVersion: undefined }));
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const twice = migrateProject(clone(once));
    expect(twice).toEqual(once);
  });
});

describe('checkSchemaVersion', () => {
  it('treats unversioned and current files as ok', () => {
    expect(checkSchemaVersion({})).toBe('ok');
    expect(checkSchemaVersion({ schemaVersion: CURRENT_SCHEMA_VERSION })).toBe('ok');
  });
  it('flags files from a newer build', () => {
    expect(checkSchemaVersion({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toBe('newer');
  });
});
