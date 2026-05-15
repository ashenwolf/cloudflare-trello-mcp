#!/usr/bin/env node
/**
 * Workaround for an npm 10 lockfile bug.
 *
 * When npm install runs on certain platforms, lockfile entries for
 * platform-specific optional binaries (esbuild/sharp/rollup native binaries
 * etc.) are written with `extraneous: true` instead of `optional: true`.
 * Without the optional flag, `npm ci` strictly tries to install ALL listed
 * packages and fails with EBADPLATFORM when the OS/CPU doesn't match
 * (e.g. trying to install @esbuild/aix-ppc64 on Cloudflare's Linux x64 CI).
 *
 * This script walks `package-lock.json`, finds every entry with both `cpu`
 * and `os` constraints that is currently marked `extraneous: true`, and
 * converts the flag. Such entries are by definition platform-specific
 * native binaries and are always optional — the heuristic cannot produce
 * false positives.
 *
 * Run after every `npm install` until the upstream npm bug is fixed:
 *   npm run lockfile:fix
 *
 * Track upstream fix: https://github.com/npm/cli/issues/7447
 */

import { readFileSync, writeFileSync } from 'node:fs';

const path = './package-lock.json';

let lock;
try {
  lock = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  console.error(`Cannot read ${path}: ${err.message}`);
  process.exit(1);
}

if (!lock.packages) {
  console.log('No `packages` map found — nothing to fix (lockfileVersion 1?).');
  process.exit(0);
}

let fixed = 0;
for (const pkg of Object.values(lock.packages)) {
  if (pkg.cpu && pkg.os && pkg.extraneous) {
    delete pkg.extraneous;
    pkg.optional = true;
    fixed++;
  }
}

if (fixed > 0) {
  writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');
  console.log(`Fixed ${fixed} platform-specific entries in package-lock.json`);
} else {
  console.log('No fixes needed — lockfile is clean.');
}
