#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  define, check, verify, order, parallelOrder, orient,
  validateNode, validateGraph,
} from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import type { Graph } from '../src/protocol.ts';

const rawArgs = process.argv.slice(2);
const repoRoot = process.cwd();

// Extract --note and its value, return note + remaining positional args
function extractNote(argv: string[]): { note: string | undefined; positional: string[] } {
  const idx = argv.indexOf('--note');
  if (idx === -1) return { note: undefined, positional: argv };
  const note = argv[idx + 1];
  const positional = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { note, positional };
}

const { note: _note, positional: args } = extractNote(rawArgs);
const cmd = args[0] || 'help';

// Commands that don't require a note
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'trail']);

interface TrailEntry {
  ts: string;
  cmd: string;
  note: string;
  position?: string;
  dagId?: string;
  detail?: Record<string, unknown>;
}

function recordTrail(entry: TrailEntry) {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(trailPath, JSON.stringify(entry) + '\n');
}

async function main() {
  const note = _note;

  if (!NOTE_EXEMPT.has(cmd) && !note) {
    json({ error: 'Missing --note "reason"', fix: `roadmap ${cmd} --note "why you are running this"` });
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'orient':    return cmdOrient(note!);
      case 'describe':  return cmdDescribe(note!);
      case 'validate':  return cmdValidate(note!);
      case 'expand':    return await cmdExpand(note!);
      case 'branch':    return cmdBranch(note!);
      case 'position':  return cmdOrient(note!); // alias
      case 'parallel':  return cmdParallel(note!);
      case 'trail':     return cmdTrail();
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

function cmdOrient(note: string) {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const result = {
    position: pos.position,
    produces: pos.produces,
    consumes: pos.consumes,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.position === dag.term,
  };
  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'orient',
    note,
    position: pos.position,
    dagId: dag.id,
    detail: { done: result.done, remaining: result.remaining, complete: result.complete },
  });
  json(result);
}

function cmdDescribe(note: string) {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const batches = parallelOrder(dag);
  const apiSurface = scanExports();

  recordTrail({ ts: new Date().toISOString(), cmd: 'describe', note, position: pos.position, dagId: dag.id });

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

async function cmdValidate(note: string) {
  const dag = loadDAG();
  const nodeId = args[1];

  recordTrail({ ts: new Date().toISOString(), cmd: 'validate', note, dagId: dag.id, detail: { nodeId: nodeId || 'all' } });

  if (nodeId) {
    const result = await validateNode(dag, nodeId, fileExists(repoRoot));
    json(result);
  } else {
    const result = await validateGraph(dag, fileExists(repoRoot));
    json(result.summary);
  }
}

async function cmdExpand(note: string) {
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

  recordTrail({ ts: new Date().toISOString(), cmd: 'expand', note, dagId: dagAfter.id, detail: { script: scriptPath, added, commit: hash } });

  json({
    expanded: true,
    script: scriptPath,
    nodesBefore,
    nodesAfter,
    added,
    commit: hash,
  });
}

function cmdBranch(note: string) {
  const branchName = args[1];
  const dagFile = args[2];

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

  recordTrail({ ts: new Date().toISOString(), cmd: 'branch', note, detail: { branch: branchName, dagFile: dagFile || null, commit: hash } });

  json({
    branch: branchName,
    dagFile: dagFile || '(inherited from parent)',
    commit: hash,
  });
}

function cmdParallel(note: string) {
  const dag = loadDAG();
  const batches = parallelOrder(dag);
  recordTrail({ ts: new Date().toISOString(), cmd: 'parallel', note, dagId: dag.id });

  json({
    batches: batches.map((b, i) => ({ level: i, nodes: b, count: b.length })),
    totalLevels: batches.length,
    maxParallelism: Math.max(...batches.map(b => b.length)),
  });
}

function cmdTrail() {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  if (!existsSync(trailPath)) {
    json({ entries: [], count: 0 });
    return;
  }
  const lines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  const limit = args.includes('--last') ? parseInt(args[args.indexOf('--last') + 1]) || 10 : undefined;
  const filtered = limit ? entries.slice(-limit) : entries;

  json({ entries: filtered, count: entries.length });
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
  trail [--last N]    Read the invocation trail
  help                This message

All commands (except help/trail) require --note "reason".
Every invocation is appended to .roadmap/trail.jsonl.

Examples:
  roadmap orient --note "session start — checking position"
  roadmap describe --note "surveying API surface for new consumer"
  roadmap validate phase-13-term --note "pre-release gate"
  roadmap expand .roadmap/expand-phase-14.ts --note "adding research phase"
  roadmap branch research/v2 .roadmap/research-v2.json --note "spike: new walker"
  roadmap trail --last 5`);
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
