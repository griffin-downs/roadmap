#!/usr/bin/env npx tsx
// FR-EXP-002: Surface manifest guard — barrel must match api-surface.explore.json exactly.
// Bidirectional: fails on missing exports AND undeclared exports.
// Run: npx tsx scripts/check-explore-surface.ts
// Exit 0 = surface stable, 1 = mismatch.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

// Extract value re-exports from barrel: export { a, b } from '...'
function extractBarrelValues(filePath: string): string[] {
  const src = readFileSync(resolve(root, filePath), 'utf-8');
  const names: string[] = [];
  for (const block of src.matchAll(/export\s*\{([^}]+)\}\s*from/g)) {
    for (const name of block[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed && !trimmed.startsWith('type ')) names.push(trimmed);
    }
  }
  return names.sort();
}

// Extract type re-exports from barrel: export type { A, B } from '...'
function extractBarrelTypes(filePath: string): string[] {
  const src = readFileSync(resolve(root, filePath), 'utf-8');
  const names: string[] = [];
  for (const block of src.matchAll(/export\s+type\s*\{([^}]+)\}\s*from/g)) {
    for (const name of block[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names.sort();
}

interface Manifest {
  package: string;
  exports: {
    observations: string[];
    interactions: string[];
    runtime: string[];
    types: string[];
  };
}

const manifest: Manifest = JSON.parse(
  readFileSync(resolve(root, 'docs/api-surface.explore.json'), 'utf-8'),
);

const barrel = 'src/index.explore.ts';
const barrelValues = extractBarrelValues(barrel);
const barrelTypes = extractBarrelTypes(barrel);

const manifestValues = [
  ...manifest.exports.observations,
  ...manifest.exports.interactions,
  ...manifest.exports.runtime,
].sort();

const manifestTypes = [...manifest.exports.types].sort();

let ok = true;

// Value exports: manifest ↔ barrel
const missingFromBarrel = manifestValues.filter((n) => !barrelValues.includes(n));
const undeclaredInBarrel = barrelValues.filter((n) => !manifestValues.includes(n));

if (missingFromBarrel.length > 0) {
  console.error(`manifest declares but barrel missing: ${missingFromBarrel.join(', ')}`);
  ok = false;
}

if (undeclaredInBarrel.length > 0) {
  console.error(`barrel exports undeclared in manifest: ${undeclaredInBarrel.join(', ')}`);
  ok = false;
}

// Type exports: manifest ↔ barrel
const missingTypes = manifestTypes.filter((n) => !barrelTypes.includes(n));
const undeclaredTypes = barrelTypes.filter((n) => !manifestTypes.includes(n));

if (missingTypes.length > 0) {
  console.error(`manifest declares types but barrel missing: ${missingTypes.join(', ')}`);
  ok = false;
}

if (undeclaredTypes.length > 0) {
  console.error(`barrel exports undeclared types: ${undeclaredTypes.join(', ')}`);
  ok = false;
}

if (ok) {
  console.log(
    `explore surface: ${manifestValues.length} values + ${manifestTypes.length} types — manifest ↔ barrel match`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
