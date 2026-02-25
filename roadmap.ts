#!/usr/bin/env node
// Git-native roadmap query script
//
// roadmap.ts is now a query interface, not a definition file.
// Current DAG is stored in .roadmap/head.json (git-tracked).
// roadmap.ts reads it, validates it, and outputs documentation + reconciliation manifest.
//
// Run:
//   node roadmap.ts                    # Show current roadmap + docs
//   node roadmap.ts --export-manifest  # JSON manifest for adoption
//   node roadmap.ts --list-checkpoints # Show roadmap history
//   node roadmap.ts --advance          # Advance to next node (requires commit)

import { readHeadDAG, getReconciliationManifest, listCheckpoints } from './.roadmap/query.ts';
import { generateREADME, generateSKILL, generateSPEC } from './.roadmap/docs-gen.ts';
import { check, verify, orient, validateNode, validateGraph } from './src/protocol.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const command = process.argv[2] || '--show';

async function main() {
  try {
    const dag = await readHeadDAG(repoRoot);

    // Validate DAG
    const checkResult = check(dag);
    if (!checkResult.done) {
      console.error('ERROR: DAG not fully connected');
      console.error('Orphans:', checkResult.orphans);
      process.exit(1);
    }

    const verifyErrors = verify(dag);
    if (verifyErrors.length) {
      console.error('ERROR: Contract violations:', verifyErrors);
      process.exit(1);
    }

    switch (command) {
      case '--show':
        await showRoadmap(dag);
        break;

      case '--export-manifest':
        await exportManifest();
        break;

      case '--list-checkpoints':
        await showCheckpoints();
        break;

      case '--position':
        await showPosition(dag);
        break;

      case '--gen-readme':
        console.log(generateREADME(dag));
        break;

      case '--gen-skill':
        console.log(generateSKILL(dag));
        break;

      case '--gen-spec':
        console.log(generateSPEC(dag));
        break;

      case '--validate':
        await validateAll(dag);
        break;

      case '--validate-node':
        if (!process.argv[3]) {
          console.error('Usage: roadmap.ts --validate-node <nodeId>');
          process.exit(1);
        }
        await validateOne(dag, process.argv[3]);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Available: --show, --export-manifest, --list-checkpoints, --position, --gen-readme, --gen-skill, --gen-spec, --validate, --validate-node <id>');
        process.exit(1);
    }
  } catch (e) {
    console.error('ERROR:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

async function showRoadmap(dag: any) {
  // Get current position
  const fsCheck = (a: string) => existsSync(join(repoRoot, a));
  const pos = orient(dag, fsCheck);

  console.log('=== ROADMAP ===\n');
  console.log(`ID: ${dag.id}`);
  console.log(`Description: ${dag.desc}`);
  console.log(`Total nodes: ${Object.keys(dag.nodes).length}`);
  console.log(`\nCurrent position: ${pos.position}`);
  console.log(`Produces (to create): ${pos.produces.join(', ') || '(none)'}`);
  console.log(`Consumes (available): ${pos.consumes.join(', ') || '(none)'}`);
  console.log(`Remaining nodes: ${pos.remaining.length}`);

  if (pos.position === dag.term) {
    console.log('\n✓ ROADMAP COMPLETE');
  }

  console.log('\nValidation:');
  console.log('  ✓ Acyclic');
  console.log('  ✓ Connected');
  console.log('  ✓ Contracts satisfied');
}

async function exportManifest() {
  const manifest = await getReconciliationManifest(repoRoot);
  console.log(JSON.stringify(manifest, null, 2));
}

async function showCheckpoints() {
  const checkpoints = await listCheckpoints(repoRoot);

  if (checkpoints.length === 0) {
    console.log('No roadmap checkpoints found');
    return;
  }

  console.log('=== ROADMAP CHECKPOINTS ===\n');
  for (const cp of checkpoints) {
    const date = new Date(cp.timestamp).toISOString();
    console.log(`${cp.commitHash.slice(0, 7)} [${date}] ${cp.subject}`);
  }

  console.log(`\nTotal: ${checkpoints.length} checkpoints`);
}

async function showPosition(dag: any) {
  const fsCheck = (a: string) => existsSync(join(repoRoot, a));
  const pos = orient(dag, fsCheck);
  console.log(
    JSON.stringify(
      {
        position: pos.position,
        produces: pos.produces,
        consumes: pos.consumes,
        remaining: pos.remaining.length,
        complete: pos.position === dag.term,
      },
      null,
      2,
    ),
  );
}

async function validateOne(dag: any, nodeId: string) {
  const fsCheck = (a: string) => existsSync(join(repoRoot, a));
  const result = await validateNode(dag, nodeId, fsCheck);

  console.log(`\n=== VALIDATION: ${nodeId} ===\n`);
  console.log(`Status: ${result.passed ? '✓ PASS' : '✗ FAIL'}\n`);

  if (result.checks.length === 0) {
    console.log('No validation rules defined');
    return;
  }

  for (const check of result.checks) {
    const icon = check.passed ? '✓' : '✗';
    const type = (check.rule as any).type;
    const target = (check.rule as any).target;
    console.log(`${icon} [${type}] ${target}`);
    if (check.evidence) console.log(`  ${check.evidence}`);
  }

  if (result.failedReason) {
    console.log(`\n✗ ${result.failedReason}`);
  }
}

async function validateAll(dag: any) {
  const fsCheck = (a: string) => existsSync(join(repoRoot, a));
  const validation = await validateGraph(dag, fsCheck);

  console.log(`\n=== GRAPH VALIDATION ===\n`);
  console.log(`Summary: ${validation.summary.passed}/${validation.summary.total} nodes valid\n`);

  const failed = validation.results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('Failed nodes:');
    for (const result of failed) {
      console.log(`  ✗ ${result.nodeId}: ${result.failedReason}`);
    }
  } else {
    console.log('✓ All nodes validated successfully');
  }
}

// Export for consumers
export async function getRoadmap() {
  return readHeadDAG(repoRoot);
}

export async function getPosition() {
  const dag = await readHeadDAG(repoRoot);
  const fsCheck = (a: string) => existsSync(join(repoRoot, a));
  return orient(dag, fsCheck);
}

export { readHeadDAG as readDAG, getReconciliationManifest };

// Synchronous fallback: read cached HEAD DAG for tests/imports
// (readHeadDAG is async, but tests may use sync import)
let cachedDAG: any = null;

function getCachedDAG() {
  if (!cachedDAG) {
    try {
      const headPath = join(process.cwd(), '.roadmap', 'head.json');
      const content = readFileSync(headPath, 'utf-8');
      cachedDAG = JSON.parse(content);
    } catch (e) {
      throw new Error(`Cannot read cached roadmap: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return cachedDAG;
}

// Default export: current DAG (cached sync version for compatibility)
export default getCachedDAG();

// Run if invoked as script
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
