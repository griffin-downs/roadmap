#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  define, check, verify, order, parallelOrder, batchConflicts, orient, readyNodes, nextBatch, criticalPath, reconcile,
  validateNode, validateGraph, consumeArtifact,
} from '../src/protocol.ts';
import type { ConsumeSpec } from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { discoverDependencies, resolveSiblingPath } from '../src/lib/dependency-resolver.ts';
import { loadClaims, saveClaims, isExpired, activeClaims, annotateWithClaims, assignBatch } from '../src/lib/claims.ts';
import { parseTasksMd, tasksToDAG } from '../src/lib/speckit-import.ts';
import { buildSpawnPlan } from '../src/lib/spawn-plan.ts';
import { buildScaffold } from '../src/lib/scaffold.ts';
import { buildClusters } from '../src/lib/cluster.ts';
import { buildSchedule } from '../src/lib/schedule.ts';
import { propagateConstraints } from '../src/lib/propagate.ts';
import { compilePrompts } from '../src/lib/compile-prompts.ts';
import { recordEvaluation, judgmentToRecord } from '../src/lib/intent-evaluator.ts';
import { validateTerminalIntentGate, validateInitIntentGate, findInitBoundary } from '../src/lib/validate-dag.ts';
import { buildGallery } from '../src/lib/gallery-templates/index.ts';
import { estimateCost } from '../src/lib/cost-estimator.ts';
import { installAll, extractVersionHash, readPackageVersion, computeSkillHash } from '../src/lib/install-skills.ts';
import type { Graph } from '../src/protocol.ts';
import type { SiblingStatus } from '../src/lib/cross-orient.ts';

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
// Special case: orient/position with --check is note-exempt (silent polling)
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'trail', 'chart', 'install', 'dig', 'claim', 'diff', 'show', 'iter-id']);
const isOrientCheck = (cmd === 'orient' || cmd === 'position') && args.includes('--check');
if (isOrientCheck) {
  NOTE_EXEMPT.add('orient');
  NOTE_EXEMPT.add('position');
}
// checkpoint --list/--restore are read-only; --label is note-optional (claim is the evidence trail)
if (cmd === 'checkpoint' && (args.includes('--list') || args.includes('--restore') || args.includes('--label'))) {
  NOTE_EXEMPT.add('checkpoint');
}

interface TrailEntry {
  ts: string;
  cmd: string;
  note: string;
  repo: string;
  position?: string | string[];  // batch position (string[]) or legacy string
  dagId?: string;
  level?: number;  // batch level index
  detail?: Record<string, unknown>;
}

const hasLocalDAG = existsSync(join(repoRoot, '.roadmap', 'head.json'));
const globalTrailDir = join(homedir(), '.roadmap');
const localTrailDir = join(repoRoot, '.roadmap');
const retiredPath = join(repoRoot, '.roadmap', 'retired.json');

interface RetiredEntry {
  reason: string;
  ts: string;
  cascade?: boolean;
}

function loadRetired(): Map<string, RetiredEntry> {
  if (!existsSync(retiredPath)) return new Map();
  try {
    const data = JSON.parse(readFileSync(retiredPath, 'utf-8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function saveRetired(retired: Map<string, RetiredEntry>): void {
  writeFileSync(retiredPath, JSON.stringify(Object.fromEntries(retired), null, 2) + '\n');
}

function retiredSet(): Set<string> {
  return new Set(loadRetired().keys());
}

// --- iter-id: loop iteration counter ---
// Reads/writes .roadmap/iter.json: { iteration: number, startedAt: string }
// Canonical iteration number for namespacing loop artifacts (evidence-iter-3.json, etc.)

const iterFile = join(repoRoot, '.roadmap', 'iter.json');

interface IterState { iteration: number; startedAt: string }

function readIterState(): IterState | null {
  if (!existsSync(iterFile)) return null;
  try { return JSON.parse(readFileSync(iterFile, 'utf-8')); } catch { return null; }
}

function writeIterState(s: IterState): void {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(iterFile, JSON.stringify(s, null, 2) + '\n');
}

function cmdIterId(): void {
  const doIncrement = args.includes('--increment');
  const doReset = args.includes('--reset');

  let state = readIterState();

  if (doReset) {
    state = { iteration: 0, startedAt: new Date().toISOString() };
    writeIterState(state);
    json({ iteration: state.iteration, reset: true, startedAt: state.startedAt });
    return;
  }

  if (!state) {
    state = { iteration: 0, startedAt: new Date().toISOString() };
    writeIterState(state);
  }

  if (doIncrement) {
    state = { ...state, iteration: state.iteration + 1 };
    writeIterState(state);
  }

  json({ iteration: state.iteration, startedAt: state.startedAt });
}

function appendToTrail(dir: string, entry: TrailEntry) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'trail.jsonl'), JSON.stringify(entry) + '\n');
}

function recordTrail(entry: TrailEntry) {
  // Always write to global trail
  appendToTrail(globalTrailDir, entry);
  // Also write to local trail if this repo has a DAG
  if (hasLocalDAG) appendToTrail(localTrailDir, entry);
}

async function main() {
  const note = _note;

  if (!NOTE_EXEMPT.has(cmd) && !note) {
    json({ error: 'Missing --note "reason"', fix: `roadmap ${cmd} --note "why you are running this"` });
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'orient':    return cmdOrient(note);
      case 'advance':   return await cmdAdvance(note!);
      case 'describe':  return cmdDescribe(note!);
      case 'validate':  return cmdValidate(note!);
      case 'expand':    return await cmdExpand(note!);
      case 'branch':    return cmdBranch(note!);
      case 'position':  return cmdOrient(note); // alias
      case 'parallel':  return cmdParallel(note!);
      case 'locate':    return cmdLocate(note!);
      case 'sync':      return cmdSync(note!);
      case 'trail':     return cmdTrail();
      case 'chart':     return cmdChart();
      case 'install':        return cmdInstall();
      case 'install-hooks':  return cmdInstallHooks(note!);
      case 'merge':     return await cmdMergeFrom();
      case 'retire':    return cmdRetire(note!);
      case 'claim':     return cmdClaim();
      case 'import':    return cmdImport(note!);
      case 'init':      return cmdInit(note!);
      case 'report':    return await cmdReport(note!);
      case 'scaffold':  return await cmdScaffold(note!);
      case 'cluster':   return cmdCluster(note!);
      case 'schedule':  return cmdSchedule(note!);
      case 'show':      return cmdShow();
      case 'commit':    return cmdCommit(note!);
      case 'complete':  return await cmdComplete(note!);
      case 'checkpoint': return cmdCheckpoint(note);
      case 'diff':      return cmdDiff();
      case 'iter-id':   return cmdIterId();
      case 'dig':       return cmdDig();
      case 'propagate': return cmdPropagate(note!);
      case 'compile-prompts': return cmdCompilePrompts(note!);
      case 'plan':
        if (args.includes('--gallery')) return await cmdPlanGallery(note!);
        json({ error: 'Unknown plan subcommand', fix: 'roadmap plan --gallery [--from <specFile>] [--select <id>] [--evaluate <json>] [--json]' });
        process.exit(1);
        return;
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

async function cmdOrient(note: string | undefined) {
  const isCheck = args.includes('--check');
  if (!hasLocalDAG) {
    const result = { position: 'untracked', repo: basename(repoRoot), tracked: false };
    if (!isCheck) {
      recordTrail({
        ts: new Date().toISOString(),
        cmd: 'orient',
        note: note ?? '',
        repo: basename(repoRoot),
        position: 'untracked',
      });
    }
    json(result);
    return;
  }

  const dag = loadDAG();
  const pos = await crossOrient(dag, repoRoot, undefined, retiredSet());

  // Annotate current batch nodes with their mode
  const batchModes: Record<string, string> = {};
  for (const nodeId of pos.position) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (node?.mode === 'plan') batchModes[nodeId] = 'plan';
  }

  // Annotate batch nodes with claim status
  const claimStore = loadClaims(repoRoot);
  const claimAnnotations = annotateWithClaims(pos.position, claimStore);

  const result: Record<string, unknown> = {
    position: pos.position,
    level: pos.level,
    produces: pos.produces,
    consumes: pos.consumes,
    batchRemaining: pos.batchRemaining,
    batchComplete: pos.batchComplete,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.remaining.length === 0,
  };
  if (Object.keys(batchModes).length) result.planNodes = batchModes;
  if (Object.keys(claimAnnotations).length) result.claims = claimAnnotations;
  if (pos.preGate.length) result.preGate = pos.preGate;
  const iterState = readIterState();
  if (iterState !== null) result.iteration = iterState.iteration;

  // --assign: round-robin assign batchRemaining to owners
  if (args.includes('--assign')) {
    const ownersIdx = args.indexOf('--owners');
    if (ownersIdx === -1) {
      json({ error: 'Missing --owners', fix: 'roadmap orient --assign --owners w1,w2,w3 --note "reason"' });
      process.exit(1);
    }
    const ownersRaw = args[ownersIdx + 1] ?? '';
    const owners = ownersRaw.split(',').filter(Boolean);
    if (owners.length === 0) {
      json({ error: 'Empty --owners', fix: 'roadmap orient --assign --owners w1,w2,w3 --note "reason"' });
      process.exit(1);
    }
    const ttlIdx = args.indexOf('--ttl');
    const ttlSeconds = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1] ?? '300', 10) : 300;
    if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
      json({ error: 'Invalid --ttl value; must be a positive integer (seconds)' });
      process.exit(1);
    }

    // When batchRemaining is empty but position has nodes (e.g. term with artifacts
    // present but validation not yet run), fall back to position as the assignable set.
    const assignableNodes = pos.batchRemaining.length > 0 ? pos.batchRemaining : pos.position;

    const conflicts = batchConflicts(dag);
    const currentBatchConflicts = conflicts
      .filter(c => c.writers.some(w => assignableNodes.includes(w)))
      .map(c => ({ file: c.file, writers: c.writers }));

    // --by-cluster: assign clusters to owners instead of individual nodes
    if (args.includes('--by-cluster')) {
      const maxSizeIdx = args.indexOf('--max-size');
      const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1] ?? '8', 10) : undefined;
      const clusters = buildClusters(dag, { maxSize });
      // Filter to clusters containing assignable nodes
      const remainingSet = new Set(assignableNodes);
      const activeClusters = clusters.clusters.filter(c => c.nodes.some(n => remainingSet.has(n)));
      const clusterAssignments: Record<string, { cluster: string; nodes: string[] }> = {};
      for (let i = 0; i < activeClusters.length; i++) {
        const owner = owners[i % owners.length];
        const c = activeClusters[i];
        clusterAssignments[owner] = clusterAssignments[owner]
          ? { ...clusterAssignments[owner], nodes: [...clusterAssignments[owner].nodes, ...c.nodes] }
          : { cluster: c.id, nodes: [...c.nodes] };
        // Claim all nodes in this cluster for the owner
        for (const nodeId of c.nodes) {
          if (!remainingSet.has(nodeId)) continue;
          const { store: s } = assignBatch([nodeId], [owner], claimStore, [], ttlSeconds);
          Object.assign(claimStore, s);
        }
      }
      saveClaims(repoRoot, claimStore);
      result.clusterAssignments = clusterAssignments;
      result.activeClusters = activeClusters.map(c => ({
        id: c.id, nodes: c.nodes, internalOrder: c.internalOrder, crossClusterDeps: c.crossClusterDeps,
      }));
    } else {
      const { store: newStore, result: assignResult } = assignBatch(
        assignableNodes, owners, claimStore, currentBatchConflicts, ttlSeconds,
      );
      saveClaims(repoRoot, newStore);
      // Only report batchRemaining assignments in output; position-fallback
      // assignments are written to claims.json but are implicit (structural nodes).
      const reportedAssignments: Record<string, string> = {};
      for (const [nodeId, owner] of Object.entries(assignResult.assignments)) {
        if (pos.batchRemaining.includes(nodeId)) reportedAssignments[nodeId] = owner;
      }
      result.assignments = reportedAssignments;
      if (Object.keys(assignResult.skipped).length) result.assignSkipped = assignResult.skipped;
    }
  }

  // --ready: eager dispatch — nodes beyond current batch whose deps are met
  if (args.includes('--ready')) {
    const ready = readyNodes(dag, fileExists(repoRoot), retiredSet());
    const active = activeClaims(claimStore);
    const callingOwner = process.env['AGENT_ID'] ?? process.env['USER'] ?? '';
    result.ready = ready.map(n => ({
      ...n,
      claimable: !(n.id in active),
    }));
    // myClaims: current-batch nodes this owner already holds — lets agent confirm
    // ownership without a separate claim list call.
    result.myClaims = pos.batchRemaining.filter(id => {
      const c = claimStore[id];
      return c && !isExpired(c) && c.owner === callingOwner;
    });
  }

  // --next: lookahead for orchestrator pre-warming
  if (args.includes('--next')) {
    const next = nextBatch(dag, fileExists(repoRoot), retiredSet());
    result.next = next;
  }

  // --staged: per-node isomorphism check — do staged files match a node's produces?
  if (args.includes('--staged')) {
    try {
      const staged = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf-8' })
        .trim().split('\n').filter(Boolean);
      const stagedSet = new Set(staged);

      // Find node(s) whose produces exactly match staged files
      const matches: { node: string; produces: string[]; exact: boolean }[] = [];
      for (const nodeId of pos.position) {
        const node = (dag.nodes as Record<string, any>)[nodeId];
        if (!node?.produces?.length) continue;
        const nodeProduces = node.produces as string[];
        const overlap = nodeProduces.filter((p: string) => stagedSet.has(p));
        if (overlap.length === 0) continue;
        matches.push({
          node: nodeId,
          produces: nodeProduces,
          exact: overlap.length === nodeProduces.length && staged.length === nodeProduces.length,
        });
      }

      const extraFiles = staged.filter(f => {
        for (const m of matches) {
          if (m.produces.includes(f)) return false;
        }
        return true;
      });

      result.staged = {
        files: staged,
        matches,
        extraFiles,
        isomorphic: matches.length === 1 && matches[0].exact && extraFiles.length === 0,
      };
    } catch {
      result.staged = { files: [], matches: [], extraFiles: [], isomorphic: false };
    }
  }

  // Include blockedBy if there are blocking deps
  if (pos.blockedBy.length) {
    result.blockedBy = pos.blockedBy.map(s => ({
      repo: s.repo, position: s.position, waiting: s.waiting, repoComplete: s.satisfied,
    }));
  }

  // Trail entry with batch context (skip if --check)
  if (!isCheck) {
    const trailDetail: Record<string, unknown> = {
      done: pos.done.length,
      remaining: pos.remaining.length,
      complete: result.complete,
      batchRemaining: pos.batchRemaining.length,
    };
    if (pos.deps.length) {
      trailDetail.deps = pos.deps.map(s => ({
        repo: s.repo, position: s.position, satisfied: s.satisfied,
      }));
    }

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'orient',
      note: note ?? '',
      repo: basename(repoRoot),
      position: pos.position,
      level: pos.level,
      dagId: dag.id,
      detail: trailDetail,
    });
  }
  json(result);
}

