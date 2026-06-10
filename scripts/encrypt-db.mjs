/**
 * One-shot script: encrypts licenses/database.json in-place using the same
 * AES-256-GCM key as licenseService.js.
 * Run: node scripts/encrypt-db.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

const DB_KEY_HEX = 'b4e7f23a19d08c654f2a91e3780bcd56a2f34e87c0195d6b8f72ae013c49d280';

async function main() {
  const raw = new Uint8Array(DB_KEY_HEX.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  const plain = JSON.parse(readFileSync('licenses/database.json', 'utf8'));

  // Already encrypted?
  if (plain.v === 1 && plain.iv && plain.ct) {
    console.log('database.json is already encrypted.');
    return;
  }

  const iv  = getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(JSON.stringify(plain));
  const ct  = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);

  const blob = {
    v:  1,
    iv: Buffer.from(iv).toString('base64'),
    ct: Buffer.from(new Uint8Array(ct)).toString('base64'),
  };

  writeFileSync('licenses/database.json', JSON.stringify(blob, null, 2), 'utf8');
  console.log('database.json encrypted successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
