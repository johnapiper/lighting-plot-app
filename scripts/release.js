#!/usr/bin/env node
/**
 * release.js — bump version, commit, tag, push, and publish GitHub release.
 *
 * Usage:
 *   node scripts/release.js patch    # 1.0.0 → 1.0.1  (small fix / UI tweak)
 *   node scripts/release.js minor    # 1.0.0 → 1.1.0  (new feature, small addition)
 *   node scripts/release.js major    # 1.0.0 → 2.0.0  (large functional change)
 *   node scripts/release.js patch "Custom release note"
 *
 * What it does:
 *   1. Bumps version in package.json
 *   2. Runs the webpack build
 *   3. Stages all changes and commits with the version number
 *   4. Tags the commit as vX.Y.Z
 *   5. Pushes branch + tag to GitHub
 *   6. Creates a GitHub release for the tag (marked "latest")
 *   7. Force-moves the floating `latest` tag to this commit
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Helpers ──────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
}

function runSilent(cmd) {
  return run(cmd, { silent: true }).trim();
}

// ── Args ─────────────────────────────────────────────────────────────────────
const bump  = process.argv[2] || 'patch';
const note  = process.argv[3] || '';

if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error('Usage: node scripts/release.js [major|minor|patch] ["release note"]');
  process.exit(1);
}

// ── Read current version ──────────────────────────────────────────────────────
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);

let newMaj = maj, newMin = min, newPat = pat;
if (bump === 'major') { newMaj++; newMin = 0; newPat = 0; }
else if (bump === 'minor') { newMin++; newPat = 0; }
else { newPat++; }

const newVersion = `${newMaj}.${newMin}.${newPat}`;
const tag        = `v${newVersion}`;
const prevTag    = `v${pkg.version}`;

// ── Describe changes since last tag ──────────────────────────────────────────
let commitLog = '';
try {
  commitLog = runSilent(`git log ${prevTag}..HEAD --oneline`);
} catch {
  try { commitLog = runSilent('git log --oneline -20'); } catch {}
}
const bodyLines = commitLog.split('\n').filter(Boolean).slice(0, 20);
const releaseNote = note || `Release ${tag}`;

const releaseBody = [
  `## ${releaseNote}`,
  '',
  `**Version:** ${newVersion} (${bump} bump from ${pkg.version})`,
  '',
  bodyLines.length ? '### Changes since last release' : '',
  ...bodyLines.map(l => `- ${l}`),
  '',
  `Built: ${new Date().toUTCString()}`,
].filter(l => l !== undefined).join('\n');

// ── Bump version in package.json ─────────────────────────────────────────────
console.log(`\n📦 Bumping ${pkg.version} → ${newVersion} (${bump})\n`);
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ── Build webpack bundle ───────────────────────────────────────────────────────
console.log('🔨 Building webpack bundle…');
run('npm run build');

// ── Build installer ───────────────────────────────────────────────────────────
console.log('📦 Building installer…');
run('npx electron-builder --win --publish never');

// ── Git commit + tag ──────────────────────────────────────────────────────────
console.log('\n📝 Committing…');
run('git add -A');
run(`git commit -m "release: ${tag} — ${releaseNote}"`);
run(`git tag -a ${tag} -m "${tag}"`);

// ── Push ──────────────────────────────────────────────────────────────────────
console.log('\n🚀 Pushing to GitHub…');
run('git push origin HEAD');
run(`git push origin ${tag}`);

// ── Move floating `latest` tag ────────────────────────────────────────────────
console.log('\n🏷  Updating `latest` tag…');
try { run('git tag -d latest', { stdio: 'pipe' }); } catch {}
try { runSilent('git push origin :refs/tags/latest'); } catch {}
run('git tag -a latest -m "Latest release"');
run('git push origin latest');

// ── Collect installer artefacts ───────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
let installerFiles = [];
try {
  const allFiles = fs.readdirSync(distDir);
  installerFiles = allFiles
    .filter(f => /\.(exe|dmg|AppImage|deb|rpm|zip)$/.test(f))
    .map(f => path.join(distDir, f));
  if (installerFiles.length) {
    console.log(`\n📎 Found ${installerFiles.length} installer(s):`);
    installerFiles.forEach(f => console.log(`   ${path.basename(f)}`));
  }
} catch {
  console.log('⚠  No dist/ directory found — skipping installer upload.');
}

// ── GitHub Release ────────────────────────────────────────────────────────────
console.log('\n🌐 Creating GitHub release…');

// Write release body to a temp file (avoids shell quoting issues)
const tmpFile = path.join(__dirname, '_release_body.md');
fs.writeFileSync(tmpFile, releaseBody);

try {
  const attachArgs = installerFiles.map(f => `"${f}"`).join(' ');
  run(`gh release create ${tag} --title "${tag} — ${releaseNote}" --notes-file "${tmpFile}" --latest ${attachArgs}`);
} finally {
  fs.unlinkSync(tmpFile);
}

console.log(`\n✅ Released ${tag} successfully!\n`);
console.log(`   GitHub: https://github.com/${getRepoSlug()}/releases/tag/${tag}`);

function getRepoSlug() {
  try {
    const remote = runSilent('git remote get-url origin');
    const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return m ? m[1] : 'your-repo';
  } catch { return 'your-repo'; }
}