async function cmdAdvance(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo' });
    return;
  }

  const { advanceBatch } = await import('../src/protocol.ts');
  const dag = loadDAG();
  const predicate = fileExists(repoRoot);

  try {
    // Get current position
    const current = await import('../src/protocol.ts').then(m => m.orient(dag, predicate, retiredSet()));

    // Validate batch is complete
    if (!current.batchComplete) {
      json({
        error: 'Batch not complete',
        currentBatch: current.position,
        remaining: current.batchRemaining,
      });
      return;
    }

    // Check artifacts exist
    const missingArtifacts: string[] = [];
    for (const artifact of current.produces) {
      if (!predicate(artifact)) {
        missingArtifacts.push(artifact);
      }
    }

    if (missingArtifacts.length > 0) {
      json({
        error: 'Required artifacts missing',
        missing: missingArtifacts,
      });
      return;
    }

    // Advance to next batch
    const next = await advanceBatch(dag, predicate, retiredSet());

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'advance',
      note,
      repo: basename(repoRoot),
      position: next.position,
      dagId: dag.id,
    });

    json({
      previousBatch: current.position,
      nextBatch: next.position,
      nextLevel: next.level,
      complete: next.remaining.length === 0,
    });
  } catch (e: any) {
    json({ error: e.message || 'Failed to advance batch' });
  }
}

function cmdDescribe(note: string) {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const batches = parallelOrder(dag);
  const apiSurface = scanExports();

  recordTrail({ ts: new Date().toISOString(), cmd: 'describe', note, repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id });

  json({
    id: dag.id,
    desc: dag.desc,
    nodes: Object.keys(dag.nodes).length,
    position: pos.position,
    level: pos.level,
    batchComplete: pos.batchComplete,
    complete: pos.remaining.length === 0,
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
  const pos = orient(dag, fileExists(repoRoot));

  recordTrail({ ts: new Date().toISOString(), cmd: 'validate', note, repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id, detail: { nodeId: nodeId || 'all' } });

  if (nodeId) {
    const result = await validateNode(dag, nodeId, fileExists(repoRoot));
    json(result);
  } else {
    const result = await validateGraph(dag, fileExists(repoRoot));
    const terminalError = validateTerminalIntentGate(dag);
    json({
      ...result.summary,
      ...(terminalError ? { terminalIntentGate: terminalError } : {}),
    });
  }
}

async function cmdExpand(note: string) {
  const scriptPath = args[1];
  if (!scriptPath) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap expand <script.ts> [--type structural|iteration]',
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

  // Expansion type: structural (default) or iteration
  const typeIdx = args.indexOf('--type');
  const expansionType = typeIdx !== -1 ? (args[typeIdx + 1] ?? 'structural') : 'structural';
  if (expansionType !== 'structural' && expansionType !== 'iteration') {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: '--type must be "structural" or "iteration"',
    }, `Invalid expansion type: ${expansionType}`);
  }

  // Snapshot before
  const dagBefore = loadDAG();
  const idsBefore = new Set(Object.keys(dagBefore.nodes));
  const nodesBefore = idsBefore.size;

  // Set expansion type as env var so scripts can branch on it
  execSync(`node --experimental-strip-types ${resolved}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ROADMAP_EXPANSION_TYPE: expansionType },
  });

  // Snapshot after
  const dagAfter = loadDAG();
  const idsAfter = Object.keys(dagAfter.nodes);
  const nodesAfter = idsAfter.length;
  const addedIds = idsAfter.filter(id => !idsBefore.has(id));
  const added = addedIds.length;

  // Structural expansions are idempotent — re-running should produce same graph.
  // Iteration expansions are one-shot — re-running adds another iteration payload.
  // Validate both.
  const checkResult = check(dagAfter);
  const verifyErrors = verify(dagAfter);

  if (!checkResult.done || verifyErrors.length) {
    throw new RoadmapError('VALIDATION_FAILED', {
      attempted: scriptPath,
      fix: 'Fix the expansion script and re-run',
    }, `Expansion produced invalid DAG: ${verifyErrors.length} errors`);
  }

  // Terminal intent gate invariant — every terminal node must have expandOnFail intent
  const terminalError = validateTerminalIntentGate(dagAfter);
  if (terminalError && !args.includes('--skip-terminal-intent')) {
    throw new RoadmapError('VALIDATION_FAILED', {
      node: terminalError.node,
      fix: terminalError.fix,
    }, terminalError.message);
  }

  // Commit
  execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
  const msg = `roadmap: expand (${expansionType}) — ${added} nodes added via ${scriptPath}`;
  execSync(`git commit -m "${msg}"`, { cwd: repoRoot, stdio: 'pipe' });
  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  const posAfter = orient(dagAfter, fileExists(repoRoot), retiredSet());
  recordTrail({ ts: new Date().toISOString(), cmd: 'expand', note, repo: basename(repoRoot), position: posAfter.position, level: posAfter.level, dagId: dagAfter.id, detail: { script: scriptPath, added, commit: hash, type: expansionType } });

  json({
    expanded: true,
    type: expansionType,
    script: scriptPath,
    nodesBefore,
    nodesAfter,
    added,
    addedIds,
    position: posAfter.position,
    level: posAfter.level,
    batchRemaining: posAfter.batchRemaining,
    batchComplete: posAfter.batchComplete,
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

  const dagAfterBranch = loadDAG();
  const posBranch = orient(dagAfterBranch, fileExists(repoRoot));
  recordTrail({ ts: new Date().toISOString(), cmd: 'branch', note, repo: basename(repoRoot), position: posBranch.position, level: posBranch.level, dagId: dagAfterBranch.id, detail: { branch: branchName, dagFile: dagFile || null, commit: hash } });

  json({
    branch: branchName,
    dagFile: dagFile || '(inherited from parent)',
    commit: hash,
  });
}

function cmdParallel(note: string) {
  const dag = loadDAG();
  const batches = parallelOrder(dag);
  const showGraph = args.includes('--graph');
  const crossRepo = args.includes('--cross-repo');
  const pos = orient(dag, fileExists(repoRoot));

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'parallel',
    note,
    repo: basename(repoRoot),
    position: pos.position,
    level: pos.level,
    dagId: dag.id,
    detail: { crossRepo, showGraph },
  });

  const showConflicts = args.includes('--conflicts');
  const conflicts = batchConflicts(dag);

  // --by-cluster: show pipeline waves of clusters instead of individual nodes
  if (args.includes('--by-cluster')) {
    const maxSizeIdx = args.indexOf('--max-size');
    const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1] ?? '8', 10) : undefined;
    const clusters = buildClusters(dag, { maxSize });
    const schedule = buildSchedule(dag, clusters);
    json({
      clusters: clusters.clusters.map(c => ({
        id: c.id, nodes: c.nodes, internalOrder: c.internalOrder,
        crossClusterDeps: c.crossClusterDeps, critical: c.critical,
      })),
      waves: schedule.waves,
      pipelineDepth: schedule.pipelineDepth,
      maxConcurrency: schedule.maxConcurrency,
    });
    return;
  }

  const result: Record<string, any> = {
    batches: batches.map((b, i) => ({ level: i, nodes: b, count: b.length })),
    totalLevels: batches.length,
    maxParallelism: Math.max(...batches.map(b => b.length)),
  };

  if (showConflicts || conflicts.length > 0) {
    result.conflicts = conflicts;
    result.conflictCount = conflicts.length;
  }

  if (showGraph) {
    // Include full DAG structure
    const nodes = Object.entries(dag.nodes).map(([id, spec]) => ({
      id,
      desc: spec.desc,
      deps: spec.deps,
      produces: spec.produces,
      consumes: spec.consumes,
    }));
    result.graph = {
      id: dag.id,
      init: dag.init,
      term: dag.term,
      nodes,
      edges: Object.entries(dag.nodes).flatMap(([id, spec]) =>
        spec.deps.map(dep => ({ from: dep, to: id }))
      ),
    };
  }

  if (crossRepo) {
    // Try to discover sibling roadmaps and their parallel structure
    const skillPath = join(homedir(), '.claude/skills/roadmap-locate/backend.ts');
    try {
      const output = execSync(`npx tsx ${skillPath}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const discovered = JSON.parse(output);
      const siblings = (discovered.roadmaps || []).filter((rm: any) => rm.path !== repoRoot);
      result.crossRepoSiblings = siblings.map((rm: any) => ({
        name: rm.name,
        path: rm.path,
        position: rm.position,
        complete: rm.complete,
        blockedBy: rm.blockedBy,
      }));
    } catch {
      result.crossRepoSiblings = [];
    }
  }

  json(result);
}

function cmdTrail() {
  const useGlobal = args.includes('--global');
  const dir = useGlobal ? globalTrailDir : (hasLocalDAG ? localTrailDir : globalTrailDir);
  const trailPath = join(dir, 'trail.jsonl');
  const source = useGlobal ? 'global' : (hasLocalDAG ? 'local' : 'global');

  if (args.includes('--archive')) {
    if (!existsSync(trailPath)) {
      json({ archived: false, reason: 'no trail to archive' });
      return;
    }
    const lines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);

    if (source === 'local') {
      // Local trail: commit to git then truncate
      execSync('git add .roadmap/trail.jsonl', { cwd: repoRoot, stdio: 'pipe' });
      try {
        execSync('git diff --cached --quiet', { cwd: repoRoot, stdio: 'pipe' });
        // No staged changes — trail already committed, just truncate
        writeFileSync(trailPath, '');
        json({ archived: true, source, entries: lines.length, commit: 'already-committed' });
      } catch {
        // Staged changes exist — commit then truncate
        execSync(`git commit -m "roadmap: archive trail (${lines.length} entries)"`, { cwd: repoRoot, stdio: 'pipe' });
        const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
        writeFileSync(trailPath, '');
        json({ archived: true, source, entries: lines.length, commit: hash });
      }
    } else {
      // Global trail: rotate to timestamped file then truncate
      const archiveDir = join(globalTrailDir, 'archive');
      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = join(archiveDir, `trail-${stamp}.jsonl`);
      writeFileSync(archivePath, readFileSync(trailPath, 'utf-8'));
      writeFileSync(trailPath, '');
      json({ archived: true, source, entries: lines.length, archivePath });
    }
    return;
  }

  // --archived: list or read rotated global trail files
  if (args.includes('--archived')) {
    const archiveDir = join(globalTrailDir, 'archive');
    if (!existsSync(archiveDir)) {
      json({ archives: [], count: 0 });
      return;
    }
    const files = readdirSync(archiveDir)
      .filter((f: string) => f.endsWith('.jsonl'))
      .sort();

    // If a specific file index is given, read it
    const readIdx = args.indexOf('--read');
    if (readIdx !== -1) {
      const target = args[readIdx + 1];
      const match = files.find((f: string) => f === target || f.includes(target));
      if (!match) {
        json({ error: `No archive matching "${target}"`, available: files });
        process.exit(1);
      }
      const archLines = readFileSync(join(archiveDir, match), 'utf-8').trim().split('\n').filter(Boolean);
      const archEntries = archLines.map((l: string) => JSON.parse(l));
      json({ file: match, entries: archEntries, count: archEntries.length });
      return;
    }

    // List archives with entry counts and date ranges
    const summaries = files.map((f: string) => {
      const content = readFileSync(join(archiveDir, f), 'utf-8').trim().split('\n').filter(Boolean);
      const first = content.length ? JSON.parse(content[0]).ts : null;
      const last = content.length ? JSON.parse(content[content.length - 1]).ts : null;
      return { file: f, entries: content.length, from: first, to: last };
    });
    json({ archives: summaries, count: files.length });
    return;
  }

  if (!existsSync(trailPath)) {
    json({ entries: [], count: 0, source });
    return;
  }
  const lines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  const limit = args.includes('--last') ? parseInt(args[args.indexOf('--last') + 1]) || 10 : undefined;
  const repoFilter = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : undefined;
  let filtered = repoFilter ? entries.filter((e: any) => e.repo === repoFilter) : entries;
  filtered = limit ? filtered.slice(-limit) : filtered;

  json({ entries: filtered, count: entries.length, source });
}

