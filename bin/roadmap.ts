#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  define, check, verify, order, parallelOrder, batchConflicts, orient, reconcile,
  validateNode, validateGraph,
} from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { discoverDependencies, resolveSiblingPath } from '../src/lib/dependency-resolver.ts';
import { loadClaims, saveClaims, isExpired, activeClaims, annotateWithClaims, assignBatch } from '../src/lib/claims.ts';
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
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'trail', 'chart', 'install', 'dig', 'claim']);

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
      case 'orient':    return cmdOrient(note!);
      case 'advance':   return await cmdAdvance(note!);
      case 'describe':  return cmdDescribe(note!);
      case 'validate':  return cmdValidate(note!);
      case 'expand':    return await cmdExpand(note!);
      case 'branch':    return cmdBranch(note!);
      case 'position':  return cmdOrient(note!); // alias
      case 'parallel':  return cmdParallel(note!);
      case 'locate':    return cmdLocate(note!);
      case 'sync':      return cmdSync(note!);
      case 'trail':     return cmdTrail();
      case 'chart':     return cmdChart();
      case 'install':   return cmdInstall();
      case 'merge':     return await cmdMergeFrom();
      case 'retire':    return cmdRetire(note!);
      case 'claim':     return cmdClaim();
      case 'dig':       return cmdDig();
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

async function cmdOrient(note: string) {
  if (!hasLocalDAG) {
    const result = { position: 'untracked', repo: basename(repoRoot), tracked: false };
    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'orient',
      note,
      repo: basename(repoRoot),
      position: 'untracked',
    });
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

  // --assign: round-robin assign batchRemaining to owners
  if (args.includes('--assign')) {
    const ownersIdx = args.indexOf('--owners');
    if (ownersIdx === -1 || !args[ownersIdx + 1]) {
      json({ error: 'Missing --owners', fix: 'roadmap orient --assign --owners w1,w2,w3 --note "reason"' });
      process.exit(1);
    }
    const owners = args[ownersIdx + 1].split(',').filter(Boolean);
    if (owners.length === 0) {
      json({ error: 'Empty --owners list' });
      process.exit(1);
    }
    const ttlIdx = args.indexOf('--ttl');
    const ttlSeconds = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1] ?? '300', 10) : 300;
    if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
      json({ error: 'Invalid --ttl value; must be a positive integer (seconds)' });
      process.exit(1);
    }

    const conflicts = batchConflicts(dag);
    const currentBatchConflicts = conflicts
      .filter(c => c.writers.some(w => pos.batchRemaining.includes(w)))
      .map(c => ({ file: c.file, writers: c.writers }));

    const { store: newStore, result: assignResult } = assignBatch(
      pos.batchRemaining, owners, claimStore, currentBatchConflicts, ttlSeconds,
    );
    saveClaims(repoRoot, newStore);
    result.assignments = assignResult.assignments;
    if (Object.keys(assignResult.skipped).length) result.assignSkipped = assignResult.skipped;
  }

  // Include blockedBy if there are blocking deps
  if (pos.blockedBy.length) {
    result.blockedBy = pos.blockedBy.map(s => ({
      repo: s.repo, position: s.position, waiting: s.waiting, repoComplete: s.satisfied,
    }));
  }

  // Trail entry with batch context
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
    note,
    repo: basename(repoRoot),
    position: pos.position,
    level: pos.level,
    dagId: dag.id,
    detail: trailDetail,
  });
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

  const posAfter = orient(dagAfter, fileExists(repoRoot));
  recordTrail({ ts: new Date().toISOString(), cmd: 'expand', note, repo: basename(repoRoot), position: posAfter.position, level: posAfter.level, dagId: dagAfter.id, detail: { script: scriptPath, added, commit: hash } });

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
  const dag = loadDAG();
  const retiredIds = retiredSet();
  const pos = await crossOrient(dag, repoRoot, undefined, retiredIds);
  const batches = parallelOrder(dag);
  const claimStore = loadClaims(repoRoot);
  const now = new Date();
  const nodeIds = Object.keys(dag.nodes);
  const doneSet = new Set(pos.done);
  const preGateSet = new Set(pos.preGate);
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
        return `👉 ${planTag}${n}${claimTag}`;
      }
      if (retiredIds.has(n)) return `⏭️ ${n}`;
      if (doneSet.has(n)) return `✅ ${planTag}${n}`;
      if (preGateSet.has(n)) return `🔍 ${planTag}${n}`;
      return `⬜ ${planTag}${n}`;
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
  console.log('');
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
  // Resolve the absolute path to this CLI
  const scriptDir = resolve(import.meta.dirname || join(repoRoot, 'bin'));
  const binPath = join(scriptDir, 'roadmap');

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
    // Create new CLAUDE.md with just the protocol
    const dir = resolve(resolvedPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedPath, protocolBlock + '\n');
    console.log(`✅ Created ${resolvedPath} with roadmap protocol`);
    console.log(`   bin: ${binPath}`);
    return;
  }

  // Read existing, splice or append
  let content = readFileSync(resolvedPath, 'utf-8');

  if (content.includes(ANCHOR_START) && content.includes(ANCHOR_END)) {
    // Replace existing block
    const re = new RegExp(
      escapeRegex(ANCHOR_START) + '[\\s\\S]*?' + escapeRegex(ANCHOR_END),
    );
    content = content.replace(re, protocolBlock);
    writeFileSync(resolvedPath, content);
    console.log(`🔄 Updated roadmap protocol in ${resolvedPath}`);
  } else {
    // Append
    content = content.trimEnd() + '\n\n' + protocolBlock + '\n';
    writeFileSync(resolvedPath, content);
    console.log(`➕ Appended roadmap protocol to ${resolvedPath}`);
  }
  console.log(`   bin: ${binPath}`);
}

