import { describe, it, expect } from 'vitest';
import {
  captureView, applyViewToLayers, layersForViewport, matchingView, uniqueViewName,
  addView, renameView, deleteView, recaptureView,
} from '../src/views/views';
import { migrateProject, initialProject } from '../src/store/model';

const layers = () => [
  { id: 'bg', name: 'Background', visible: true },
  { id: 'arch', name: 'Architecture', visible: true },
  { id: 'lx', name: 'Lighting', visible: true },
];

describe('views', () => {
  it('captures the current visibility', () => {
    const ls = layers(); ls[1].visible = false;
    const v = captureView(ls, '  FOH only ');
    expect(v.name).toBe('FOH only');
    expect(v.layers).toEqual({ bg: true, arch: false, lx: true });
    expect(v.id).toBeTruthy();
  });

  it('applies a view without touching layers it does not mention, and returns the same array when nothing changes', () => {
    const ls = layers();
    const view = { id: 'v', name: 'x', layers: { bg: false, lx: true } };
    const out = applyViewToLayers(ls, view);
    expect(out.map(l => l.visible)).toEqual([false, true, true]);     // arch untouched
    expect(out[0]).not.toBe(ls[0]);
    expect(ls[0].visible).toBe(true);                                 // input not mutated
    expect(applyViewToLayers(out, view)).toBe(out);                    // idempotent, same reference
    expect(applyViewToLayers(ls, null)).toBe(ls);
  });

  it('viewports use their view, fall back to the plot, and survive a deleted view', () => {
    const ls = layers();
    const views = [{ id: 'v1', name: 'Lighting only', layers: { bg: false, arch: false, lx: true } }];
    expect(layersForViewport(ls, views, undefined)).toBe(ls);
    expect(layersForViewport(ls, views, 'v1').map(l => l.visible)).toEqual([false, false, true]);
    expect(layersForViewport(ls, views, 'gone')).toBe(ls);
  });

  it('finds the view that matches the current layers', () => {
    const views = [
      { id: 'a', name: 'A', layers: { bg: true, arch: true, lx: true } },
      { id: 'b', name: 'B', layers: { bg: false, arch: false, lx: true } },
    ];
    const ls = layers();
    expect(matchingView(ls, views).id).toBe('a');
    ls[0].visible = false; ls[1].visible = false;
    expect(matchingView(ls, views).id).toBe('b');
    ls[2].visible = false;
    expect(matchingView(ls, views)).toBeNull();
    expect(matchingView(ls, [])).toBeNull();
  });

  it('makes names unique', () => {
    const views = [{ name: 'Focus' }, { name: 'focus 2' }];
    expect(uniqueViewName(views, 'Power')).toBe('Power');
    expect(uniqueViewName(views, 'focus')).toBe('focus 3');
    expect(uniqueViewName([], '')).toBe('View');
  });

  it('adds, renames, deletes and recaptures immutably', () => {
    let views = [];
    const v = captureView(layers(), 'One');
    views = addView(views, v);
    expect(views).toHaveLength(1);
    expect(renameView(views, v.id, ' Two ')[0].name).toBe('Two');
    expect(renameView(views, v.id, '   ')[0].name).toBe('One');       // blank keeps the old name
    const ls = layers(); ls[2].visible = false;
    expect(recaptureView(views, v.id, ls)[0].layers.lx).toBe(false);
    expect(views[0].layers.lx).toBe(true);                             // original untouched
    expect(deleteView(views, v.id)).toEqual([]);
  });

  it('projects load with an empty views list', () => {
    expect(initialProject.views).toEqual([]);
    expect(migrateProject({ drawings: [{ id: 'd', pipes: [], fixtures: [] }], meta: {} }).views).toEqual([]);
    const kept = migrateProject({ drawings: [{ id: 'd', pipes: [], fixtures: [] }], meta: {}, views: [{ id: 'x', name: 'Keep', layers: {} }] });
    expect(kept.views).toHaveLength(1);
  });
});