async function cmdChart() {
  if (!hasLocalDAG) {
    console.log('📭 No roadmap in this repo. Run `roadmap install` to set up.');
    return;
  }

  const showDeps = args.includes('--deps');
  const showCritical = args.includes('--critical-path');
  const dag = loadDAG();
  const retiredIds = retiredSet();
  const pos = await crossOrient(dag, repoRoot, undefined, retiredIds);
  const batches = parallelOrder(dag);
  const claimStore = loadClaims(repoRoot);
  const now = new Date();
  const nodeIds = Object.keys(dag.nodes);
  const doneSet = new Set(pos.done);
  const preGateSet = new Set(pos.preGate);
  const cpSet = showCritical ? new Set(criticalPath(dag)) : new Set<string>();
  const totalNodes = nodeIds.length;
  const doneCount = pos.done.length;
  const pct = Math.round((doneCount / totalNodes) * 100);

  // Show dependency repos first if --deps
  if (showDeps && pos.deps.length) {
    for (const sib of pos.deps) {
      if (!sib.repoExists) {
        console.log(`\n  📭 ${sib.repo} — repo not found at ${sib.path}`);
        continue;
      }
      if (!sib.dagExists) {
        console.log(`\n  📭 ${sib.repo} — no roadmap (untracked)`);
        continue;
      }

      // Load sibling DAG for chart rendering
      try {
        const sibDagContent = readFileSync(join(sib.path, '.roadmap/head.json'), 'utf-8');
        const sibDag = JSON.parse(sibDagContent) as Graph<string>;
        const sibPos = orient(sibDag, fileExists(sib.path));
        const sibNodes = Object.keys(sibDag.nodes).length;
        const sibDone = sibPos.done.length;
        const sibPct = Math.round((sibDone / sibNodes) * 100);
        const sibBarLen = 30;
        const sibFilled = Math.round((sibDone / sibNodes) * sibBarLen);
        const sibBar = '█'.repeat(sibFilled) + '░'.repeat(sibBarLen - sibFilled);
        const sibEmoji = sibPct === 100 ? '🏁' : sibPct > 75 ? '🔥' : sibPct > 50 ? '⚡' : sibPct > 25 ? '🚧' : '🌱';

        console.log('');
        console.log(`${sibEmoji} ${sibDag.id} — ${sibDag.desc}`);
        console.log(`  ${sibBar} ${sibPct}% (${sibDone}/${sibNodes} nodes)`);
        console.log(`  📍 position: ${sibPos.position}`);
      } catch {
        console.log(`\n  📭 ${sib.repo} — failed to load DAG`);
      }
    }

    // Show blocking status
    if (pos.blockedBy.length) {
      console.log('');
      for (const b of pos.blockedBy) {
        console.log(`  ⏳ blocked by: ${b.repo} → ${b.waiting.join(', ')} (${b.repo} at ${b.position})`);
      }
    }
  }

  // Overall progress bar
  const barLen = 30;
  const filled = Math.round((doneCount / totalNodes) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const statusEmoji = pct === 100 ? '🏁' : pct > 75 ? '🔥' : pct > 50 ? '⚡' : pct > 25 ? '🚧' : '🌱';

  console.log('');
  console.log(`${statusEmoji} ${dag.id} — ${dag.desc}`);
  console.log(`  ${bar} ${pct}% (${doneCount}/${totalNodes} nodes)`);
  console.log(`  📍 position: ${pos.position}`);
  if (pos.preGate.length) {
    console.log(`  🔍 ${pos.preGate.length} plan node(s) available for pre-gate investigation`);
  }
  if (pos.deps.length && !showDeps) {
    console.log(`  📦 ${pos.deps.length} dep(s) — use --deps for cross-repo view`);
  }
  console.log('');

  // Per-batch progress
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchDone = batch.filter(n => doneSet.has(n)).length;
    const batchPct = Math.round((batchDone / batch.length) * 100);
    const bFilled = Math.round((batchDone / batch.length) * 15);
    const bBar = '█'.repeat(bFilled) + '░'.repeat(15 - bFilled);

    const levelEmoji = batchPct === 100 ? '✅' : batchDone > 0 ? '🔶' : '⬜';
    const nodeList = batch.map(n => {
      const node = dag.nodes[n as keyof typeof dag.nodes] as any;
      const planTag = node?.mode === 'plan' ? '📋' : '';
      const cpTag = cpSet.has(n) ? '⚡' : '';
      if (pos.position.includes(n)) {
        const claim = claimStore[n];
        let claimTag = '';
        if (claim) {
          const expired = isExpired(claim, now);
          if (!expired) {
            const secsLeft = Math.max(0, Math.floor((new Date(claim.claimExpiry).getTime() - now.getTime()) / 1000));
            const m = Math.floor(secsLeft / 60);
            const s = String(secsLeft % 60).padStart(2, '0');
            claimTag = ` [${claim.owner} ⏱${m}:${s}]`;
          } else {
            claimTag = ` [${claim.owner} ⌛expired]`;
          }
        }
        return `👉 ${cpTag}${planTag}${n}${claimTag}`;
      }
      if (retiredIds.has(n)) return `⏭️ ${n}`;
      if (doneSet.has(n)) return `✅ ${cpTag}${planTag}${n}`;
      if (preGateSet.has(n)) return `🔍 ${cpTag}${planTag}${n}`;
      return `⬜ ${cpTag}${planTag}${n}`;
    }).join('  ');

    console.log(`  ${levelEmoji} L${String(i).padStart(2, '0')} ${bBar} ${String(batchPct).padStart(3)}%  ${nodeList}`);
  }

  console.log('');
  if (pct === 100) {
    console.log('  🎉 ROADMAP COMPLETE');
  } else {
    const next = pos.remaining[0];
    if (next) {
      const nextNode = dag.nodes[next as keyof typeof dag.nodes] as any;
      console.log(`  ➡️  Next: ${next} — ${nextNode?.desc || ''}`);
    }
  }

  if (showCritical) {
    const cp = criticalPath(dag);
    console.log(`  ⚡ Critical path (${cp.length} nodes): ${cp.join(' → ')}`);
  }

  console.log('');
}

function cmdDiff() {
  if (!hasLocalDAG) {
    console.log('No roadmap in this repo.');
    process.exit(1);
  }

  const target = args[1];
  if (!target) {
    console.log('Usage: roadmap diff <path-to-old-head.json>');
    console.log('       roadmap diff <git-ref>');
    process.exit(1);
  }

  const verbose = args.includes('--verbose');
  const currentDag = loadDAG();

  // Load old DAG — try git ref first, then file path
  let oldDag: Record<string, any>;
  if (existsSync(target)) {
    oldDag = JSON.parse(readFileSync(target, 'utf-8'));
  } else {
    // Try as git ref
    try {
      const content = execSync(
        `git show ${target}:.roadmap/head.json`,
        { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      oldDag = JSON.parse(content);
    } catch {
      console.log(`Cannot load DAG from "${target}" — not a file path or valid git ref.`);
      process.exit(1);
    }
  }

  const oldNodes = new Map(Object.entries(oldDag.nodes ?? {}));
  const newNodes = new Map(Object.entries(currentDag.nodes));

  const added = [...newNodes.keys()].filter(id => !oldNodes.has(id));
  const removed = [...oldNodes.keys()].filter(id => !newNodes.has(id));
  const common = [...newNodes.keys()].filter(id => oldNodes.has(id));

  // Per-node diff on common nodes
  type FieldDiff = { field: string; added: string[]; removed: string[] };
  const modified: { id: string; diffs: FieldDiff[] }[] = [];

  for (const id of common) {
    const o = oldNodes.get(id) as any;
    const n = newNodes.get(id) as any;
    const diffs: FieldDiff[] = [];

    // Compare array fields
    for (const field of ['produces', 'deps'] as const) {
      const oldArr: string[] = o[field] ?? [];
      const newArr: string[] = (n as any)[field] ?? [];
      const a = newArr.filter((x: string) => !oldArr.includes(x));
      const r = oldArr.filter((x: string) => !newArr.includes(x));
      if (a.length || r.length) diffs.push({ field, added: a, removed: r });
    }

    // Compare consumes (normalize ConsumeSpec to string)
    const oldConsumes: string[] = (o.consumes ?? []).map((c: any) => typeof c === 'string' ? c : c.artifact);
    const newConsumes: string[] = (n as any).consumes.map((c: any) => consumeArtifact(c as ConsumeSpec));
    const ca = newConsumes.filter(x => !oldConsumes.includes(x));
    const cr = oldConsumes.filter(x => !newConsumes.includes(x));
    if (ca.length || cr.length) diffs.push({ field: 'consumes', added: ca, removed: cr });

    // Compare validate (by stringified form)
    const oldVal = (o.validate ?? []).map((v: any) => JSON.stringify(v));
    const newVal = ((n as any).validate ?? []).map((v: any) => JSON.stringify(v));
    const va = newVal.filter((x: string) => !oldVal.includes(x));
    const vr = oldVal.filter((x: string) => !newVal.includes(x));
    if (va.length || vr.length) {
      diffs.push({ field: 'validate', added: va.map((x: string) => JSON.parse(x).type ?? x), removed: vr.map((x: string) => JSON.parse(x).type ?? x) });
    }

    // Compare mode
    const oldMode = o.mode ?? 'execute';
    const newMode = (n as any).mode ?? 'execute';
    if (oldMode !== newMode) {
      diffs.push({ field: 'mode', added: [newMode], removed: [oldMode] });
    }

    // Compare desc (only with --verbose)
    if (verbose && o.desc !== (n as any).desc) {
      diffs.push({ field: 'desc', added: [(n as any).desc], removed: [o.desc] });
    }

    if (diffs.length) modified.push({ id, diffs });
  }

  // Output
  if (!added.length && !removed.length && !modified.length) {
    console.log('No changes.');
    return;
  }

  if (added.length) {
    console.log(`+ added:    ${added.join(', ')}`);
  } else {
    console.log('+ added:    (none)');
  }

  if (removed.length) {
    console.log(`- removed:  ${removed.join(', ')}`);
  } else {
    console.log('- removed:  (none)');
  }

  for (const m of modified) {
    console.log(`~ modified: ${m.id}`);
    for (const d of m.diffs) {
      const parts: string[] = [];
      if (d.added.length) parts.push(`+ ${d.added.join(', ')}`);
      if (d.removed.length) parts.push(`- ${d.removed.join(', ')}`);
      console.log(`    ${d.field}: ${parts.join('  ')}`);
    }
  }
}

function cmdShow() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const dag = loadDAG();
  const retiredIds = retiredSet();
  const pos = orient(dag, fileExists(repoRoot), retiredIds);
  const doneSet = new Set(pos.done);
  const claimStore = loadClaims(repoRoot);
  const active = activeClaims(claimStore);
  const batches = parallelOrder(dag);

  // Build level index
  const levelOf = new Map<string, number>();
  for (let i = 0; i < batches.length; i++) {
    for (const id of batches[i]) levelOf.set(id, i);
  }

  function nodeToJSON(id: string) {
    const node = (dag.nodes as Record<string, any>)[id];
    if (!node) return null;
    const claim = active[id];
    return {
      id: node.id,
      desc: node.desc,
      produces: node.produces,
      consumes: node.consumes,
      ...(node.ambient?.length ? { ambient: node.ambient } : {}),
      deps: node.deps,
      validate: node.validate,
      idempotent: node.idempotent,
      mode: node.mode ?? 'execute',
      ...(node.expandedFrom ? { expandedFrom: node.expandedFrom } : {}),
      ...(node.loopTarget ? { loopTarget: node.loopTarget, ...(node.convergenceCheck ? { convergenceCheck: node.convergenceCheck } : {}) } : {}),
      level: levelOf.get(id) ?? -1,
      status: retiredIds.has(id) ? 'retired' : doneSet.has(id) ? 'done' : pos.batchRemaining.includes(id) ? 'in-progress' : 'pending',
      ...(claim ? { claim: { owner: claim.owner, expiry: claim.claimExpiry } } : {}),
    };
  }

  // show --cluster <id> — all nodes in a cluster with internal order
  if (args.includes('--cluster')) {
    const clusterId = args[args.indexOf('--cluster') + 1];
    if (!clusterId) {
      json({ error: 'Missing cluster ID', fix: 'roadmap show --cluster <cluster-id>' });
      process.exit(1);
    }
    const maxSizeIdx = args.indexOf('--max-size');
    const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1] ?? '8', 10) : undefined;
    const clusters = buildClusters(dag, { maxSize });
    const cluster = clusters.clusters.find(c => c.id === clusterId);
    if (!cluster) {
      json({ error: `Cluster not found: ${clusterId}`, fix: `Valid clusters: ${clusters.clusters.map(c => c.id).slice(0, 10).join(', ')}...` });
      process.exit(1);
    }
    const nodes = cluster.internalOrder.map(nodeToJSON).filter(Boolean);
    json({
      cluster: cluster.id,
      internalOrder: cluster.internalOrder,
      produces: cluster.produces,
      consumes: cluster.consumes,
      crossClusterDeps: cluster.crossClusterDeps,
      coupling: cluster.coupling,
      critical: cluster.critical,
      nodes,
    });
    return;
  }

  // show --batch [level] — all nodes at a level
  if (args.includes('--batch')) {
    const batchArg = args[args.indexOf('--batch') + 1];
    let level: number;

    if (batchArg === undefined || batchArg.startsWith('-')) {
      // No level specified — use current batch
      level = pos.level;
    } else {
      // Parse L03 or plain number
      level = parseInt(batchArg.replace(/^L/i, ''), 10);
    }

    if (isNaN(level) || level < 0 || level >= batches.length) {
      json({ error: `Invalid batch level: ${batchArg}`, fix: `Valid range: 0-${batches.length - 1}` });
      process.exit(1);
    }

    const nodes = batches[level].map(nodeToJSON).filter(Boolean);
    json({ level, nodes });
    return;
  }

  // show <node-id> — single node spec
  const nodeId = args[1];
  if (!nodeId) {
    json({ error: 'Missing node ID', fix: 'roadmap show <node-id> or roadmap show --batch [level]' });
    process.exit(1);
  }

  const result = nodeToJSON(nodeId);
  if (!result) {
    json({ error: `Node not found: ${nodeId}`, fix: `Valid nodes: ${Object.keys(dag.nodes).slice(0, 10).join(', ')}...` });
    process.exit(1);
  }
  json(result);
}

