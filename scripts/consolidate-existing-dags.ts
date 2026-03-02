#!/usr/bin/env node

/**
 * Migration script: consolidate existing separate DAGs into single head.json
 *
 * Usage:
 *   npx tsx scripts/consolidate-existing-dags.ts [--dry-run] [--backup]
 *
 * Behavior:
 * - Discovers all .roadmap/*.json DAG files (excluding head.json, head-index.json, system files)
 * - Merges them in deterministic order
 * - Preserves baseSha from existing head.json if present
 * - Writes consolidated DAG to head.json
 * - Generates head-index.json for lazy loading
 * - Creates backup of original head.json (with --backup flag)
 * - Validates merged DAG before committing (with --dry-run flag to skip write)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { discoverDAGFiles, mergeMultiWay, ConsolidationError } from '../src/lib/roadmap/dag-consolidator.ts';
import { validateCrossDAGDependencies } from '../src/lib/roadmap/cross-dag-validator.ts';
import { extractMetadataIndex } from '../src/lib/roadmap/index-extractor.ts';
import type { Graph } from '../src/protocol.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backup = args.includes('--backup');
const verbose = args.includes('--verbose') || args.includes('-v');

const repoRoot = process.cwd();
const roadmapDir = join(repoRoot, '.roadmap');
const headPath = join(roadmapDir, 'head.json');
const indexPath = join(roadmapDir, 'head-index.json');
const backupPath = join(roadmapDir, `head.json.backup-${new Date().toISOString().slice(0, 10)}`);

async function main() {
  log('Starting DAG consolidation migration...');
  log(`Repository root: ${repoRoot}`);
  log(`Dry run: ${dryRun}`);

  try {
    // Load existing head.json if present (to preserve baseSha)
    let existingBaseSha: string | undefined;
    if (existsSync(headPath)) {
      const existing = JSON.parse(readFileSync(headPath, 'utf-8')) as any;
      existingBaseSha = existing.baseSha;
      if (backup && !dryRun) {
        writeFileSync(backupPath, readFileSync(headPath, 'utf-8'));
        log(`Backed up existing head.json to ${backupPath}`);
      }
    }

    // Discover all DAG files
    log('Discovering DAG files...');
    const dagFiles = await discoverDAGFiles(repoRoot);
    log(`Found ${dagFiles.length} DAG file(s): ${dagFiles.map((d) => d.name).join(', ')}`);

    if (dagFiles.length === 0) {
      log('No DAGs found to consolidate. Exiting.');
      return;
    }

    // Merge
    log('Merging DAGs...');
    const mergeResult = mergeMultiWay(dagFiles);
    log(`Merged ${dagFiles.length} DAGs into single graph`);
    log(`Nodes in merged DAG: ${Object.keys(mergeResult.merged.nodes).length}`);
    log(`Phases detected: ${Object.keys(mergeResult.phases).length}`);

    // Preserve baseSha if it existed
    if (existingBaseSha) {
      (mergeResult.merged as any).baseSha = existingBaseSha;
      log(`Preserved baseSha: ${existingBaseSha}`);
    }

    // Validate
    log('Validating merged DAG...');
    const validation = validateCrossDAGDependencies(mergeResult);

    if (!validation.valid) {
      log(`\nValidation issues found (${validation.issues.length}):`);
      validation.issues.forEach((issue) => {
        log(`  - ${issue.type}: ${issue.message} (node: ${issue.nodeId})`);
      });

      if (!dryRun) {
        throw new Error('Validation failed. Use --dry-run to inspect issues without writing.');
      }
    } else {
      log('Validation passed!');
    }

    // Extract index
    log('Extracting metadata index...');
    const index = extractMetadataIndex(mergeResult);
    log(`Index created with ${index.entries.length} entries`);

    // Write results (unless dry-run)
    if (dryRun) {
      log('\n[DRY RUN] Would write:');
      log(`  - ${headPath} (${JSON.stringify(mergeResult.merged).length} bytes)`);
      log(`  - ${indexPath} (${JSON.stringify(index).length} bytes)`);
      log('\nNo files were modified.');
    } else {
      writeFileSync(headPath, JSON.stringify(mergeResult.merged, null, 2));
      log(`Wrote consolidated DAG to ${headPath}`);

      writeFileSync(indexPath, JSON.stringify(index, null, 2));
      log(`Wrote index to ${indexPath}`);

      log('\nMigration complete! ✅');
      log('Next steps:');
      log('  1. Review the consolidated DAG: roadmap chart');
      log('  2. Commit the changes: git add .roadmap/head.json .roadmap/head-index.json && git commit');
    }
  } catch (err: any) {
    log(`\nError: ${err.message}`);
    if (err instanceof ConsolidationError) {
      log(`Code: ${err.code}`);
      log(`Context:`, err.context);
    }
    process.exit(1);
  }
}

function log(msg: string) {
  if (verbose || !msg.startsWith('[')) {
    console.log(msg);
  }
}

main();
