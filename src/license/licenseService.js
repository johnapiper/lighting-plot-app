/**
 * licenseService.js
 *
 * Fetch, verify, and manage the public GitHub license database.
 *
 * Database URL:  https://raw.githubusercontent.com/johnapiper/lighting-plot-app/master/licenses/database.json
 * GitHub API:    https://api.github.com/repos/johnapiper/lighting-plot-app/contents/licenses/database.json
 *
 * Rights model:
 *   - Each license has a `rights` array of group IDs (e.g. ["developer", "trial"])
 *   - Each group in `db.rightsGroups` lists the feature IDs it enables
 *   - A license holder can use any feature enabled by ANY of their groups
 */

import { ALL_FEATURE_IDS } from './features';

const REPO_OWNER  = 'johnapiper';
const REPO_NAME   = 'lighting-plot-app';
const DB_PATH     = 'licenses/database.json';
const RAW_URL     = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/master/${DB_PATH}`;
const API_URL     = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DB_PATH}`;
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 h
// Bump this whenever the cache format changes to force all clients to re-fetch
const CACHE_VERSION = 2;

// ── Database encryption (AES-256-GCM) ─────────────────────────────────────
// The key is embedded in the app binary. This keeps the GitHub file opaque to
// casual inspection. License keys are still SHA-256 hashed, so extracting this
// key from the binary does not allow forging licenses.
const DB_KEY_HEX = 'b4e7f23a19d08c654f2a91e3780bcd56a2f34e87c0195d6b8f72ae013c49d280';

let _cryptoKey = null;
async function getCryptoKey() {
  if (_cryptoKey) return _cryptoKey;
  const raw = new Uint8Array(DB_KEY_HEX.match(/.{2}/g).map(h => parseInt(h, 16)));
  _cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return _cryptoKey;
}

async function encryptDb(plainObj) {
  const key = await getCryptoKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(JSON.stringify(plainObj));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return {
    v:  1,
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

async function decryptDb(blob) {
  // Legacy plaintext (before encryption was introduced)
  if (blob.licenses || blob.rightsGroups) return blob;
  if (blob.v !== 1) throw new Error('Unrecognised database format.');
  const key = await getCryptoKey();
  const iv  = new Uint8Array(atob(blob.iv).split('').map(c => c.charCodeAt(0)));
  const ct  = new Uint8Array(atob(blob.ct).split('').map(c => c.charCodeAt(0)));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

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
  try {
    const cached = JSON.parse(localStorage.getItem('lplot_license_db') || 'null');
    if (cached && cached._cacheVersion === CACHE_VERSION && Date.now() - cached._fetchedAt < CACHE_TTL) return cached;
  } catch {}

  const res = await fetch(`${RAW_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not fetch license database (HTTP ${res.status})`);
  const blob = await res.json();
  const db = await decryptDb(blob);
  if (!db || typeof db !== 'object') throw new Error('License database is corrupt or unreadable.');
  if (!db.licenses) db.licenses = [];
  if (!db.rightsGroups) db.rightsGroups = [];
  db._fetchedAt = Date.now();
  db._cacheVersion = CACHE_VERSION;
  localStorage.setItem('lplot_license_db', JSON.stringify(db));
  return db;
}

export function invalidateCache() {
  localStorage.removeItem('lplot_license_db');
}

// ── Coerce legacy string rights to array ──────────────────────────────────

function toRightsArray(rights) {
  if (!rights) return [];
  if (Array.isArray(rights)) return rights;
  return [rights]; // backward compat: "developer" → ["developer"]
}

// ── Key verification ───────────────────────────────────────────────────────

export async function verifyKey(rawKey, db) {
  const hash = await hashKey(rawKey);
  const normalized = rawKey.trim().toUpperCase();

  const licenses = db?.licenses || [];
  const entry = licenses.find(
    l => l.keyHash === hash || l.key === normalized
  );

  if (!entry)        return { valid: false, reason: 'Key not found.' };
  if (!entry.active) return { valid: false, reason: 'License has been revoked.' };

  const expiry = new Date(entry.expiresAt);
  if (expiry < new Date()) return { valid: false, reason: `License expired on ${entry.expiresAt}.` };

  const rights = toRightsArray(entry.rights);
  const features = resolveFeatures(rights, db.rightsGroups || []);

  return {
    valid:    true,
    rights,
    features,
    name:     entry.name,
    email:    entry.email,
    expiresAt: entry.expiresAt,
    entry,
  };
}

// ── Feature resolution ─────────────────────────────────────────────────────

/**
 * Given an array of group IDs and the DB's rightsGroups list,
 * return the set of feature IDs this license holder can use.
 */
export function resolveFeatures(rights, rightsGroups) {
  const granted = new Set();
  for (const groupId of rights) {
    // A developer/admin group always grants the full feature set, including
    // features added in later app versions (so updates never lock them out).
    if (groupId === 'developer' || groupId === 'admin') {
      ALL_FEATURE_IDS.forEach(f => granted.add(f));
      continue;
    }
    const group = rightsGroups.find(g => g.id === groupId);
    if (!group) continue;
    // A group may use the "*" wildcard to mean "grant everything".
    if ((group.features || []).includes('*')) {
      ALL_FEATURE_IDS.forEach(f => granted.add(f));
      continue;
    }
    for (const f of (group.features || [])) granted.add(f);
  }
  return [...granted];
}

/**
 * Check if a verified license result grants a specific feature.
 */
export function hasFeature(licenseResult, featureId) {
  if (!licenseResult?.valid) return false;
  return (licenseResult.features || []).includes(featureId);
}

// ── GitHub write (requires a PAT with repo write scope) ───────────────────

export async function writeDatabase(db, githubToken) {
  const headRes = await fetch(API_URL, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!headRes.ok) throw new Error(`GitHub API error fetching file SHA (${headRes.status})`);
  const { sha } = await headRes.json();

  const toWrite = { ...db };
  delete toWrite._fetchedAt;

  const encrypted = await encryptDb(toWrite);
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(encrypted))));

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