async function cmdCheckpoint(note: string | undefined) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const labelIdx = args.indexOf('--label');
  const label = labelIdx !== -1 ? args[labelIdx + 1] : undefined;

  // --list: show existing checkpoints
  if (args.includes('--list')) {
    const cpDir = join(repoRoot, '.roadmap', 'checkpoints');
    if (!existsSync(cpDir)) {
      json({ checkpoints: [] });
      return;
    }
    const files = readdirSync(cpDir).filter(f => f.endsWith('.json')).sort().reverse();
    const checkpoints = files.map(f => {
      try {
        return JSON.parse(readFileSync(join(cpDir, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
    json({ checkpoints });
    return;
  }

  // --restore: restore from latest or labeled checkpoint
  if (args.includes('--restore')) {
    const { CheckpointManager } = await import('../src/lib/checkpoint.ts');
    const mgr = new CheckpointManager(repoRoot);
    const result = await mgr.restore();
    if (!result) {
      json({ error: 'No valid checkpoint found', fix: 'Create a checkpoint first: roadmap checkpoint --label <name> --note "reason"' });
      process.exit(1);
    }
    recordTrail({
      ts: new Date().toISOString(), cmd: 'checkpoint', note: note ?? 'restore',
      repo: basename(repoRoot), position: result.position,
      detail: { restored: result.checkpoint.id },
    });
    json({ restored: true, checkpoint: result.checkpoint.id, position: result.position });
    return;
  }

  // Create checkpoint
  if (!label) {
    json({ error: 'Missing --label', fix: 'roadmap checkpoint --label <name> --note "reason"' });
    process.exit(1);
  }

  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot), retiredSet());

  // Collect existing artifact paths
  const allProduces: string[] = [];
  for (const nodeId of pos.done) {
    const node = (dag.nodes as Record<string, any>)[nodeId];
    if (node?.produces) allProduces.push(...node.produces);
  }
  const existingArtifacts = allProduces.filter(p => existsSync(join(repoRoot, p)));

  const { CheckpointManager } = await import('../src/lib/checkpoint.ts');
  const mgr = new CheckpointManager(repoRoot);
  const agent = process.env.AGENT_ID || process.env.USER || 'unknown';

  const checkpoint = await mgr.saveCheckpoint({
    position: pos.position,
    phase: label,
    artifacts: existingArtifacts.map(p => join(repoRoot, p)),
    agent,
    duration: 0,
    success: true,
  });

  const trailNote = note ?? `checkpoint: ${label}`;
  recordTrail({
    ts: new Date().toISOString(), cmd: 'checkpoint', note: trailNote,
    repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
    detail: { label, checkpointId: checkpoint.id, artifacts: existingArtifacts.length },
  });

  json({ created: true, label, checkpointId: checkpoint.id, position: pos.position, artifacts: existingArtifacts.length });
}

// roadmap complete <node-id> --owner <agent> [--ttl <s>] --note "reason"
// Atomically: claim node → write checkpoint → reorient.
// Replaces the 5-call sequence: claim + checkpoint --label + orient + (advance?) + trail.
async function cmdComplete(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeId = args[1];
  if (!nodeId) {
    json({ error: 'Missing node ID', fix: 'roadmap complete <node-id> --note "reason"' });
    process.exit(1);
  }

  const dag = loadDAG();
  const allNodes = Object.keys(dag.nodes);
  if (!allNodes.includes(nodeId)) {
    json({ error: `Node "${nodeId}" not found`, available: allNodes.slice(0, 10) });
    process.exit(1);
  }

  const ownerIdx = args.indexOf('--owner');
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1]
    : (process.env['AGENT_ID'] ?? process.env['USER'] ?? 'unknown');

  const ttlIdx = args.indexOf('--ttl');
  const ttlSeconds = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1] ?? '300', 10) : 300;

  // 1. Claim — idempotent if this owner already holds it
  const claimStore = loadClaims(repoRoot);
  const existing = claimStore[nodeId];
  const pos = orient(dag, fileExists(repoRoot), retiredSet());

  if (!pos.position.includes(nodeId) && !pos.batchRemaining.includes(nodeId)) {
    json({
      error: `Node "${nodeId}" is not in the current batch`,
      currentBatch: pos.position,
      fix: 'complete only works on nodes in the current batch',
    });
    process.exit(1);
  }

  if (!existing || isExpired(existing) || existing.owner === owner) {
    // Claim (or re-claim for same owner)
    const now = new Date();
    const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    claimStore[nodeId] = { owner, claimedAt: now.toISOString(), claimExpiry };
    saveClaims(repoRoot, claimStore);
  } else {
    // Active claim by different owner
    json({
      error: `Node "${nodeId}" is claimed by "${existing.owner}"`,
      claimExpiry: existing.claimExpiry,
      fix: 'Wait for the claim to expire or coordinate with the owner',
    });
    process.exit(1);
  }

  // 1.5 Validate — run deterministic validators + optional intent gate.
  //
  // Default complete: intent rules are non-blocking; output signals which
  // statements need LLM judgment and which context files to read.
  //
  // complete --evaluate '[{statement, confidence, reasoning, evidence?}]':
  //   LLM provides judgments for each intent rule inline. roadmap validates
  //   confidence >= threshold and records to .roadmap/evaluations/ audit trail.
  const skipValidate = args.includes('--skip-validate');
  const evaluateIdx = args.indexOf('--evaluate');
  const evaluateJson = evaluateIdx !== -1 ? args[evaluateIdx + 1] : undefined;
  const useExplore = args.includes('--explore');

  let intentJudgments: Array<{ statement: string; confidence: number; reasoning: string; evidence?: string[] }> | undefined;
  if (evaluateJson) {
    try {
      intentJudgments = JSON.parse(evaluateJson);
      if (!Array.isArray(intentJudgments)) throw new Error('--evaluate must be a JSON array');
    } catch (e: any) {
      json({ error: `Invalid --evaluate JSON: ${e.message}`, fix: 'roadmap complete <node> --evaluate \'[{"statement":"...","confidence":0.9,"reasoning":"..."}]\'' });
      process.exit(1);
    }
  }

  // Collect runtime-explore results when --explore is passed
  let exploreResults: Array<{ script: string; success: boolean; result?: import('../src/protocol.ts').ExploreResult; error?: string }> | undefined;
  if (useExplore && !skipValidate) {
    const nodeSpec = (dag.nodes as Record<string, any>)[nodeId];
    const exploreRules = ((nodeSpec?.validate ?? []) as any[]).filter((r: any) => r.type === 'runtime-explore');

    if (exploreRules.length > 0) {
      const { launchApp, runExploreScript, teardown: teardownApp } = await import('../src/lib/runtime-explore.ts');
      exploreResults = [];

      for (const rule of exploreRules) {
        let handle: import('../src/lib/runtime-explore.ts').LaunchHandle | undefined;
        try {
          handle = await launchApp({
            command: rule.launch ?? 'npx electron .',
            port: rule.port ?? 9222,
            timeout: rule.timeout ?? 10000,
            buildCommand: undefined,
          });

          const scriptResult = await runExploreScript({
            script: rule.script,
            cdpUrl: handle.cdpUrl,
            port: handle.port,
            timeout: rule.timeout ?? 30000,
          });

          exploreResults.push({ script: rule.script, ...scriptResult });
        } catch (e: any) {
          exploreResults.push({ script: rule.script, success: false, error: e.message });
        } finally {
          if (handle) teardownApp(handle.process);
        }
      }
    }
  }

  if (!skipValidate) {
    const { validateNode } = await import('../src/protocol.ts');
    const validationOpts: Record<string, any> = {};
    if (intentJudgments) validationOpts.intentJudgments = intentJudgments;
    if (exploreResults) validationOpts.exploreResults = exploreResults;
    const validationResult = await validateNode(dag, nodeId, fileExists(repoRoot),
      Object.keys(validationOpts).length > 0 ? validationOpts : undefined,
    );

    // Collect intent checks for surfacing in output
    const nodeSpec = (dag.nodes as Record<string, any>)[nodeId];
    const unevaluated = validationResult.checks
      .filter((c: any) => c.intentStatus === 'unevaluated')
      .map((c: any) => ({
        statement: (c.rule as any).statement,
        evaluator: (c.rule as any).evaluator,
        threshold: (c.rule as any).confidence,
        contextPaths: (c.rule as any).context ?? (nodeSpec?.produces ?? []),
      }));

    if (!validationResult.passed) {
      // Check for intent failures with expandOnFail before rejecting
      if (intentJudgments) {
        const { extractIntentFailures, generateIntentExpansion, detectStall, buildEscalation } = await import('../src/lib/intent-expansion.ts');
        const intentFailures = extractIntentFailures(validationResult.checks, intentJudgments);

        if (intentFailures.length > 0) {
          const nodeSpec = (dag.nodes as Record<string, any>)[nodeId];
          const currentDepth = (nodeSpec as any)?._intentDiagnosis?.expansionDepth ?? 0;
          const maxDepth = Math.max(...intentFailures.map(f => f.rule.maxExpansionDepth ?? 3));

          // Check depth limit
          if (currentDepth >= maxDepth) {
            const history = intentFailures.map(f => ({ depth: currentDepth, confidence: f.achieved }));
            const escalation = buildEscalation(nodeId, intentFailures[0].statement, history, 'depth-exceeded');
            delete claimStore[nodeId];
            saveClaims(repoRoot, claimStore);
            json(escalation);
            process.exit(1);
          }

          // Check stall detection
          if ((nodeSpec as any)?._intentDiagnosis) {
            const priorConfidence = (nodeSpec as any)._intentDiagnosis.achievedConfidence;
            const history = [{ depth: currentDepth - 1, confidence: priorConfidence }];
            for (const f of intentFailures) {
              if (detectStall(history, f.achieved)) {
                const fullHistory = [...history, { depth: currentDepth, confidence: f.achieved }];
                const escalation = buildEscalation(nodeId, f.statement, fullHistory, 'stalled');
                delete claimStore[nodeId];
                saveClaims(repoRoot, claimStore);
                json(escalation);
                process.exit(1);
              }
            }
          }

          // Extract cost budget from intent rules (precedence: per-rule, then global limits)
          let maxExpansionCost: number | undefined;
          for (const failure of intentFailures) {
            const ruleBudget = (failure.rule as any).maxExpansionCost;
            if (ruleBudget !== undefined) {
              maxExpansionCost = ruleBudget;
              break; // Use first rule's budget if defined
            }
          }

          // Generate fix nodes and write expansion script
          const expansion = generateIntentExpansion(
            nodeId,
            nodeSpec?.produces ?? [],
            nodeSpec?.consumes ?? [],
            nodeSpec?.ambient,
            nodeSpec?.validate ?? [],
            intentFailures,
            currentDepth,
            { maxExpansionCost },
            'opus-all', // default model allocation
            0, // initial cumulative cost
          );

          // Handle budget-exceeded escalation
          if (expansion.status === 'escalated') {
            delete claimStore[nodeId];
            saveClaims(repoRoot, claimStore);
            const escalationOutput: any = {
              status: 'escalated',
              node: nodeId,
              reason: 'budget-exceeded',
              detail: {
                statement: intentFailures[0].statement,
                budgetInfo: {
                  maxBudget: maxExpansionCost,
                  cumulativeCost: expansion.cumulativeCost ?? 0,
                  levelCost: expansion.costHistory?.[0]?.levelTotal ?? 0,
                  shortfall: (expansion.cumulativeCost ?? 0) - (maxExpansionCost ?? 0),
                  costHistory: expansion.costHistory,
                },
              },
            };
            json(escalationOutput);
            process.exit(1);
          }

          const { writeExpansionScript } = await import('../src/lib/expansion-writer.ts');
          const scriptPath = writeExpansionScript({
            parentId: nodeId,
            parentNode: nodeSpec,
            failures: intentFailures,
            fixNodes: expansion.fixNodes,
            reason: 'intent-expansion',
            repoRoot,
          });

          const relativeScriptPath = scriptPath.startsWith(repoRoot)
            ? scriptPath.slice(repoRoot.length + 1)
            : scriptPath;

          delete claimStore[nodeId];
          saveClaims(repoRoot, claimStore);

          recordTrail({
            ts: new Date().toISOString(), cmd: 'complete', note,
            repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
            detail: { nodeId, owner, status: 'expanding', script: relativeScriptPath, fixNodes: expansion.fixNodes.map(n => n.id), depth: expansion.depth },
          });

          json({
            completed: false,
            node: nodeId,
            validation: {
              passed: false,
              expandable: true,
              script: relativeScriptPath,
              failedIntents: intentFailures.map(f => ({
                statement: f.statement,
                achieved: f.achieved,
                threshold: f.threshold,
                reasoning: f.reasoning,
              })),
              nextStep: `Review the expansion script, then run: roadmap expand ${relativeScriptPath}`,
            },
          });
          return;
        }
      }

      delete claimStore[nodeId];
      saveClaims(repoRoot, claimStore);
      json({
        error: `Validation failed for "${nodeId}"`,
        checks: validationResult.checks,
        failedCount: validationResult.checks.filter((c: any) => !c.passed).length,
        fix: 'Fix the failing validations and retry. Use --skip-validate to override.',
        ...(unevaluated.length ? { unevaluated } : {}),
      });
      process.exit(1);
    }

    // Record evaluated judgments to audit trail
    if (intentJudgments) {
      const rules = (nodeSpec?.validate ?? []) as any[];
      for (const j of intentJudgments) {
        const rule = rules.find((r: any) => r.type === 'intent' && r.statement === j.statement);
        if (rule) recordEvaluation(nodeId, judgmentToRecord(nodeId, j, rule.evaluator, rule.confidence), repoRoot);
      }
    }

    // Surface unevaluated intents on successful completion so LLM knows what to judge
    if (unevaluated.length) {
      (validationResult as any)._unevaluated = unevaluated;
    }
  }

  // 2. Checkpoint
  const allProduces: string[] = [];
  for (const nid of (pos.done ?? [])) {
    const n = (dag.nodes as Record<string, any>)[nid];
    if (n?.produces) allProduces.push(...n.produces);
  }
  const existingArtifacts = allProduces.filter(p => existsSync(join(repoRoot, p)));

  const { CheckpointManager } = await import('../src/lib/checkpoint.ts');
  const mgr = new CheckpointManager(repoRoot);
  const checkpoint = await mgr.saveCheckpoint({
    position: pos.position,
    phase: `complete:${nodeId}`,
    artifacts: existingArtifacts.map(p => join(repoRoot, p)),
    agent: owner,
    duration: 0,
    success: true,
  });

  // 3. Reorient
  const posAfter = orient(dag, fileExists(repoRoot), retiredSet());

  // 4. Auto-advance if this agent completed the last node in the batch.
  // Suppress with --no-advance for orchestrators that want to gate manually.
  let advanced: { previousBatch: string[]; nextBatch: string[]; nextLevel: number } | undefined;
  const noAdvance = args.includes('--no-advance');
  if (posAfter.batchComplete && !noAdvance && !posAfter.complete) {
    try {
      const { advanceBatch } = await import('../src/protocol.ts');
      const next = await advanceBatch(dag, fileExists(repoRoot), retiredSet());
      advanced = { previousBatch: posAfter.position, nextBatch: next.position, nextLevel: next.level };
    } catch {
      // advanceBatch failed (e.g. missing artifacts) — surface batchComplete without advancing
    }
  }

  const finalPos = advanced
    ? orient(dag, fileExists(repoRoot), retiredSet())
    : posAfter;

  // 5. Surface newly unblocked nodes — downstream nodes whose deps are now all satisfied.
  const nowReady = readyNodes(dag, fileExists(repoRoot), retiredSet());
  const unblocked = nowReady.map(n => n.id);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'complete', note,
    repo: basename(repoRoot), position: finalPos.position, level: finalPos.level, dagId: dag.id,
    detail: { nodeId, owner, checkpointId: checkpoint.id, batchComplete: posAfter.batchComplete, advanced: !!advanced, skipValidate, evaluated: !!intentJudgments, explored: !!exploreResults, unblocked },
  });

  json({
    completed: nodeId,
    owner,
    checkpointId: checkpoint.id,
    position: finalPos.position,
    batchComplete: finalPos.batchComplete,
    batchRemaining: finalPos.batchRemaining,
    unblocked,
    ...(advanced ? { advanced } : {}),
    ...(posAfter.batchComplete && !advanced && !noAdvance ? { hint: 'roadmap advance --note "batch done"' } : {}),
    ...(intentJudgments ? { evaluated: intentJudgments.length } : {}),
    ...(exploreResults ? { explored: exploreResults.length, exploreResults: exploreResults.map(r => ({ script: r.script, success: r.success, observations: r.result?.observations?.length ?? 0, error: r.error })) } : {}),
  });
}

function cmdCommit(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeIdx = args.indexOf('--node');
  if (nodeIdx === -1 || !args[nodeIdx + 1]) {
    json({ error: 'Missing --node <id>', fix: 'roadmap commit --node <id> --message "what changed" --note "why"' });
    process.exit(1);
  }
  const nodeId = args[nodeIdx + 1];

  const msgIdx = args.indexOf('--message');
  const message = msgIdx !== -1 ? args[msgIdx + 1] : undefined;
  if (!message) {
    json({ error: 'Missing --message', fix: 'roadmap commit --node <id> --message "what changed" --note "why"' });
    process.exit(1);
  }

  const dag = loadDAG();
  const node = (dag.nodes as Record<string, any>)[nodeId];
  if (!node) {
    json({ error: `Node not found: ${nodeId}`, fix: `Valid nodes: ${Object.keys(dag.nodes).slice(0, 10).join(', ')}...` });
    process.exit(1);
  }

  const pos = orient(dag, fileExists(repoRoot), retiredSet());

  // Stage the node's produces
  const produces: string[] = node.produces ?? [];
  if (produces.length === 0) {
    json({ error: `Node ${nodeId} has no produces — nothing to commit` });
    process.exit(1);
  }

  // Verify all produces exist before staging
  const missing = produces.filter(p => !existsSync(join(repoRoot, p)));
  if (missing.length) {
    json({ error: `Missing artifacts: ${missing.join(', ')}`, fix: 'Produce all artifacts before committing' });
    process.exit(1);
  }

  // Stage exactly the produces
  for (const p of produces) {
    execSync(`git add "${p}"`, { cwd: repoRoot, stdio: 'pipe' });
  }

  // Build commit message with node trailer
  const fullMessage = `${message}\n\n[node: ${nodeId}]`;
  execSync(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, { cwd: repoRoot, stdio: 'pipe' });
  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  // Update git-state.json
  const gitStatePath = join(repoRoot, '.roadmap', 'git-state.json');
  try {
    const { createGitState, recordArtifact } = require('../src/git-state.schema.ts');
    let state = existsSync(gitStatePath)
      ? JSON.parse(readFileSync(gitStatePath, 'utf-8'))
      : createGitState();
    const fullHash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
    for (const p of produces) {
      state = recordArtifact(state, p, fullHash);
    }
    writeFileSync(gitStatePath, JSON.stringify(state, null, 2));
  } catch {
    // git-state update is best-effort; post-commit hook will also run
  }

  recordTrail({
    ts: new Date().toISOString(), cmd: 'commit', note,
    repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
    detail: { node: nodeId, produces, commit: hash },
  });

  json({ committed: true, node: nodeId, produces, commit: hash });
}

