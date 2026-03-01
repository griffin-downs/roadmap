#!/usr/bin/env npx tsx
// Migrate .specify/ → .roadmap/spec/
// Usage: npx tsx scripts/migrate-specify-to-roadmap.ts [repo-root]

import { join } from 'node:path';
import { migrateSpecifyToRoadmapSpec } from '../src/spec-kit/directory-migration.ts';

const repoRoot = process.argv[2] || join(import.meta.dirname, '..');

const report = migrateSpecifyToRoadmapSpec(repoRoot);

if (report.errors.length > 0) {
  console.error('Errors:');
  for (const err of report.errors) console.error(`  - ${err}`);
}

if (report.filesCopied.length > 0) {
  console.log(`Copied ${report.filesCopied.length} file(s) to ${report.targetDir}:`);
  for (const f of report.filesCopied) console.log(`  ${f}`);
  if (report.pathsUpdated > 0) {
    console.log(`Updated ${report.pathsUpdated} .specify/ reference(s) to .roadmap/spec/`);
  }
} else if (report.errors.length === 0) {
  console.log('No files to migrate.');
}

process.exit(report.errors.length > 0 ? 1 : 0);