function cmdInstallHooks(note: string): void {
  // Resolve hook script path relative to this script
  const scriptDir = resolve(import.meta.dirname || join(repoRoot, 'bin'));
  const hookSrc = join(scriptDir, '..', 'hooks', 'pre-commit');
  const hookDest = join(repoRoot, '.git', 'hooks', 'pre-commit');
  const configDest = join(repoRoot, '.roadmap', 'hook-config.json');

  if (!existsSync(hookSrc)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: hookSrc,
      fix: 'Hook script missing at hooks/pre-commit',
    }, `Hook script not found: ${hookSrc}`);
  }

  // Copy hook script to .git/hooks/
  const hookContent = readFileSync(hookSrc, 'utf-8');
  writeFileSync(hookDest, hookContent);
  execSync(`chmod +x ${hookDest}`, { stdio: 'pipe' });

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
    detail: { hookDest, configDest },
  });

  console.log(`✅ Installed pre-commit hook at ${hookDest}`);
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
  orient --assign     Round-robin assign batchRemaining to --owners (JSON)
  advance             Advance to next batch (requires current batch complete) (JSON)
  describe            Full API surface + project state (JSON)
  validate [node]     Run validation rules (all nodes or specific)
  expand <script.ts>  Run expansion script, validate DAG, commit
  branch <name> [dag] Create git branch with optional separate DAG
  parallel            Show parallel execution batches (current repo)
  parallel --cross-repo  Show parallel structure with sibling repos
  parallel --graph    Include full DAG structure in output
  locate --all        Discover all .roadmap/head.json files on machine
  sync [--format fmt] Aggregate tasks from all discovered roadmaps (json|tree)
  chart               Pretty-print progress chart with emoji bars
  chart --deps        Cross-repo chart: show dependency repo positions
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
  trail [--last N]    Read the invocation trail (local or global)
  trail --global      Cross-project trail (~/.roadmap/trail.jsonl)
  trail --repo <name> Filter trail by repo name
  trail --archive     Commit trail (local) or rotate to archive (global)
  trail --archived    List archived global trail files
  trail --archived --read <file>  Read a specific archive
  install [path]      Install protocol into CLAUDE.md (default: .claude/CLAUDE.md)
  dig [path]          Browse archived files in git history
  dig <path> --restore  Recover archived file to working tree
  help                This message

All commands (except help/trail/chart/install/dig/claim) require --note "reason".

Agent Workflow:
  1. orient --note "..."           → find current batch (position[], produces[], consumes[])
  2. claim <node> / orient --assign → take ownership of node(s) in the batch
  3. do work                       → produce the artifacts listed in produces[]
  4. advance --note "..."          → validate batch complete, move to next batch

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