async function cmdMergeFrom() {
  if (!hasLocalDAG) {
    json({ error: 'No local DAG', fix: 'Run from a repo with .roadmap/head.json' });
    process.exit(1);
  }

  const fromIdx = args.indexOf('--from');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    json({ error: 'Missing --from <path>', fix: 'roadmap merge --from ../sibling --note "reason"' });
    process.exit(1);
  }

  const siblingPath = resolve(repoRoot, args[fromIdx + 1]);
  const sibDagPath = join(siblingPath, '.roadmap/head.json');
  if (!existsSync(sibDagPath)) {
    json({ error: `No DAG at ${siblingPath}`, fix: 'Sibling repo needs .roadmap/head.json' });
    process.exit(1);
  }

  const localDag = loadDAG();
  const sibDag = JSON.parse(readFileSync(sibDagPath, 'utf-8')) as Graph<string>;

  // Find artifact connections: where sibling produces satisfy local consumes
  const localNodes = Object.values(localDag.nodes) as any[];
  const sibNodes = Object.values(sibDag.nodes) as any[];

  const sibProduces = new Set(sibNodes.flatMap((n: any) => n.produces));
  const connections: Array<{ localNode: string; siblingNode: string; artifact: string }> = [];

  for (const ln of localNodes) {
    for (const consumed of ln.consumes) {
      if (sibProduces.has(consumed)) {
        const producer = sibNodes.find((sn: any) => sn.produces.includes(consumed));
        if (producer) {
          connections.push({ localNode: ln.id, siblingNode: producer.id, artifact: consumed });
        }
      }
    }
  }

  // Also find where local produces satisfy sibling consumes (reverse)
  const localProduces = new Set(localNodes.flatMap((n: any) => n.produces));
  const reverseConnections: Array<{ localNode: string; siblingNode: string; artifact: string }> = [];

  for (const sn of sibNodes) {
    for (const consumed of sn.consumes) {
      if (localProduces.has(consumed)) {
        const producer = localNodes.find((ln: any) => ln.produces.includes(consumed));
        if (producer) {
          reverseConnections.push({ localNode: producer.id, siblingNode: sn.id, artifact: consumed });
        }
      }
    }
  }

  json({
    local: { id: localDag.id, nodes: Object.keys(localDag.nodes).length },
    sibling: { id: sibDag.id, path: siblingPath, nodes: Object.keys(sibDag.nodes).length },
    connections: { siblingToLocal: connections, localToSibling: reverseConnections },
    summary: `${connections.length} artifact(s) flow sibling→local, ${reverseConnections.length} flow local→sibling`,
  });
}

function cmdInstall() {
  const scriptDir = resolve(import.meta.dirname || join(repoRoot, 'bin'));
  const binPath = join(scriptDir, 'roadmap');

  const useSkills = args.includes('--skills') || args.includes('--update');
  const useCheck = args.includes('--check');
  const noClaudeMd = args.includes('--no-claude-md');
  const constraintsPath = args.includes('--constraints')
    ? args[args.indexOf('--constraints') + 1]
    : undefined;

  // --check: report stale skills without modifying
  if (useCheck) {
    return cmdInstallCheck(binPath);
  }

  // --skills / --update: install skill files + slim CLAUDE.md
  if (useSkills) {
    return cmdInstallSkills(binPath, noClaudeMd, constraintsPath);
  }

  // Legacy mode: prose protocol in CLAUDE.md
  return cmdInstallLegacy(binPath);
}

function cmdInstallCheck(binPath: string): void {
  const skillsDir = join(repoRoot, '.claude', 'skills');
  if (!existsSync(skillsDir)) {
    console.log('No skills installed (missing .claude/skills/)');
    return;
  }

  const version = readPackageVersion();
  const dirs = readdirSync(skillsDir).filter(d => d.startsWith('roadmap-'));
  if (dirs.length === 0) {
    console.log('No roadmap skills found in .claude/skills/');
    return;
  }

  let staleCount = 0;
  for (const dir of dirs) {
    const skillFile = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillFile)) {
      console.log(`  ? ${dir}/SKILL.md — missing`);
      staleCount++;
      continue;
    }
    const content = readFileSync(skillFile, 'utf-8');
    const installed = extractVersionHash(content);
    const id = dir.replace(/^roadmap-/, '');
    const current = computeSkillHash(id, version);

    if (!installed) {
      console.log(`  ? ${dir}/SKILL.md — no version hash`);
      staleCount++;
    } else if (installed !== current) {
      console.log(`  ⚠ ${dir}/SKILL.md — stale (installed: ${installed}, current: ${current})`);
      staleCount++;
    } else {
      console.log(`  ✓ ${dir}/SKILL.md — up to date`);
    }
  }

  if (staleCount > 0) {
    console.log(`\n${staleCount} skill(s) need update. Run: roadmap install --update`);
  } else {
    console.log('\nAll skills up to date.');
  }
}

