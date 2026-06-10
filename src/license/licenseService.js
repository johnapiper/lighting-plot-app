/**
 * licenseService.js
 *
 * Fetch, verify, and manage the public GitHub license database.
 *
 * Database URL:  https://raw.githubusercontent.com/johnapiper/lighting-plot-app/master/licenses/database.json
 * GitHub API:    https://api.github.com/repos/johnapiper/lighting-plot-app/contents/licenses/database.json
 *
 * Rights levels (ordered, each includes all below):
 *   developer  – full access + License Manager UI + GitHub writes
 *   standard   – full app access
 *   trial      – app access, read-only (no save/export)
 */

const REPO_OWNER  = 'johnapiper';
const REPO_NAME   = 'lighting-plot-app';
const DB_PATH     = 'licenses/database.json';
const RAW_URL     = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/master/${DB_PATH}`;
const API_URL     = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DB_PATH}`;
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 h

// ── Key hashing (SHA-256 via SubtleCrypto) ─────────────────────────────────

export async function hashKey(rawKey) {
  const normalized = rawKey.trim().toUpperCase();
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Key generator ─────────────────────────────────────────────────────────

export function generateLicenseKey() {
  const seg = () => Math.random().toString(16).slice(2, 6).toUpperCase();
  return `LPLOT-${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ── Database fetch (with 24h local cache) ─────────────────────────────────

export async function fetchDatabase() {
  // Try cache first
  try {
    const cached = JSON.parse(localStorage.getItem('lplot_license_db') || 'null');
    if (cached && Date.now() - cached._fetchedAt < CACHE_TTL) {
      return cached;
    }
  } catch {}

  const res = await fetch(RAW_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not fetch license database (HTTP ${res.status})`);
  const db = await res.json();
  db._fetchedAt = Date.now();
  localStorage.setItem('lplot_license_db', JSON.stringify(db));
  return db;
}

// Force a fresh fetch (called after writing)
export function invalidateCache() {
  localStorage.removeItem('lplot_license_db');
}

// ── Key verification ───────────────────────────────────────────────────────

export async function verifyKey(rawKey, db) {
  const hash = await hashKey(rawKey);
  const normalized = rawKey.trim().toUpperCase();

  // Match by hash first, fall back to plain-text key for the initial dev key
  const entry = db.licenses.find(
    l => l.keyHash === hash || l.key === normalized
  );

  if (!entry)         return { valid: false, reason: 'Key not found.' };
  if (!entry.active)  return { valid: false, reason: 'License has been revoked.' };

  const expiry = new Date(entry.expiresAt);
  if (expiry < new Date()) return { valid: false, reason: `License expired on ${entry.expiresAt}.` };

  return {
    valid:    true,
    rights:   entry.rights,
    name:     entry.name,
    email:    entry.email,
    expiresAt: entry.expiresAt,
    entry,
  };
}

// ── Rights helpers ─────────────────────────────────────────────────────────

const RIGHTS_ORDER = ['trial', 'standard', 'developer'];

export function hasRights(licenseInfo, required) {
  if (!licenseInfo?.valid) return false;
  return RIGHTS_ORDER.indexOf(licenseInfo.rights) >= RIGHTS_ORDER.indexOf(required);
}

// ── GitHub write (requires a PAT with repo write scope) ───────────────────

export async function writeDatabase(db, githubToken) {
  // Get current file SHA (required by GitHub API for updates)
  const headRes = await fetch(API_URL, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!headRes.ok) throw new Error(`GitHub API error fetching file SHA (${headRes.status})`);
  const { sha } = await headRes.json();

  // Strip internal cache key before writing
  const toWrite = { ...db };
  delete toWrite._fetchedAt;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(toWrite, null, 2))));

  const putRes = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'chore: update license database',
      content,
      sha,
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.message || `GitHub write failed (${putRes.status})`);
  }

  invalidateCache();
  return true;
}

// ── Add / revoke license (returns updated db, does NOT write — call writeDatabase separately) ──

export async function addLicense(db, { name, email, rights, expiresAt, notes }) {
  const key  = generateLicenseKey();
  const hash = await hashKey(key);
  const entry = {
    key,
    keyHash:   hash,
    name:      name || '',
    email:     email || '',
    rights:    rights || 'standard',
    expiresAt: expiresAt || '',
    createdAt: new Date().toISOString().slice(0, 10),
    active:    true,
    notes:     notes || '',
  };
  return {
    newDb: { ...db, licenses: [...db.licenses, entry] },
    newKey: key,
    entry,
  };
}

export function revokeLicense(db, key) {
  return {
    ...db,
    licenses: db.licenses.map(l =>
      l.key === key ? { ...l, active: false } : l
    ),
  };
}

export function updateLicense(db, key, patch) {
  return {
    ...db,
    licenses: db.licenses.map(l =>
      l.key === key ? { ...l, ...patch } : l
    ),
  };
}
