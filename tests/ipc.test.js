import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(js|jsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Pull a string-array literal like  const SEND = [ 'a', 'b' ];  out of preload.js
function listFrom(src, name) {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(src);
  if (!m) throw new Error(`${name} not found in preload.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const preload = read('preload.js');
const main = read('main.js');
const SEND = listFrom(preload, 'SEND');
const INVOKE = listFrom(preload, 'INVOKE');
const RECEIVE = listFrom(preload, 'RECEIVE');

const renderer = walk('src').map(f => ({ f, text: read(f) }));

describe('preload IPC allow-lists', () => {
  it('has no duplicates', () => {
    for (const l of [SEND, INVOKE, RECEIVE]) expect(new Set(l).size).toBe(l.length);
  });

  it('SEND matches every ipcMain.on handler', () => {
    const handlers = [...main.matchAll(/ipcMain\.on\('([^']+)'/g)].map(m => m[1]);
    expect([...SEND].sort()).toEqual([...handlers].sort());
  });

  it('INVOKE matches every ipcMain.handle handler', () => {
    const handlers = [...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1]);
    expect([...INVOKE].sort()).toEqual([...handlers].sort());
  });

  it('every channel the renderer sends or invokes is allowed', () => {
    const missing = [];
    for (const { f, text } of renderer) {
      for (const m of text.matchAll(/ipcRenderer\??\.(send|invoke)\(\s*'([^']+)'/g)) {
        const list = m[1] === 'send' ? SEND : INVOKE;
        if (!list.includes(m[2])) missing.push(`${f}: ${m[1]} '${m[2]}'`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every channel the renderer listens on is allowed', () => {
    const missing = [];
    for (const { f, text } of renderer) {
      for (const m of text.matchAll(/ipcRenderer\??\.(?:on|removeListener)\(\s*'([^']+)'/g)) {
        if (!RECEIVE.includes(m[1])) missing.push(`${f}: '${m[1]}'`);
      }
    }
    // App.jsx registers its handler table dynamically: keys like 'menu-undo': ...
    const app = read('src/App.jsx');
    const block = app.slice(app.indexOf('const handlers = {'), app.indexOf('Object.entries(handlers)'));
    for (const m of block.matchAll(/'([a-z][a-z-]+)'\s*:/g)) {
      if (!RECEIVE.includes(m[1])) missing.push(`App handlers: '${m[1]}'`);
    }
    expect(missing).toEqual([]);
  });

  it('every channel main pushes to the renderer is allowed', () => {
    const sent = [...main.matchAll(/(?:webContents\.send|event\.reply)\(\s*'([^']+)'/g)].map(m => m[1]);
    expect(sent.filter(c => !RECEIVE.includes(c))).toEqual([]);
  });
});

describe('renderer has no direct Node access', () => {
  it('does not require electron, fs, path or https', () => {
    const offenders = [];
    for (const { f, text } of renderer) {
      if (/\b(?:window\.)?require\(\s*['"](?:electron|fs|path|https|http|child_process|os)['"]\s*\)/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('main window is locked down', () => {
    expect(main).toMatch(/nodeIntegration:\s*false/);
    expect(main).toMatch(/contextIsolation:\s*true/);
    expect(main).toMatch(/sandbox:\s*true/);
    expect(main).not.toMatch(/nodeIntegration:\s*true/);
  });
});