function cmdInstallSkills(binPath: string, noClaudeMd: boolean, constraintsPath?: string): void {
  const targetDir = join(repoRoot, '.claude', 'skills');
  const result = installAll({
    targetDir,
    roadmapBin: binPath,
    constraints: constraintsPath,
  });

  console.log(`Installed ${result.installed.length} skill(s) to .claude/skills:`);
  for (const p of result.installed) {
    const rel = p.replace(repoRoot, '').replace(/^\//, '');
    console.log(`  + ${rel}`);
  }
  if (result.constraintsInstalled) {
    console.log(`  (constraints extracted from ${constraintsPath})`);
  }

  // Update CLAUDE.md with slim protocol pointer table
  if (!noClaudeMd) {
    const claudeMdPath = join(repoRoot, '.claude', 'CLAUDE.md');
    writeSlimProtocol(claudeMdPath);
  }

  console.log(`   bin: ${binPath}`);
}

function writeSlimProtocol(claudeMdPath: string): void {
  const ANCHOR_START = '<!-- ROADMAP-PROTOCOL-START -->';
  const ANCHOR_END = '<!-- ROADMAP-PROTOCOL-END -->';

  const slimBlock = `${ANCHOR_START}
## Roadmap Protocol

This project uses roadmap-governed execution via skills. Do not run roadmap CLI directly.

| Phase | Skill | When |
|---|---|---|
| Session start | \`/roadmap-start\` | Before any state-mutating work |
| Get work brief | \`/roadmap-work <node>\` | Before implementing a node |
| Submit work | \`/roadmap-done <node>\` | After implementing produces |
| Dispatch swarm | \`/roadmap-dispatch\` | Before spawning workers |
| Review DAG | \`/roadmap-review\` | Before committing DAG changes |
| Cross-roadmap triage | \`/roadmap-gallery\` | To see all roadmaps + pick what to work on |
| Progress checkpoint | \`/roadmap-progress\` | After batch close, on resume, every ~30min |
| Behavioral constraints | \`/roadmap-constraints\` | Reference for output standards |

Position comes from \`/roadmap-start\`, not memory. Never infer position.
Progress checkpoints use \`/roadmap-progress\` — interactive steering, not passive chart dumps.
${ANCHOR_END}`;

  const resolvedPath = resolve(claudeMdPath);

  if (!existsSync(resolvedPath)) {
    const dir = resolve(resolvedPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedPath, slimBlock + '\n');
    console.log(`Created ${resolvedPath} with slim protocol pointer table`);
    return;
  }

  let content = readFileSync(resolvedPath, 'utf-8');

  if (content.includes(ANCHOR_START) && content.includes(ANCHOR_END)) {
    const re = new RegExp(
      escapeRegex(ANCHOR_START) + '[\\s\\S]*?' + escapeRegex(ANCHOR_END),
    );
    content = content.replace(re, slimBlock);
    writeFileSync(resolvedPath, content);
    console.log(`Updated ${resolvedPath} — slim protocol pointer table`);
  } else {
    content = content.trimEnd() + '\n\n' + slimBlock + '\n';
    writeFileSync(resolvedPath, content);
    console.log(`Appended slim protocol pointer table to ${resolvedPath}`);
  }
}

function cmdInstallLegacy(binPath: string): void {
  const claudeMdPath = args[1] || join(repoRoot, '.claude', 'CLAUDE.md');
  const resolvedPath = resolve(claudeMdPath);

  const ANCHOR_START = '<!-- ROADMAP-PROTOCOL-START -->';
  const ANCHOR_END = '<!-- ROADMAP-PROTOCOL-END -->';

  const protocolBlock = `${ANCHOR_START}
## Roadmap Protocol

Every interaction that mutates state (code, files, config, infra, docs) is roadmap-governed. Only pure reasoning (Q&A, explanation, no artifacts) is exempt. Planning is a task — it produces a DAG.

### Session protocol

**Start** — run this before anything else:
\`\`\`
${binPath} orient --note "session start — <intent>"
\`\`\`
Then **reprint the chart verbatim**:
\`\`\`
${binPath} chart
\`\`\`
The chart output is the project status. Print it as-is in your response — do not summarize, paraphrase, or omit any part. This is how the user sees progress.

**During work** — orient after completing logical units:
\`\`\`
${binPath} orient --note "<what changed>"
${binPath} chart
\`\`\`
Reprint the chart after each orient. The user should always see current progress.

**End** — archive the session trail:
\`\`\`
${binPath} trail --archive
\`\`\`

### Behavior
- Position comes from orient, not memory — never infer
- If no local DAG exists: orient returns \`position: "untracked"\`, breadcrumb still records globally
- For multi-step work in an untracked repo: create \`.roadmap/head.json\` (init → term, expand between)
- Trail: \`trail --global\` for cross-project view, \`trail --repo <name>\` to filter, \`trail --last N\` for recent

### Chart
Run \`${binPath} chart\` frequently. **Always reprint the full output verbatim.** This is the canonical progress view — emoji progress bars, per-batch breakdown, current position. Never summarize it.
${ANCHOR_END}`;

  if (!existsSync(resolvedPath)) {
    const dir = resolve(resolvedPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedPath, protocolBlock + '\n');
    console.log(`Created ${resolvedPath} with roadmap protocol`);
    console.log(`   bin: ${binPath}`);
    return;
  }

  let content = readFileSync(resolvedPath, 'utf-8');

  if (content.includes(ANCHOR_START) && content.includes(ANCHOR_END)) {
    const re = new RegExp(
      escapeRegex(ANCHOR_START) + '[\\s\\S]*?' + escapeRegex(ANCHOR_END),
    );
    content = content.replace(re, protocolBlock);
    writeFileSync(resolvedPath, content);
    console.log(`Updated roadmap protocol in ${resolvedPath}`);
  } else {
    content = content.trimEnd() + '\n\n' + protocolBlock + '\n';
    writeFileSync(resolvedPath, content);
    console.log(`Appended roadmap protocol to ${resolvedPath}`);
  }
  console.log(`   bin: ${binPath}`);
}

function cmdInstallHooks(note: string): void {
  const scriptDir = resolve(import.meta.dirname || join(repoRoot, 'bin'));
  const hooksSourceDir = join(scriptDir, '..', 'hooks');
  const gitHooksDir = join(repoRoot, '.git', 'hooks');
  const configDest = join(repoRoot, '.roadmap', 'hook-config.json');

  if (!existsSync(join(repoRoot, '.git'))) {
    json({ error: 'Not a git repository', fix: 'Run from a repo with a .git directory' });
    process.exit(1);
  }

  if (!existsSync(gitHooksDir)) mkdirSync(gitHooksDir, { recursive: true });

  const hooks = ['pre-commit', 'post-commit', 'prepare-commit-msg', 'commit-msg'];
  const installed: string[] = [];

  for (const hook of hooks) {
    const tsPath = join(hooksSourceDir, `${hook}.ts`);
    const barePath = join(hooksSourceDir, hook);
    const targetPath = join(gitHooksDir, hook);

    if (existsSync(tsPath)) {
      // TypeScript hook — write a shell wrapper that invokes with strip-types.
      // The wrapper uses the absolute source path so relative imports resolve correctly.
      const absSource = resolve(tsPath);
      const wrapper = `#!/bin/sh\nexec node --experimental-strip-types "${absSource}" "$@"\n`;
      writeFileSync(targetPath, wrapper);
    } else if (existsSync(barePath)) {
      writeFileSync(targetPath, readFileSync(barePath, 'utf-8'));
    } else {
      console.log(`⏭️  No source for ${hook} — skipping`);
      continue;
    }

    execSync(`chmod +x ${targetPath}`, { stdio: 'pipe' });
    installed.push(hook);
    console.log(`✓ ${hook}`);
  }

  // Create config if missing
  if (!existsSync(configDest)) {
    const defaultConfig = {
      testEnforcement: {
        enabled: true,
        scope: ['src/', 'bin/'],
        testPattern: 'tests/**/*.test.ts',
      },
    };
    const configDir = resolve(configDest, '..');
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(configDest, JSON.stringify(defaultConfig, null, 2) + '\n');
  }

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'install-hooks',
    note,
    repo: basename(repoRoot),
    detail: { installed, configDest },
  });

  console.log(`\n✅ Installed ${installed.length} hook(s): ${installed.join(', ')}`);
  console.log(`   Config: ${configDest}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cmdRetire(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No local DAG', fix: 'Run from a repo with .roadmap/head.json' });
    process.exit(1);
  }

  const nodeId = args[1];
  if (!nodeId) {
    json({ error: 'Missing node ID', fix: 'roadmap retire <node-id> --note "reason"' });
    process.exit(1);
  }

  // --list: show currently retired nodes
  if (nodeId === '--list') {
    const retired = loadRetired();
    if (!retired.size) {
      json({ retired: [], count: 0 });
      return;
    }
    json({
      retired: [...retired.entries()].map(([id, e]) => ({ id, reason: e.reason, ts: e.ts, cascade: e.cascade })),
      count: retired.size,
    });
    return;
  }

  // --undo: un-retire a node
  if (args.includes('--undo')) {
    const retired = loadRetired();
    if (!retired.has(nodeId)) {
      json({ error: `Node "${nodeId}" is not retired` });
      process.exit(1);
    }
    retired.delete(nodeId);
    saveRetired(retired);
    const dag = loadDAG();
    const pos = orient(dag, fileExists(repoRoot));
    recordTrail({
      ts: new Date().toISOString(), cmd: 'retire', note,
      repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
      detail: { nodeId, action: 'undo' },
    });
    json({ undone: nodeId });
    return;
  }

  const dag = loadDAG();
  const allNodes = Object.keys(dag.nodes);

  if (!allNodes.includes(nodeId)) {
    json({ error: `Node "${nodeId}" not found in DAG`, available: allNodes.slice(0, 10) });
    process.exit(1);
  }

  const retired = loadRetired();
  const cascade = args.includes('--cascade');
  const toRetire = [nodeId];

  // Cascade: find all nodes whose only path to term goes through nodeId
  if (cascade) {
    const nodes = allNodes.map(id => (dag.nodes as any)[id]);
    for (const n of nodes) {
      if (n.id === nodeId || n.id === dag.init || n.id === dag.term) continue;
      // A node is cascade-retired if ALL its deps include a retired node (directly or transitively)
      if (n.deps.includes(nodeId) && !toRetire.includes(n.id)) {
        toRetire.push(n.id);
      }
    }
    // Transitive: keep expanding until stable
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (toRetire.includes(n.id) || n.id === dag.init || n.id === dag.term) continue;
        const allDepsRetired = n.deps.length > 0 && n.deps.every((d: string) => toRetire.includes(d) || retired.has(d));
        if (allDepsRetired) {
          toRetire.push(n.id);
          changed = true;
        }
      }
    }
  }

  const ts = new Date().toISOString();
  for (const id of toRetire) {
    retired.set(id, { reason: note, ts, cascade: cascade && id !== nodeId });
  }
  saveRetired(retired);

  const pos = orient(dag, fileExists(repoRoot));
  recordTrail({
    ts, cmd: 'retire', note,
    repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
    detail: { retired: toRetire, cascade },
  });

  json({ retired: toRetire, count: toRetire.length, cascade });
}

// --- claim: per-node ownership for parallel batch execution ---
// roadmap claim <node-id> [--owner <name>] [--ttl <seconds>]
// roadmap claim <node-id> --renew [--ttl <seconds>]   extend TTL; fails if expired
// roadmap claim <node-id> --release
// roadmap claim --list
function cmdClaim() {
  if (!hasLocalDAG) {
    json({ error: 'No local DAG', fix: 'Run from a repo with .roadmap/head.json' });
    process.exit(1);
  }

  const nodeId = args[1];

  // --list: show all claims with expiry status
  if (!nodeId || nodeId === '--list') {
    const store = loadClaims(repoRoot);
    const now = new Date();
    const entries = Object.entries(store).map(([id, c]) => ({
      nodeId: id,
      owner: c.owner,
      claimedAt: c.claimedAt,
      claimExpiry: c.claimExpiry,
      expired: isExpired(c, now),
    }));
    json({ claims: entries, count: entries.length });
    return;
  }

  const dag = loadDAG();
  const allNodes = Object.keys(dag.nodes);
  if (!allNodes.includes(nodeId)) {
    json({ error: `Node "${nodeId}" not found in DAG`, available: allNodes.slice(0, 10) });
    process.exit(1);
  }

  // --release: remove claim
  if (args.includes('--release')) {
    const store = loadClaims(repoRoot);
    if (!(nodeId in store)) {
      json({ released: nodeId, note: 'no claim existed' });
      return;
    }
    delete store[nodeId];
    saveClaims(repoRoot, store);
    json({ released: nodeId });
    return;
  }

  // --renew: extend TTL; fails if claim expired or owner mismatch
  if (args.includes('--renew')) {
    const renewOwnerIdx = args.indexOf('--owner');
    const renewOwner = renewOwnerIdx !== -1 ? args[renewOwnerIdx + 1]
      : (process.env['AGENT_ID'] ?? process.env['USER'] ?? 'unknown');
    const renewTtlIdx = args.indexOf('--ttl');
    const renewTtlSeconds = renewTtlIdx !== -1 ? parseInt(args[renewTtlIdx + 1] ?? '300', 10) : 300;

    const store = loadClaims(repoRoot);
    const existing = store[nodeId];

    if (!existing) {
      json({ error: `No claim exists for "${nodeId}"`, fix: 'Use roadmap claim ' + nodeId + ' to create a new claim' });
      process.exit(1);
    }
    if (isExpired(existing)) {
      json({ error: `Claim for "${nodeId}" has expired — cannot renew`, expiredAt: existing.claimExpiry, fix: 'Another agent may have taken this node. Verify before re-claiming.' });
      process.exit(1);
    }
    if (existing.owner !== renewOwner) {
      json({ error: `Cannot renew: claim owned by "${existing.owner}", not "${renewOwner}"` });
      process.exit(1);
    }

    const now = new Date();
    const claimExpiry = new Date(now.getTime() + renewTtlSeconds * 1000).toISOString();
    store[nodeId] = { ...existing, claimExpiry };
    saveClaims(repoRoot, store);
    json({ renewed: nodeId, owner: renewOwner, claimExpiry, ttlSeconds: renewTtlSeconds });
    return;
  }

  // Validate node is in current batch
  const pos = orient(dag, fileExists(repoRoot), retiredSet());
  if (!pos.position.includes(nodeId)) {
    json({
      error: `Node "${nodeId}" is not in the current batch`,
      currentBatch: pos.position,
      fix: 'Only nodes in the current batch can be claimed',
    });
    process.exit(1);
  }

  // Parse --owner and --ttl
  const ownerIdx = args.indexOf('--owner');
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1]
    : (process.env['AGENT_ID'] ?? process.env['USER'] ?? 'unknown');

  const ttlIdx = args.indexOf('--ttl');
  const ttlSeconds = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1] ?? '300', 10) : 300;
  if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
    json({ error: 'Invalid --ttl value; must be a positive integer (seconds)' });
    process.exit(1);
  }

  const now = new Date();
  const store = loadClaims(repoRoot);
  const existing = store[nodeId];

  // Collision checks
  if (existing) {
    if (!isExpired(existing, now) && existing.owner !== owner) {
      // Unexpired claim by a different agent
      json({
        error: `Node "${nodeId}" is already claimed`,
        claimedBy: existing.owner,
        claimExpiry: existing.claimExpiry,
        fix: 'Wait for expiry or ask the owner to release it with: roadmap claim ' + nodeId + ' --release',
      });
      process.exit(1);
    }
    if (isExpired(existing, now) && existing.owner === owner) {
      // Claim expired while same owner was away — require explicit re-claim acknowledgement
      json({
        error: `Your previous claim for "${nodeId}" has expired`,
        expiredAt: existing.claimExpiry,
        fix: 'Another agent may have worked on this node. If still needed, release and re-claim: roadmap claim ' + nodeId + ' --release && roadmap claim ' + nodeId,
      });
      process.exit(1);
    }
  }

  const claimedAt = now.toISOString();
  const claimExpiry = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  store[nodeId] = { owner, claimedAt, claimExpiry };
  saveClaims(repoRoot, store);

  json({ claimed: nodeId, owner, claimedAt, claimExpiry, ttlSeconds });
}

// --- import: parse spec-kit tasks.md into candidate roadmap DAG ---
// roadmap import --from speckit <file.md> --id <dag-id> [--desc "..."]
function cmdImport(note: string) {
  const fromIdx = args.indexOf('--from');
  if (fromIdx === -1 || args[fromIdx + 1] !== 'speckit') {
    json({ error: 'Missing --from speckit', fix: 'roadmap import --from speckit tasks.md --id my-project --note "..."' });
    process.exit(1);
  }

  const filePath = args[fromIdx + 2];
  if (!filePath || !existsSync(filePath)) {
    json({ error: `File not found: ${filePath}`, fix: 'Provide a path to a markdown tasks file' });
    process.exit(1);
  }

  const idIdx = args.indexOf('--id');
  const dagId = idIdx !== -1 ? args[idIdx + 1] : basename(filePath, '.md');
  if (!dagId) {
    json({ error: 'Missing --id', fix: 'roadmap import --from speckit tasks.md --id my-project --note "..."' });
    process.exit(1);
  }

  const descIdx = args.indexOf('--desc');
  const dagDesc = descIdx !== -1 ? args[descIdx + 1] : undefined;

  const content = readFileSync(filePath, 'utf-8');
  const tasks = parseTasksMd(content);
  if (tasks.length === 0) {
    json({ error: 'No tasks found in file', fix: 'Use format: - [P0] task-id: description' });
    process.exit(1);
  }

  const dag = tasksToDAG(tasks, { dagId, dagDesc });

  // Terminal intent gate invariant — warn (non-blocking on import, since enrichment adds gates)
  const terminalError = validateTerminalIntentGate(dag);

  // Init intent gate invariant — warn (non-blocking on import)
  const initError = validateInitIntentGate(dag);

  // Write to .roadmap/head.json
  const outDir = join(repoRoot, '.roadmap');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'head.json');
  writeFileSync(outPath, JSON.stringify(dag, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'import', note,
    repo: basename(repoRoot), position: ['init'], level: 0, dagId,
    detail: { source: filePath, tasks: tasks.length, nodes: Object.keys(dag.nodes).length },
  });

  const spawnPlan = buildSpawnPlan(dag);

  const result: Record<string, unknown> = {
    imported: true,
    dagId,
    source: filePath,
    tasks: tasks.length,
    nodes: Object.keys(dag.nodes).length,
    init: dag.init,
    term: dag.term,
    path: outPath,
    spawnPlan,
  };

  if (terminalError) {
    result.warningTerminal = terminalError.message;
    result.terminalIntentFix = terminalError.fix;
  }

  if (initError) {
    result.warningInit = initError.message;
    result.initIntentFix = initError.fix;
    result.initGateSuggestion = `roadmap init ${dagId}`;
  }

  json(result);
}

// --- init: add init gate node to DAG ---
// roadmap init <dag-id> --statement "Plan is clear" --threshold 0.95 --note "add init gate"
function cmdInit(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.', fix: 'Initialize a roadmap first with: roadmap import --from speckit <file.md> --id <dag-id> --note "..."' });
    process.exit(1);
  }

  const dagId = args[1]; // args[0] is 'init' (the command)
  if (!dagId) {
    json({ error: 'Missing dag-id argument', fix: 'roadmap init <dag-id> --statement "Plan is clear" --threshold 0.95 --note "..."' });
    process.exit(1);
  }

  const dag = loadDAG();
  if (dag.id !== dagId) {
    json({ error: `DAG ID mismatch: expected ${dag.id}, got ${dagId}`, fix: `roadmap init ${dag.id} --statement "Plan is clear" --threshold 0.95 --note "..."` });
    process.exit(1);
  }

  // Extract flags
  const statementIdx = args.indexOf('--statement');
  const statement = statementIdx !== -1 ? args[statementIdx + 1] : 'Plan is unambiguous and ready to execute';

  const thresholdIdx = args.indexOf('--threshold');
  const thresholdStr = thresholdIdx !== -1 ? args[thresholdIdx + 1] : '0.95';
  const threshold = parseFloat(thresholdStr);
  if (isNaN(threshold) || threshold <= 0 || threshold > 1) {
    json({ error: 'Invalid --threshold: must be between 0 and 1', fix: 'roadmap init <dag-id> --threshold 0.95 --statement "..." --note "..."' });
    process.exit(1);
  }

  // Check if init boundary already exists
  const initBoundary = findInitBoundary(dag);
  if (initBoundary.length > 0) {
    // Check if any node already has an intent rule with expandOnFail
    const hasInitGate = initBoundary.some(nodeId => {
      const node = (dag.nodes as Record<string, any>)[nodeId];
      return node?.validate?.some((r: any) => r.type === 'intent' && r.expandOnFail === true);
    });

    if (hasInitGate) {
      json({
        warning: 'Init gate already exists',
        existing: initBoundary,
        message: `Init boundary ${initBoundary.join(', ')} already has intent rule(s) with expandOnFail: true`,
      });
      return;
    }
  }

  // Create the init gate node
  const gateNodeId = 'plan-clarity';
  const existingInitGate = (dag.nodes as Record<string, any>)[gateNodeId];

  if (existingInitGate) {
    json({
      error: `Init gate node '${gateNodeId}' already exists`,
      fix: 'Modify the existing node or use a different gate name',
    });
    process.exit(1);
  }

  // Insert gate node after init, before first execute node
  const firstExecuteNode = initBoundary.length > 0 ? initBoundary[0] : undefined;

  const intentRule = {
    type: 'intent' as const,
    statement,
    confidence: 0,
    evaluator: 'self' as const,
    expandOnFail: true,
    maxExpansionDepth: 2,
  };

  const gateNode = {
    id: gateNodeId,
    desc: 'Plan clarity gate: verify that the roadmap intent is unambiguous',
    produces: [],
    consumes: [],
    deps: [dag.init],
    validate: [intentRule],
    idempotent: true,
    mode: 'plan' as const,
  };

  // Update DAG
  const newDag = { ...dag };
  (newDag.nodes as Record<string, any>)[gateNodeId] = gateNode;

  // If there's a first execute node, add the gate as a dependency
  if (firstExecuteNode) {
    const firstNode = (newDag.nodes as Record<string, any>)[firstExecuteNode];
    if (firstNode && !firstNode.deps.includes(gateNodeId)) {
      firstNode.deps = [...firstNode.deps, gateNodeId];
    }
  }

  // Validate the modified DAG
  try {
    define(newDag);
    check(newDag);
  } catch (e) {
    json({
      error: 'DAG validation failed after adding init gate',
      detail: e instanceof Error ? e.message : String(e),
    });
    process.exit(1);
  }

  // Write updated DAG
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  writeFileSync(headPath, JSON.stringify(newDag, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'init',
    note,
    repo: basename(repoRoot),
    position: [gateNodeId],
    level: 0,
    dagId: dag.id,
    detail: { gate: gateNodeId, statement, threshold },
  });

  // Validate bookend gates
  const terminalError = validateTerminalIntentGate(newDag);
  const initError = validateInitIntentGate(newDag);

  json({
    added: true,
    gateNodeId,
    statement,
    threshold,
    path: headPath,
    bookendGatesPresent: !terminalError && !initError,
    ...(terminalError ? { warningTerminal: terminalError.message } : {}),
    ...(initError ? { warningInit: initError.message } : { initGateValid: true }),
  });
}

// --- report: aggregate ValidationResult[] across all completed nodes ---
// roadmap report --note "..."
async function cmdReport(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const dag = loadDAG();
  const allNodes = Object.keys(dag.nodes);
  const results: any[] = [];

  for (const nodeId of allNodes) {
    const { validateNode } = await import('../src/protocol.ts');
    const result = await validateNode(dag, nodeId, fileExists(repoRoot));
    results.push(result);
  }

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const noRules = results.filter(r => r.checks.length === 0);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'report', note,
    repo: basename(repoRoot), position: ['report'], level: -1, dagId: dag.id,
    detail: { total: results.length, passed: passed.length, failed: failed.length },
  });

  json({
    report: true,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    noRules: noRules.length,
    failures: failed.map(r => ({ nodeId: r.nodeId, failedCount: r.checks.filter((c: any) => !c.passed).length, checks: r.checks.filter((c: any) => !c.passed) })),
  });
}

// --- scaffold: generate typed stubs for all DAG produces ---
async function cmdScaffold(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }
  const dag = loadDAG();
  const buildCheck = args.includes('--build-check');
  const dryRun = args.includes('--dry-run');
  const result = await buildScaffold(dag, repoRoot, { buildCheck, dryRun });

  recordTrail({
    ts: new Date().toISOString(), cmd: 'scaffold', note,
    repo: basename(repoRoot), position: ['scaffold'], level: -1, dagId: dag.id,
    detail: { filesGenerated: result.filesGenerated, nodesScaffolded: result.nodesScaffolded, dryRun, buildCheck },
  });

  json(result);
}

// --- cluster: compute context clusters from data flow graph ---
function cmdCluster(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }
  const dag = loadDAG();
  const maxSizeIdx = args.indexOf('--max-size');
  const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1] ?? '8', 10) : undefined;
  const hubIdx = args.indexOf('--exclude-hubs');
  const excludeHubs = hubIdx !== -1 ? parseInt(args[hubIdx + 1] ?? '3', 10) || 3 : undefined;
  const useSolver = args.includes('--solver');
  const result = buildClusters(dag, { maxSize, excludeHubs, useSolver });

  recordTrail({
    ts: new Date().toISOString(), cmd: 'cluster', note,
    repo: basename(repoRoot), position: ['cluster'], level: -1, dagId: dag.id,
    detail: { clusterCount: result.clusterCount, agentCount: result.agentCount, maxParallelClusters: result.maxParallelClusters, solver: result.solver ?? 'union-find', ...(result.cutWeight !== undefined ? { cutWeight: result.cutWeight } : {}), ...(result.hubFiles?.length ? { hubFiles: result.hubFiles.length } : {}) },
  });

  if (args.includes('--dot')) {
    const lines: string[] = ['digraph clusters {', '  rankdir=LR;', '  node [shape=box];'];
    for (const c of result.clusters) {
      const label = `${c.id}\\n${c.nodes.length} nodes${c.critical ? ' ★' : ''}`;
      lines.push(`  "${c.id}" [label="${label}"${c.critical ? ' style=bold' : ''}];`);
    }
    for (const c of result.clusters) {
      for (const dep of c.crossClusterDeps) {
        lines.push(`  "${dep.cluster}" -> "${c.id}" [label="${dep.via.length} artifacts"];`);
      }
    }
    lines.push('}');
    console.log(lines.join('\n'));
    return;
  }

  json(result);
}

// --- schedule: compute spawn order from clusters + critical path ---
function cmdSchedule(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }
  const dag = loadDAG();
  const maxSizeIdx = args.indexOf('--max-size');
  const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1] ?? '8', 10) : undefined;
  const clusters = buildClusters(dag, { maxSize });
  const result = buildSchedule(dag, clusters);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'schedule', note,
    repo: basename(repoRoot), position: ['schedule'], level: -1, dagId: dag.id,
    detail: { pipelineDepth: result.pipelineDepth, maxConcurrency: result.maxConcurrency },
  });

  json(result);
}

function cmdDig() {
  const target = args[1];
  if (!target) {
    // List all archived paths (files that existed in git history but not in working tree)
    const allHistorical = execSync(
      'git log --all --pretty=format: --name-only --diff-filter=D | sort -u | grep -v "^$" | grep -v "^node_modules/"',
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim().split('\n').filter(Boolean);

    console.log(`📦 Archived files (${allHistorical.length} paths in git history)\n`);
    const grouped: Record<string, string[]> = {};
    for (const f of allHistorical) {
      const dir = f.includes('/') ? f.split('/').slice(0, -1).join('/') : '.';
      (grouped[dir] ??= []).push(f);
    }
    for (const [dir, files] of Object.entries(grouped).sort()) {
      console.log(`  ${dir}/`);
      for (const f of files) console.log(`    ${f}`);
    }
    console.log(`\nUse: roadmap dig <path> to see history`);
    console.log(`Use: roadmap dig <path> --restore to recover to working tree`);
    return;
  }

  if (args.includes('--restore')) {
    // Restore file from last commit that had it
    try {
      const lastCommit = execSync(
        `git log --all -1 --pretty=format:%H -- "${target}"`,
        { cwd: repoRoot, encoding: 'utf-8' },
      ).trim();
      if (!lastCommit) {
        console.log(`❌ No history found for: ${target}`);
        process.exit(1);
      }
      execSync(`git checkout ${lastCommit} -- "${target}"`, { cwd: repoRoot, stdio: 'pipe' });
      console.log(`✅ Restored ${target} from ${lastCommit.slice(0, 7)}`);
    } catch {
      console.log(`❌ Could not restore: ${target}`);
      process.exit(1);
    }
    return;
  }

  // Show git log for a specific path
  const log = execSync(
    `git log --all --oneline -- "${target}"`,
    { cwd: repoRoot, encoding: 'utf-8' },
  ).trim();

  if (!log) {
    console.log(`❌ No history found for: ${target}`);
    process.exit(1);
  }

  console.log(`📜 History for ${target}\n`);
  console.log(log);
  console.log(`\nUse: roadmap dig ${target} --restore to recover`);
}

function cmdLocate(note: string) {
  const skillPath = join(homedir(), '.claude/skills/roadmap-locate/backend.ts');
  try {
    const output = execSync(`npx tsx ${skillPath}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const result = JSON.parse(output);
    if (hasLocalDAG) {
      const dag = loadDAG();
      const pos = orient(dag, fileExists(repoRoot));
      recordTrail({ ts: new Date().toISOString(), cmd: 'locate', note, repo: basename(repoRoot), position: pos.position, level: pos.level });
    } else {
      recordTrail({ ts: new Date().toISOString(), cmd: 'locate', note, repo: basename(repoRoot), position: 'untracked' });
    }
    json(result);
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Check ~/.claude/skills/roadmap-locate/backend.ts exists and is valid',
      entry: 'bin/roadmap',
    }, `Locate skill failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function cmdSync(note: string) {
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] || 'json' : 'json';
  if (!['json', 'tree'].includes(format)) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Use --format json or --format tree',
      entry: 'bin/roadmap',
    }, `Invalid format: ${format}`);
  }

  const skillPath = join(homedir(), '.claude/skills/roadmap-locate/backend.ts');
  let allRoadmaps: any[];
  try {
    const output = execSync(`npx tsx ${skillPath}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const result = JSON.parse(output);
    allRoadmaps = result.roadmaps || [];
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Check locate skill',
      entry: 'bin/roadmap',
    }, `Failed to discover roadmaps: ${e instanceof Error ? e.message : String(e)}`);
  }

  let trailEntry: TrailEntry = { ts: new Date().toISOString(), cmd: 'sync', note, repo: basename(repoRoot) };
  if (hasLocalDAG) {
    const dag = loadDAG();
    const pos = orient(dag, fileExists(repoRoot));
    trailEntry.position = pos.position;
    trailEntry.level = pos.level;
  } else {
    trailEntry.position = 'untracked';
  }
  recordTrail(trailEntry);

  if (format === 'tree') {
    console.log('\n🗺️  Available Roadmaps');
    for (const rm of allRoadmaps) {
      const status = rm.complete ? '✅' : '⏳';
      const prog = Math.round((rm.totalNodes - (rm.blockedBy?.length || 0)) / rm.totalNodes * 100);
      console.log(`\n${status} ${rm.name} (${rm.path})`);
      console.log(`   Position: ${rm.position} (${prog}%)`);
      console.log(`   Total nodes: ${rm.totalNodes}`);
      if (rm.blockedBy && rm.blockedBy.length) {
        console.log(`   Blocked by: ${rm.blockedBy.join(', ')}`);
      }
    }
    console.log('');
  } else {
    json({
      roadmaps: allRoadmaps,
      count: allRoadmaps.length,
      timestamp: new Date().toISOString(),
    });
  }
}