// ── License CRUD (returns updated db — call writeDatabase separately) ──────

export async function addLicense(db, { name, email, rights, expiresAt, notes, maxSeats }) {
  const key  = generateLicenseKey();
  const hash = await hashKey(key);
  const entry = {
    key,
    keyHash:   hash,
    name:      name || '',
    email:     email || '',
    rights:    Array.isArray(rights) ? rights : (rights ? [rights] : ['standard']),
    expiresAt: expiresAt || '',
    createdAt: new Date().toISOString().slice(0, 10),
    active:    true,
    notes:     notes || '',
    maxSeats:  parseInt(maxSeats, 10) || 1,
  };
  return {
    newDb:  { ...db, licenses: [...db.licenses, entry] },
    newKey: key,
    entry,
  };
}

export function revokeLicense(db, key) {
  return {
    ...db,
    licenses: db.licenses.map(l => l.key === key ? { ...l, active: false } : l),
  };
}

export function deleteLicense(db, key) {
  return { ...db, licenses: db.licenses.filter(l => l.key !== key) };
}

export function updateLicense(db, key, patch) {
  return {
    ...db,
    licenses: db.licenses.map(l => l.key === key ? { ...l, ...patch } : l),
  };
}

// ── Rights group CRUD ──────────────────────────────────────────────────────

export function addRightsGroup(db, { id, name, features }) {
  const groups = db.rightsGroups || [];
  if (groups.find(g => g.id === id)) throw new Error(`Group ID "${id}" already exists.`);
  return { ...db, rightsGroups: [...groups, { id, name, features: features || [] }] };
}

export function updateRightsGroup(db, id, patch) {
  return {
    ...db,
    rightsGroups: (db.rightsGroups || []).map(g => g.id === id ? { ...g, ...patch } : g),
  };
}

export function deleteRightsGroup(db, id) {
  return {
    ...db,
    rightsGroups: (db.rightsGroups || []).filter(g => g.id !== id),
    // Strip this group from any licenses that reference it
    licenses: (db.licenses || []).map(l => ({
      ...l,
      rights: toRightsArray(l.rights).filter(r => r !== id),
    })),
  };
}
