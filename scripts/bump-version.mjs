#!/usr/bin/env node
/**
 * Bump semver in package.json + ae-panel/CSXS/manifest.xml
 * Usage: node scripts/bump-version.mjs [patch|minor|major]
 * Default: patch
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kind = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: node scripts/bump-version.mjs [patch|minor|major]');
  process.exit(1);
}

function bump(v, which) {
  const [maj, min, pat] = v.split('.').map((n) => parseInt(n, 10) || 0);
  if (which === 'major') return `${maj + 1}.0.0`;
  if (which === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const from = pkg.version || '0.0.0';
const to = bump(from, kind);
pkg.version = to;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const manifestPath = join(root, 'ae-panel', 'CSXS', 'manifest.xml');
let xml = readFileSync(manifestPath, 'utf8');
xml = xml
  .replace(/ExtensionBundleVersion="[^"]*"/, `ExtensionBundleVersion="${to}"`)
  .replace(
    /<Extension Id="com\.cleanplatefx\.ftrack\.panel" Version="[^"]*" \/>/,
    `<Extension Id="com.cleanplatefx.ftrack.panel" Version="${to}" />`,
  );
writeFileSync(manifestPath, xml);

console.log(`${from} -> ${to} (${kind})`);
