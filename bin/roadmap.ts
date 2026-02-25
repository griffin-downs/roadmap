#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  define, check, verify, order, parallelOrder, orient,
  validateNode, validateGraph,
} from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import type { Graph } from '../src/protocol.ts';

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const repoRoot = process.cwd();

async function main() {
  try {
    switch (cmd) {
      case 'orient':    return cmdOrient();
      case 'describe':  return cmdDescribe();
      case 'validate':  return cmdValidate();
      case 'expand':    return await cmdExpand();
      case 'branch':    return cmdBranch();
      case 'position':  return cmdOrient(); // alias
      case 'parallel':  return cmdParallel();
      case 'help':
      case '--help':
      case '-h':        return cmdHelp();
      default:
        json({ error: `Unknown command: ${cmd}`, fix: 'roadmap help' });
        process.exit(1);
    }
  } catch (e) {
    if (e instanceof RoadmapError) {
      json(e.toJSON());
    } else {
      json({ error: e instanceof Error ? e.message : String(e) });
    }
    process.exit(1);
  }
}

// --- Commands ---

function cmdOrient() {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  json({
    position: pos.position,
    produces: pos.produces,
    consumes: pos.consumes,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.position === dag.term,
  });
}

function cmdDescribe() {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const batches = parallelOrder(dag);

  // Scan @exports headers from src/
  const apiSurface = scanExports();

  json({
    id: dag.id,
    desc: dag.desc,
    nodes: Object.keys(dag.nodes).length,
    position: pos.position,
    complete: pos.position === dag.term,
    remaining: pos.remaining.length,
    parallelBatches: batches.length,
    entryPoints: {
      'roadmap': 'Full API — DAG ops + recovery + versioning + predicates + errors',
      'roadmap/protocol': 'Core — define, verify, orient, merge, branch, reconcile, parallelOrder',
      'roadmap/agent': 'Sealed agent API — getBrief, advance, checkpoint',
      'roadmap/recovery': 'CheckpointManager + AuditTrail',
      'roadmap/validation': 'validateNode, validateGraph',
      'roadmap/versioning': 'loadDAG, migration, compatibility',
    },
    exports: apiSurface,
    types: [
      'NodeSpec<TAll, TSelf>', 'Graph<T>', 'Orientation', 'Connection', 'Gap',
      'ValidationRule', 'ValidationCheck', 'ValidationResult',
      'Brief', 'FinalHandoff', 'InterimHandoff',
      'RoadmapError', 'ErrorCode',
    ],
  });
}

async function cmdValidate() {
  const dag = loadDAG();
  const nodeId = args[1];

  if (nodeId) {
    const result = await validateNode(dag, nodeId, fileExists(repoRoot));
    json(result);
  } else {
    const result = await validateGraph(dag, fileExists(repoRoot));
    json(result.summary);
  }
}