function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Commands:
  orient              Current batch position + produces/consumes + claims (JSON)
  orient --check      Same as orient but no trail entry (for frequent polling)
  orient --ready      Eager dispatch: nodes beyond current batch whose deps are met
  orient --next       Next batch lookahead with pre-checked conflicts
  orient --staged     Per-node isomorphism check: do staged files match a node's produces?
  orient --assign     Round-robin assign batchRemaining to --owners (JSON)
  advance             Advance to next batch (requires current batch complete) (JSON)
  commit --node <id>  Stage node's produces, commit with [node: X] trailer, update git-state
  complete <node-id>  Atomic: claim → checkpoint → reorient → auto-advance if last in batch (--no-advance to suppress)
  checkpoint --label <name>  Save checkpoint (--note optional when --label given)
  checkpoint --list   List all checkpoints
  checkpoint --restore  Restore from latest valid checkpoint
  describe            Full API surface + project state (JSON)
  validate [node]     Run validation rules (all nodes or specific)
  expand <script.ts>  Run expansion script, validate DAG, commit
  expand <script> --type structural|iteration  Structural (idempotent) vs iteration (one-shot)
  branch <name> [dag] Create git branch with optional separate DAG
  parallel            Show parallel execution batches (current repo)
  parallel --cross-repo  Show parallel structure with sibling repos
  parallel --graph    Include full DAG structure in output
  locate --all        Discover all .roadmap/head.json files on machine
  sync [--format fmt] Aggregate tasks from all discovered roadmaps (json|tree)
  chart               Pretty-print progress chart with emoji bars
  chart --deps        Cross-repo chart: show dependency repo positions
  chart --critical-path  Annotate critical path nodes with ⚡ + footer
  show <node-id>      Full node spec as JSON (produces, consumes, deps, validate, status)
  show --batch [level] All nodes at a batch level (default: current batch)
  diff <ref|path>     Structural diff between current DAG and old version
  diff <ref> --verbose  Include desc changes in diff output
  merge --from <path> Diagnostic: show artifact connections to sibling DAG
  retire <node-id>    Skip/retire a node (treated as done by orient)
  retire <id> --cascade  Retire node + all transitively dependent nodes
  retire <id> --undo  Un-retire a previously retired node
  retire --list       Show all retired nodes
  claim <node-id>     Claim a node for exclusive work (advisory lock)
  claim <id> --owner <name>  Claim with explicit owner (default: $AGENT_ID or $USER)
  claim <id> --ttl <sec>     Claim TTL in seconds (default: 300)
  claim <id> --renew         Extend TTL; fails if claim expired or owner mismatch
  claim <id> --release       Release a claim
  claim --list        Show all claims with expiry status
  import --from speckit <file.md> --id <dag-id>  Parse tasks.md → roadmap DAG
  init <dag-id>       Add plan clarity gate to existing DAG
  init <id> --statement "..." --threshold 0.95  Custom intent statement and confidence threshold
  report                      Aggregate validation gap report across all nodes
  trail [--last N]    Read the invocation trail (local or global)
  trail --global      Cross-project trail (~/.roadmap/trail.jsonl)
  trail --repo <name> Filter trail by repo name
  trail --archive     Commit trail (local) or rotate to archive (global)
  trail --archived    List archived global trail files
  trail --archived --read <file>  Read a specific archive
  install [path]      Install protocol into CLAUDE.md (default: .claude/CLAUDE.md)
  install-hooks       Install git hooks (pre-commit, post-commit, commit-msg, prepare-commit-msg)
  iter-id             Current loop iteration number (--increment to bump, --reset to zero)
  propagate           Backward constraint propagation — derive upstream validate rules from downstream
  propagate --dry-run Show what would be propagated without mutating the DAG
  propagate --from <id>  Start propagation from a specific node (not term)
  propagate --depth N Limit propagation hop count
  dig [path]          Browse archived files in git history
  dig <path> --restore  Recover archived file to working tree
  help                This message

All commands (except help/trail/chart/install/dig/claim/diff/show/orient) require --note "reason".
  orient --check is note-exempt for swarm agents that reorient without trail pollution.

