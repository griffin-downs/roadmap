#!/usr/bin/env node

/**
 * Roadmap state validator for pre-commit hook
 *
 * Runs when .roadmap/ files are staged, validates:
 * - head.json is valid JSON and passes protocol validation
 * - If .roadmap/*.json files changed, regenerates head-index.json
 * - Ensures no stale state is committed
 *
 * Exit codes:
 *   0 = valid
 *   1 = validation error
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { define } from '../src/protocol.ts';
import { extractMetadataIndex } from '../src/lib/roadmap/index-extractor.ts';
import { mergeMultiWay, discoverDAGFiles } from '../src/lib/roadmap/dag-consolidator.ts';
import type { Graph } from '../src/protocol.ts';

const repoRoot = process.cwd();
const roadmapDir = join(repoRoot, '.roadmap');
const headPath = join(roadmapDir, 'head.json');
const indexPath = join(roadmapDir, 'head-index.json');

async function main() {
  try {
    // Check if .roadmap/head.json is staged
    const stagedFiles = getStagedFiles();
    const hasHeadChanges = stagedFiles.some((f) => f.includes('.roadmap/head.json'));
    const hasDagChanges = stagedFiles.some(
      (f) =>
        f.includes('.roadmap/') &&
        f.endsWith('.json') &&
        !f.includes('head.json') &&
        !f.includes('head-index.json')
    );

    if (!hasHeadChanges && !hasDagChanges) {
      return; // No roadmap changes, skip
    }

    // Validate head.json structure
    if (existsSync(headPath)) {
      let dag: Graph<string>;
      try {
        const content = readFileSync(headPath, 'utf-8');
        dag = JSON.parse(content);
      } catch (err) {
        throw new Error(`head.json is not valid JSON: ${err}`);
      }

      // Validate against protocol
      try {
        define(dag);
      } catch (err: any) {
        throw new Error(`head.json is invalid according to protocol: ${err.message}`);
      }

      // If DAG files changed, ensure index exists and is current
      if (hasDagChanges) {
        await updateIndexIfNeeded();
      }

      console.log('[roadmap] Validation passed ✅');
    } else {
      throw new Error('.roadmap/head.json not found');
    }
  } catch (err: any) {
    console.error(`[roadmap] Validation failed: ${err.message}`);
    process.exit(1);
  }
}

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output.trim().split('\n').filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

async function updateIndexIfNeeded() {
  try {
    const dagFiles = await discoverDAGFiles(repoRoot);
    if (dagFiles.length === 0) return;

    const mergeResult = mergeMultiWay(dagFiles);
    const index = extractMetadataIndex(mergeResult);

    // Check if index is stale
    const indexStaged = getStagedFiles().some((f) => f.includes('head-index.json'));

    if (!indexStaged) {
      // Index not staged but DAGs changed - regenerate and stage it
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
      execSync(`git add ${indexPath}`);
      console.log('[roadmap] Regenerated and staged head-index.json');
    } else {
      // Index is staged - verify it's valid
      const indexContent = readFileSync(indexPath, 'utf-8');
      try {
        JSON.parse(indexContent);
      } catch (err) {
        throw new Error(`head-index.json is not valid JSON: ${err}`);
      }
    }
  } catch (err: any) {
    throw new Error(`Index validation failed: ${err.message}`);
  }
}

main();
