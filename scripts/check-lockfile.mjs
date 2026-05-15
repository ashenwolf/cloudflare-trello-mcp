#!/usr/bin/env node
/**
 * Validation companion to `fix-lockfile.mjs`.
 *
 * Exits with code 1 if `package-lock.json` contains any platform-specific
 * binaries (entries with both `cpu` and `os` constraints) that are
 * mislabeled `extraneous: true` instead of `optional: true`. This is the
 * exact condition that causes Cloudflare's `npm ci` to fail with
 * EBADPLATFORM on the wrong platform.
 *
 * Use as a pre-commit guard, in CI, or after every `npm install`:
 *   npm run lockfile:check
 *
 * If it fails, run `npm run lockfile:fix` to remediate.
 */

import { readFileSync } from 'node:fs';

const path = './package-lock.json';

let lock;
try {
  lock = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  console.error(`Cannot read ${path}: ${err.message}`);
  process.exit(1);
}

if (!lock.packages) {
  console.log('No `packages` map found — nothing to check (lockfileVersion 1?).');
  process.exit(0);
}

const broken = Object.entries(lock.packages)
  .filter(([, v]) => v.extraneous && v.cpu && v.os)
  .map(([k]) => k);

if (broken.length === 0) {
  console.log('package-lock.json is clean.');
  process.exit(0);
}

console.error(`package-lock.json has ${broken.length} mislabeled platform-specific binaries:`);
for (const name of broken) console.error(`  - ${name}`);
console.error('\nRun `npm run lockfile:fix` to remediate.');
process.exit(1);
