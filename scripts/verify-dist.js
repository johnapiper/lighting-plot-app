#!/usr/bin/env node
/**
 * verify-dist.js
 *
 * Guards against the auto-updater "sha512 checksum mismatch" failure by
 * confirming that every file listed in dist/latest.yml actually exists in
 * dist/ and matches the recorded sha512 + size BEFORE the release is
 * published. Exits non-zero on any mismatch so a bad build can't ship.
 *
 * Run automatically after `npm run dist:win` (see package.json), or manually:
 *   npm run verify-dist
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir  = path.join(__dirname, '..', 'dist');
const ymlPath  = path.join(distDir, 'latest.yml');

function fail(msg) {
  console.error(`\n❌ verify-dist: ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(ymlPath)) fail(`dist/latest.yml not found — run "npm run dist:win" first.`);

const yml = fs.readFileSync(ymlPath, 'utf8');

// Minimal YAML extraction — latest.yml is a flat, predictable shape produced by
// electron-builder, so we parse the fields we need with regexes rather than
// pulling in a YAML dependency.
function sha512Base64(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha512').update(buf).digest('base64');
}

// Collect every "url + sha512 + size" triple from the files: list.
const fileEntries = [];
const fileBlockRe = /-\s+url:\s*(.+)\s*\n\s*sha512:\s*(.+)\s*\n\s*size:\s*(\d+)/g;
let m;
while ((m = fileBlockRe.exec(yml)) !== null) {
  fileEntries.push({ url: m[1].trim(), sha512: m[2].trim(), size: Number(m[3].trim()) });
}

// Also verify the top-level path/sha512 pair (electron-updater reads this too).
const topPath   = (yml.match(/^path:\s*(.+)$/m)   || [])[1]?.trim();
const topSha512 = (yml.match(/^sha512:\s*(.+)$/m) || [])[1]?.trim();
if (topPath && topSha512 && !fileEntries.some(e => e.url === topPath)) {
  fileEntries.push({ url: topPath, sha512: topSha512, size: null });
}

if (fileEntries.length === 0) fail('Could not parse any file entries from latest.yml.');

let ok = true;
for (const entry of fileEntries) {
  const filePath = path.join(distDir, entry.url);
  if (!fs.existsSync(filePath)) { console.error(`  ✗ ${entry.url}: file missing in dist/`); ok = false; continue; }

  const actualSha = sha512Base64(filePath);
  const actualSize = fs.statSync(filePath).size;

  const shaOk  = actualSha === entry.sha512;
  const sizeOk = entry.size == null || actualSize === entry.size;

  if (shaOk && sizeOk) {
    console.log(`  ✓ ${entry.url} (sha512 + size match)`);
  } else {
    ok = false;
    if (!shaOk)  console.error(`  ✗ ${entry.url}: sha512 mismatch\n      latest.yml: ${entry.sha512}\n      actual:     ${actualSha}`);
    if (!sizeOk) console.error(`  ✗ ${entry.url}: size mismatch — latest.yml ${entry.size}, actual ${actualSize}`);
  }
}

if (!ok) fail('dist artifacts do NOT match latest.yml — do not publish this build. Rebuild with "npm run dist:win" and re-verify.');

console.log('\n✅ verify-dist: all artifacts match latest.yml. Safe to publish.\n');