async function cmdExpand() {
  const scriptPath = args[1];
  if (!scriptPath) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap expand <script.ts>',
      entry: 'bin/roadmap',
    }, 'Missing expansion script path');
  }

  const resolved = resolve(repoRoot, scriptPath);
  if (!existsSync(resolved)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: resolved,
      fix: `Create ${scriptPath} first`,
    }, `Expansion script not found: ${resolved}`);
  }

  // Snapshot before
  const dagBefore = loadDAG();
  const nodesBefore = Object.keys(dagBefore.nodes).length;

  // Run the expansion script
  execSync(`node --experimental-strip-types ${resolved}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  // Snapshot after
  const dagAfter = loadDAG();
  const nodesAfter = Object.keys(dagAfter.nodes).length;
  const added = nodesAfter - nodesBefore;

  // Validate
  const checkResult = check(dagAfter);
  const verifyErrors = verify(dagAfter);

  if (!checkResult.done || verifyErrors.length) {
    throw new RoadmapError('VALIDATION_FAILED', {
      attempted: scriptPath,
      fix: 'Fix the expansion script and re-run',
    }, `Expansion produced invalid DAG: ${verifyErrors.length} errors`);
  }

  // Commit
  execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
  const msg = `roadmap: expand — ${added} nodes added via ${scriptPath}`;
  execSync(`git commit -m "${msg}"`, { cwd: repoRoot, stdio: 'pipe' });
  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  json({
    expanded: true,
    script: scriptPath,
    nodesBefore,
    nodesAfter,
    added,
    commit: hash,
  });
}

function cmdBranch() {
  const branchName = args[1];
  const dagFile = args[2]; // optional separate DAG file

  if (!branchName) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap branch <name> [dag.json]',
    }, 'Missing branch name');
  }

  // Create git branch
  execSync(`git checkout -b ${branchName}`, { cwd: repoRoot, stdio: 'pipe' });

  if (dagFile) {
    // Copy separate DAG as the branch's head.json
    const dagPath = resolve(repoRoot, dagFile);
    if (!existsSync(dagPath)) {
      throw new RoadmapError('NODE_NOT_FOUND', {
        attempted: dagPath,
        fix: `Create ${dagFile} first`,
      });
    }

    const dagContent = readFileSync(dagPath, 'utf-8');
    const dag = JSON.parse(dagContent);

    // Validate
    const checkResult = check(dag);
    const verifyErrors = verify(dag);
    if (!checkResult.done || verifyErrors.length) {
      execSync('git checkout -', { cwd: repoRoot, stdio: 'pipe' });
      throw new RoadmapError('VALIDATION_FAILED', {
        attempted: dagFile,
        fix: 'Fix the DAG and re-run',
      });
    }

    // Write as the branch's DAG
    const headPath = join(repoRoot, '.roadmap', 'head.json');
    writeFileSync(headPath, JSON.stringify(dag, null, 2));
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "roadmap: branch ${branchName} — separate DAG"`, { cwd: repoRoot, stdio: 'pipe' });
  }

  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  json({
    branch: branchName,
    dagFile: dagFile || '(inherited from parent)',
    commit: hash,
  });
}

function cmdParallel() {
  const dag = loadDAG();
  const batches = parallelOrder(dag);
  json({
    batches: batches.map((b, i) => ({ level: i, nodes: b, count: b.length })),
    totalLevels: batches.length,
    maxParallelism: Math.max(...batches.map(b => b.length)),
  });
}

function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Commands:
  orient              Current position + produces/consumes (JSON)
  describe            Full API surface + project state (JSON)
  validate [node]     Run validation rules (all nodes or specific)
  expand <script.ts>  Run expansion script, validate DAG, commit
  branch <name> [dag] Create git branch with optional separate DAG
  parallel            Show parallel execution batches
  help                This message

All commands output JSON to stdout. Errors exit non-zero.

Examples:
  roadmap orient
  roadmap describe
  roadmap validate phase-13-term
  roadmap expand .roadmap/expand-phase-14.ts
  roadmap branch research/v2 .roadmap/research-v2.json
  roadmap parallel`);
}

// --- Helpers ---

function loadDAG(): Graph<string> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json',
      entry: 'roadmap orient',
    }, 'No roadmap found at .roadmap/head.json');
  }
  return JSON.parse(readFileSync(headPath, 'utf-8'));
}

function json(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function scanExports(): Record<string, string[]> {
  const srcDir = join(repoRoot, 'src');
  const result: Record<string, string[]> = {};

  try {
    const files = execSync('ls src/*.ts', { cwd: repoRoot, encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);

    for (const file of files) {
      const content = readFileSync(join(repoRoot, file), 'utf-8');
      const match = content.match(/^\/\/ @exports (.+)$/m);
      if (match) {
        result[file] = match[1].split(',').map(s => s.trim());
      }
    }
  } catch {
    // Non-fatal: return what we found
  }

  return result;
}

await main();
