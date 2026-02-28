#!/usr/bin/env npx tsx
// FR-EXP-001: Export surface invariant — barrel must re-export every public symbol from source modules.
// Run: npx tsx scripts/check-explore-exports.ts
// Exits 0 if complete, 1 if mismatch.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

function extractExports(filePath: string): string[] {
  const src = readFileSync(resolve(root, filePath), 'utf-8');
  const names: string[] = [];
  // Match: export async function NAME, export function NAME, export class NAME, export const NAME
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)) {
    names.push(m[1]);
  }
  return names.sort();
}

function extractBarrelReexports(filePath: string): string[] {
  const src = readFileSync(resolve(root, filePath), 'utf-8');
  const names: string[] = [];
  // Match named re-exports: export { a, b, c } from '...'
  for (const block of src.matchAll(/export\s*\{([^}]+)\}\s*from/g)) {
    for (const name of block[1].split(',')) {
      const trimmed = name.trim();
      if (trimmed && !trimmed.startsWith('type ')) names.push(trimmed);
    }
  }
  return names.sort();
}

const sources: Record<string, string> = {
  'explore-helpers': 'src/lib/explore-helpers.ts',
  'explore-interactions': 'src/lib/explore-interactions.ts',
};

const barrel = 'src/index.explore.ts';
const barrelExports = extractBarrelReexports(barrel);

let ok = true;

for (const [label, path] of Object.entries(sources)) {
  const srcExports = extractExports(path);
  const missing = srcExports.filter((n) => !barrelExports.includes(n));

  if (missing.length > 0) {
    console.error(`[${label}] missing from barrel: ${missing.join(', ')}`);
    ok = false;
  }
}

if (ok) {
  const total = barrelExports.length;
  console.log(`explore barrel: ${total} exports, surface complete`);
  process.exit(0);
} else {
  process.exit(1);
}