Agent Workflow:
  1. orient --note "..."             → find current batch (position[], produces[], consumes[])
  2. claim <node> / orient --assign  → take ownership of node(s) in the batch
  3. show <node>                     → get full node spec (no head.json read needed)
  4. do work                         → produce the artifacts listed in produces[]
  5. commit --node <id> --message "" → stage produces, commit with [node: X] trailer
  6. complete <node-id> --note "..." → atomic claim + checkpoint + reorient (preferred over steps 2+7)
  7. advance --note "..."            → validate batch complete, move to next batch

  For polling without trail clutter: orient --check (no --note required, no trail entry)
  orient --ready includes myClaims[] — current-batch nodes you already hold, so no extra claim call needed.

  orient is the entry point. Run it first. It returns:
    position[]       current batch (nodes runnable in parallel)
    level            batch index (0 = init)
    produces[]       artifacts this batch must create
    consumes[]       artifacts available from prior batches
    batchRemaining[] nodes in batch whose artifacts are still missing
    batchComplete    true if all batch artifacts exist
    claims           per-node { owner, claimedAt, claimExpiry, expired }
    preGate[]        plan nodes workable before their deps close
    planNodes        { nodeId: 'plan' } for plan-mode nodes in batch
    blockedBy[]      cross-repo deps not yet satisfied
    ready[]          (--ready) future nodes with deps met: { id, level, produces, consumes, mode, claimable }

  orient --ready
    Returns nodes beyond the current batch whose specific deps are all satisfied.
    Enables eager dispatch: start work on unblocked future nodes without waiting
    for the full batch to complete. Read-only — does not advance batch state.
    Each node includes claimable: true/false based on active claims.

  orient --next
    Returns the next batch (after current) for orchestrator pre-warming.
    Includes nodes[], level, produces[], and conflicts[] (pre-checked).
    Always returned regardless of current batch completeness — orchestrator decides.
    Returns null if current batch is the final batch.

  orient --assign --owners w1,w2,w3 [--ttl 900]
    Round-robin assigns batchRemaining nodes to owners. Respects active claims
    and avoids co-assigning nodes that share produced files (batchConflicts).
    Returns assignments { nodeId: owner } and assignSkipped { nodeId: reason }.

  claim semantics:
    Advisory locks — expired claims are ignored, not enforced.
    Claims scoped to current batch only (can't claim ahead of frontier).
    Owner resolution: --owner flag > $AGENT_ID > $USER > 'unknown'.
    --renew fails if claim expired (prevents stale agent re-claiming).
    Default TTL: 300s. For long tasks, use --ttl or renew on a timer.

  advance validates every node in the current batch before moving forward.
  If any artifact is missing, advance fails with the list of incomplete nodes.

Batch Model:
  Position is a batch (string[]), not a single node.
  parallelOrder() computes all batches; orient() finds the first incomplete one.
  Plan nodes (mode: 'plan') complete when expansion children exist, not artifacts.
  Trail entries record position as string[] with level index.

Notes:
  --note is the trail's information content. Write what you're doing and why,
  not ceremony. The note is what you'll read in trail --last 10 next week.
  Bad:  --note "session start"
  Good: --note "auth module — adding JWT refresh token rotation"

Examples:
  roadmap orient --note "auth module — investigating token expiry bug"
  roadmap orient --assign --owners w1,w2,w3 --ttl 900 --note "dispatch L12 — api,db,cache workers"
  roadmap claim auth-impl --owner worker-1 --ttl 600
  roadmap claim auth-impl --renew --ttl 600
  roadmap claim --list
  roadmap advance --note "L12 complete — auth, db-migration, cache-layer artifacts verified"
  roadmap chart
  roadmap chart --deps
  roadmap validate auth-impl --note "pre-advance check on auth artifacts"
  roadmap retire phase-5-term --cascade --note "descoped — moving auth to external service"
  roadmap trail --global --last 5
  roadmap trail --archived --read 2026-02-26
  roadmap dig docs/API.md --restore`);
}

// --- propagate: backward constraint propagation ---

function cmdPropagate(note: string) {
  const dag = loadDAG();
  const dryRun = args.includes('--dry-run');
  const fromIdx = args.indexOf('--from');
  const from = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
  const depthIdx = args.indexOf('--depth');
  const depth = depthIdx !== -1 ? parseInt(args[depthIdx + 1], 10) : undefined;

  const result = propagateConstraints(dag, { dryRun, from, depth });

  if (!dryRun && result.dag) {
    const headPath = join(repoRoot, '.roadmap', 'head.json');
    // Validate propagated DAG
    const checkResult = check(result.dag);
    const verifyErrors = verify(result.dag);
    if (!checkResult.done || verifyErrors.length) {
      throw new RoadmapError('VALIDATION_FAILED', {
        fix: 'Propagated DAG failed validation — file a bug',
      }, `Propagation produced invalid DAG: ${verifyErrors.length} verify errors`);
    }

    writeFileSync(headPath, JSON.stringify(result.dag, null, 2) + '\n');
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
    const msg = `roadmap: propagate — ${result.propagated} constraints across ${result.nodesAffected} nodes`;
    execSync(`git commit -m "${msg}"`, { cwd: repoRoot, stdio: 'pipe' });
    const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

    const posAfter = orient(result.dag, fileExists(repoRoot), retiredSet());
    recordTrail({
      ts: new Date().toISOString(), cmd: 'propagate', note, repo: basename(repoRoot),
      position: posAfter.position, level: posAfter.level, dagId: result.dag.id,
      detail: { propagated: result.propagated, nodesAffected: result.nodesAffected, commit: hash, dryRun: false },
    });
  } else {
    recordTrail({
      ts: new Date().toISOString(), cmd: 'propagate', note, repo: basename(repoRoot),
      dagId: dag.id,
      detail: { propagated: result.propagated, nodesAffected: result.nodesAffected, dryRun: true },
    });
  }

  json({
    propagated: result.propagated,
    nodesAffected: result.nodesAffected,
    constraints: result.constraints,
    dryRun,
  });
}

// --- plan --gallery: template gallery, candidate selection, judgment recording ---

async function cmdPlanGallery(note: string) {
  // Parse flags
  const fromIdx = args.indexOf('--from');
  let specSource = fromIdx !== -1 ? args[fromIdx + 1] : '';

  // Default specSource: first .specify/specs/**/*.md found, or empty string
  if (!specSource) {
    const specsBase = join(repoRoot, '.specify', 'specs');
    if (existsSync(specsBase)) {
      try {
        const found = execSync('find .specify/specs -name "*.md" | head -1', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (found) specSource = found;
      } catch { /* non-fatal */ }
    }
  }

  const selectIdx = args.indexOf('--select');
  const selectId = selectIdx !== -1 ? args[selectIdx + 1] : undefined;

  const evaluateIdx = args.indexOf('--evaluate');
  const evaluateJson = evaluateIdx !== -1 ? args[evaluateIdx + 1] : undefined;

  const jsonOutput = args.includes('--json');

  const evalDir = join(repoRoot, '.roadmap', 'evaluations');
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const headPrevPath = join(repoRoot, '.roadmap', 'head-prev.json');

  // --evaluate: record LLM judgments and commit selected candidate
  if (evaluateJson) {
    type Judgment = { statement: string; confidence: number; reasoning: string; evidence?: string[] };
    let judgments: Judgment[];
    try {
      judgments = JSON.parse(evaluateJson);
      if (!Array.isArray(judgments)) throw new Error('--evaluate must be a JSON array');
    } catch (e: any) {
      json({ error: `Invalid --evaluate JSON: ${e.message}`, fix: "roadmap plan --gallery --evaluate '[{\"statement\":\"...\",\"confidence\":0.9,\"reasoning\":\"...\"}]'" });
      process.exit(1);
      return;
    }

    // Validate minimum confidence bar
    const MIN_CONFIDENCE = 0.7;
    const failing = judgments.filter(j => j.confidence < MIN_CONFIDENCE);
    if (failing.length > 0) {
      json({
        error: `Judgment confidence below minimum (${MIN_CONFIDENCE}) for ${failing.length} statement(s)`,
        failing: failing.map(j => ({ statement: j.statement, confidence: j.confidence })),
        fix: `Re-evaluate with confidence >= ${MIN_CONFIDENCE} for all statements`,
      });
      process.exit(1);
      return;
    }

    // Derive selected candidate id from the judgment statements (first statement encodes id)
    // Convention: statement is "select candidate <id>"
    const selectStatement = judgments.find(j => j.statement.startsWith('select candidate '));
    const candidateId = selectStatement ? selectStatement.statement.replace('select candidate ', '').trim() : undefined;

    const candidates = buildGallery(specSource, evalDir);
    const selected = candidateId ? candidates.find(c => c.id === candidateId) : candidates[0];

    if (!selected) {
      json({ error: `Candidate "${candidateId}" not found in gallery`, available: candidates.map(c => c.id) });
      process.exit(1);
      return;
    }

    // Record to .roadmap/evaluations/plan-selection.jsonl
    if (!existsSync(evalDir)) mkdirSync(evalDir, { recursive: true });
    const runId = Date.now().toString(36);
    const selectionRecord = {
      phase: `plan-selection:${runId}`,
      selectedId: selected.id,
      judgments,
      specSource,
      ts: new Date().toISOString(),
    };
    appendFileSync(join(evalDir, 'plan-selection.jsonl'), JSON.stringify(selectionRecord) + '\n', 'utf-8');

    // Backup existing head.json if present
    if (existsSync(headPath)) {
      writeFileSync(headPrevPath, readFileSync(headPath, 'utf-8'));
    }

    // Write selected candidate dag as head.json
    const roadmapDir = join(repoRoot, '.roadmap');
    if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
    writeFileSync(headPath, JSON.stringify(selected.dag, null, 2) + '\n');

    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan --gallery --evaluate', note,
      repo: basename(repoRoot),
      detail: { selectedId: selected.id, runId, specSource, confidence: Math.min(...judgments.map(j => j.confidence)) },
    });

    json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json' });
    return;
  }

  // --select: manual override, same as --evaluate but no confidence requirement
  if (selectId) {
    const candidates = buildGallery(specSource, evalDir);
    const selected = candidates.find(c => c.id === selectId);

    if (!selected) {
      json({ error: `Candidate "${selectId}" not found in gallery`, available: candidates.map(c => c.id) });
      process.exit(1);
      return;
    }

    // Record to .roadmap/evaluations/plan-selection.jsonl
    if (!existsSync(evalDir)) mkdirSync(evalDir, { recursive: true });
    const runId = Date.now().toString(36);
    const selectionRecord = {
      phase: `plan-selection:${runId}`,
      selectedId: selected.id,
      manualOverride: true,
      specSource,
      ts: new Date().toISOString(),
    };
    appendFileSync(join(evalDir, 'plan-selection.jsonl'), JSON.stringify(selectionRecord) + '\n', 'utf-8');

    // Backup existing head.json if present
    if (existsSync(headPath)) {
      writeFileSync(headPrevPath, readFileSync(headPath, 'utf-8'));
    }

    // Write selected candidate dag as head.json
    const roadmapDir = join(repoRoot, '.roadmap');
    if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
    writeFileSync(headPath, JSON.stringify(selected.dag, null, 2) + '\n');

    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan --gallery --select', note,
      repo: basename(repoRoot),
      detail: { selectedId: selected.id, runId, specSource, manualOverride: true },
    });

    json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json' });
    return;
  }

  // Default: render gallery table + topology + recommendation
  const candidates = buildGallery(specSource, evalDir);

  if (jsonOutput) {
    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan --gallery', note,
      repo: basename(repoRoot),
      detail: { candidateCount: candidates.length, specSource },
    });
    json({ candidates, specSource });
    return;
  }

  // ASCII table header
  const COL_WIDTHS = [20, 6, 14, 10, 8];
  const headers = ['id', 'nodes', 'wallClockMin', 'costUSD', 'risk'];
  const sep = headers.map((_, i) => '-'.repeat(COL_WIDTHS[i])).join('-+-');
  const headerRow = headers.map((h, i) => h.padEnd(COL_WIDTHS[i])).join(' | ');

  const lines: string[] = [];
  lines.push('');
  lines.push('Plan Gallery — Pareto-filtered candidates');
  lines.push('');
  lines.push(headerRow);
  lines.push(sep);

  for (const c of candidates) {
    const row = [
      c.id.padEnd(COL_WIDTHS[0]),
      String(c.estimates.nodes).padEnd(COL_WIDTHS[1]),
      c.estimates.wallClockMinutes.toFixed(1).padEnd(COL_WIDTHS[2]),
      c.estimates.costUSD.toFixed(4).padEnd(COL_WIDTHS[3]),
      c.estimates.risk.toFixed(2).padEnd(COL_WIDTHS[4]),
    ];
    lines.push(row.join(' | '));
  }

  lines.push('');

  // Topology diagram per candidate (compact)
  for (const c of candidates) {
    const dagNodes = (c.dag as any).nodes ?? {};
    const nodeIds: string[] = Object.keys(dagNodes);

    // Build adjacency: for each node, collect its dependents
    const deps: Record<string, string[]> = {};
    for (const nid of nodeIds) {
      deps[nid] = (dagNodes[nid] as any).deps ?? [];
    }

    // Topo order: nodes with no dependents first
    const inDegree: Record<string, number> = {};
    for (const nid of nodeIds) inDegree[nid] = 0;
    for (const nid of nodeIds) {
      for (const d of deps[nid]) {
        if (inDegree[d] !== undefined) inDegree[d]++;
      }
    }

    // BFS topo levels
    const queue = nodeIds.filter(n => inDegree[n] === 0);
    const levels: string[][] = [];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const lvl = queue.splice(0, queue.length);
      levels.push(lvl);
      for (const n of lvl) visited.add(n);
      for (const nid of nodeIds) {
        if (!visited.has(nid) && deps[nid].every(d => visited.has(d))) {
          queue.push(nid);
        }
      }
    }

    // Compact topology: levels joined with arrows, parallel nodes with ─┬─
    const topoStr = levels.map(lvl => lvl.join(' ─┬─ ')).join(' → ');
    lines.push(`[${c.id}] ${c.summary}`);
    lines.push(`  ${topoStr}`);
    lines.push('');
  }

  // Recommendation: lowest risk
  const recommended = candidates.reduce((best, c) => c.estimates.risk < best.estimates.risk ? c : best, candidates[0]);
  lines.push(`Recommendation: ${recommended.id} (risk=${recommended.estimates.risk.toFixed(2)}, cost=$${recommended.estimates.costUSD.toFixed(4)})`);
  lines.push('');
  lines.push(`Select [${candidates.map((_, i) => String.fromCharCode(65 + i)).join('/')}]:`);
  lines.push('  roadmap plan --gallery --select <id> --note "..."');
  lines.push('  roadmap plan --gallery --evaluate \'[{"statement":"select candidate <id>","confidence":0.9,"reasoning":"..."}]\' --note "..."');
  lines.push('');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'plan --gallery', note,
    repo: basename(repoRoot),
    detail: { candidateCount: candidates.length, recommended: recommended.id, specSource },
  });

  console.log(lines.join('\n'));
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

// --- compile-prompts: generate per-node worker prompts from DAG + environment ---
function cmdCompilePrompts(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }
  const dag = loadDAG();

  const envIdx = args.indexOf('--env');
  const envPath = envIdx !== -1 ? resolve(repoRoot, args[envIdx + 1] ?? '') : undefined;

  const templateIdx = args.indexOf('--template');
  const templatePath = templateIdx !== -1 ? resolve(repoRoot, args[templateIdx + 1] ?? '') : undefined;

  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : 'prompts';

  const nodeIdx = args.indexOf('--node');
  const singleNode = nodeIdx !== -1 ? args[nodeIdx + 1] : undefined;

  const validateOnly = args.includes('--validate-only');

  let envSource: string | undefined;
  if (envPath) {
    if (!existsSync(envPath)) { json({ error: `Environment file not found: ${envPath}` }); process.exit(1); }
    envSource = readFileSync(envPath, 'utf-8');
  }

  let templateSource: string | undefined;
  if (templatePath) {
    if (!existsSync(templatePath)) { json({ error: `Template file not found: ${templatePath}` }); process.exit(1); }
    templateSource = readFileSync(templatePath, 'utf-8');
  }

  let currentCommit: string | undefined;
  try {
    currentCommit = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { /* non-fatal */ }

  const clusterResult = buildClusters(dag);

  const { result, prompts, violations, stale } = compilePrompts(dag as Graph<string>, {
    envSource, templateSource, out: outDir,
    nodes: singleNode ? [singleNode] : undefined,
    validateOnly, clusterResult, currentCommit,
  });

  recordTrail({
    ts: new Date().toISOString(), cmd: 'compile-prompts', note,
    repo: basename(repoRoot), position: ['compile-prompts'], level: -1, dagId: dag.id,
    detail: { compiled: result.compiled, skipped: result.skipped, violations: violations.length, stale },
  });

  if (validateOnly) {
    json({ valid: violations.length === 0, violations, compiled: result.compiled });
    return;
  }

  if (violations.length > 0) {
    json({ error: 'Validation violations found', violations, compiled: 0 });
    process.exit(1);
  }

  const absOut = resolve(repoRoot, outDir);
  if (!existsSync(absOut)) mkdirSync(absOut, { recursive: true });
  for (const p of prompts) {
    writeFileSync(join(absOut, basename(p.path)), p.content, 'utf-8');
  }

  json({ ...result, stale, violations: [] });
}

await main();
