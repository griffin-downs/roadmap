#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createGitSafeLoader } from '../src/lib/gitsafe-loader.ts';
import { detectCurrentClone, getArchitecture, getWhere, validateClone, enforceOperation } from '../src/lib/topology/topology-service.ts';
import type { Operation } from '../src/lib/topology/enforcement-rules.ts';
import { createAgentWorktree, cleanupAgentWorktree, listAgentWorktrees } from '../src/lib/topology/agent-worktree.ts';
import {
  define, check, verify, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, reconcile,
  validateNode, validateGraph, consumeArtifact,
} from '../src/protocol.ts';
import type { ConsumeSpec } from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { discoverDependencies, resolveSiblingPath } from '../src/lib/utils/dependency-resolver.ts';
import { loadClaims, saveClaims, isExpired, activeClaims, annotateWithClaims, assignBatch } from '../src/lib/claims/claims.ts';
import { parseTasksMd, tasksToDAG } from '../src/lib/intake/speckit-import.ts';
import { compileIR, parseIRFile, defaultConfig } from '../src/lib/intake/spec-ir.ts';
import type { SpecConfig, SpecIR, SpecIRTask, SpecInput } from '../src/lib/intake/spec-ir.ts';
import { enrichIntentGate } from '../src/lib/intent/intent-gate-enrichment.ts';
import { loadCompletions, getCompletedNodeIds } from '../src/lib/completion/completion-tracker.ts';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence, hasPassingReceipt } from '../src/lib/evidence/completion-evidence.ts';
import type { EvidenceRecord } from '../src/lib/evidence/completion-evidence.ts';
import { buildScaffold } from '../src/lib/scaffold.ts';
import { buildGallery } from '../src/lib/gallery-templates/index.ts';
import { validateTerminalIntentGate, validateInitIntentGate, findInitBoundary } from '../src/lib/validate-dag.ts';
import { writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit } from '../src/lib/intake/spec-origin.ts';
import type { SpecOrigin, SpecImportReceipt } from '../src/lib/intake/spec-origin.ts';
import { scanIntake, importIntake, certifyIntake } from '../src/lib/intake/intake.ts';
import { runIntakeAbsorb } from '../src/lib/intake/intake-cmd.ts';
import { buildPlanOverlay, writePlanOverlay, loadPlanOverlay, isOverlayValid } from '../src/lib/plan-overlay.ts';
import { runOverlayFromIntake } from '../src/lib/recipes/overlay/overlay-cmd.ts';
import { listNodeReceipts, completionDoctor, completionCompact } from '../src/lib/receipts-ux.ts';
import { readPackageVersion } from '../src/lib/install-skills.ts';
import { loadDAGWithAutoMerge, ensureIndexExists } from '../src/lib/roadmap/cli-auto-merge.ts';
import { ensureConsolidated } from '../src/lib/roadmap/cli-consolidation-init.ts';
import type { Graph, Orientation } from '../src/protocol.ts';
import type { SiblingStatus } from '../src/lib/cross-orient.ts';
import type { OrientV1, OrientDag, OrientDagNode, OrientDagEdge, OrientBlockedNode } from '../src/lib/core/orient-schema.ts';
import { emit, emitError, parseOutputOpts, ErrorCode, type OutputFormat, type RenderV1 } from '../src/lib/cli-envelope.ts';
import { render, renderDagLayers, type RenderOpts, type RenderModel, type RenderOutput, type DagLayer, type DagNode } from '../src/lib/render/index.ts';
import { resolveWidth } from '../src/lib/render/layout.ts';
import { renderOrient, renderPlanGallery, renderPlanSelect, renderPlanStatus } from '../src/lib/cli-human.ts';
import type { OrientData, GalleryData, PlanSelectData, PlanStatusData } from '../src/lib/cli-human.ts';
import { specKitInit, SPEC_KIT_INIT_HELP } from '../src/commands/spec-init.ts';

const rawArgs = process.argv.slice(2);
const repoRoot = process.cwd();

// --- GitSafe enforcement ---
const gitsafe = createGitSafeLoader(repoRoot);

function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function enforceMainBranch(): void {
  const branch = getCurrentBranch();
  if (branch !== 'main' && branch !== 'HEAD') {
    console.error(JSON.stringify({
      error: 'gitsafe: file operations only allowed from main branch',
      currentBranch: branch,
      fix: 'Switch to main branch: git checkout main',
    }));
    process.exit(1);
  }
}

/** Wrap readFileSync through gitsafe denylist + maxBytes validation */
function safeReadFile(path: string): string {
  // Resolve relative to repoRoot for denylist check
  const relative = path.startsWith(repoRoot)
    ? path.slice(repoRoot.length + 1)
    : path;
  if (!gitsafe.isAllowed(relative)) {
    throw new Error(`gitsafe: file access denied (denylist): ${relative}`);
  }
  return readFileSync(path, 'utf-8');
}

// Extract --note and its value, return note + remaining positional args
function extractNote(argv: string[]): { note: string | undefined; positional: string[] } {
  const idx = argv.indexOf('--note');
  if (idx === -1) return { note: undefined, positional: argv };
  const note = argv[idx + 1];
  const positional = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { note, positional };
}

// Flag alias resolver: maps short flags to long flags for consistent checking
function hasFlag(flags: string[], haystack: string[]): boolean {
  for (const flag of flags) {
    if (haystack.includes(flag)) return true;
  }
  return false;
}

const { note: _note, positional: args } = extractNote(rawArgs);
const cmd = args[0] || 'help';

// --- Global output opts (FR-CLI-001) ---
function deriveEnvelopeCmd(): string {
  if (cmd === 'spec') {
    if (args[1] === 'init') return 'spec.init';
    if (args[1] === 'plan') {
      if (args.includes('--gallery')) return 'spec.plan.gallery';
      if (args[2] === 'select') return 'spec.plan.select';
      if (args[2] === 'status') return 'spec.plan.status';
      return 'spec.plan';
    }
    return 'spec';
  }
  return cmd;
}
const _outputOpts = parseOutputOpts(rawArgs, deriveEnvelopeCmd());

// --- Render opts (FR-UI-001) ---
const _renderOpts: RenderOpts = {
  tty: process.stderr.isTTY ?? false,
  width: resolveWidth(process.stderr.columns),
  color: (process.stderr.isTTY ?? false) && !process.env['NO_COLOR'],
  emoji: true,
};

// --- Human renderer dispatch (FR-CLI-001) ---
const _humanRenderers: Record<string, (data: unknown) => string> = {
  orient: (d) => renderOrient(d as OrientData),
  'spec.plan.gallery': (d) => renderPlanGallery(d as GalleryData),
  'spec.plan.select': (d) => renderPlanSelect(d as PlanSelectData),
  'spec.plan.status': (d) => renderPlanStatus(d as PlanStatusData),
};
if (_humanRenderers[_outputOpts.cmd]) {
  _outputOpts.humanRenderer = _humanRenderers[_outputOpts.cmd];
}

// Commands that don't require a note
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'spec', 'topology', 'agent']);
const isOrientCheck = (cmd === 'orient') && args.includes('--check');
if (isOrientCheck) {
  NOTE_EXEMPT.add('orient');
}

if (!NOTE_EXEMPT.has(cmd) && !isOrientCheck && !_note) {
  json({ error: 'Missing --note "reason"', fix: `roadmap ${cmd} --note "why you are running this"` });
  process.exit(1);
}

// Detect if this repo has a DAG
let hasLocalDAG = false;
try {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  hasLocalDAG = existsSync(headPath);
} catch {}

// --- Helper: Load completions ---
function retiredSet(): Set<string> {
  const retired = new Set<string>();
  const retiredPath = join(repoRoot, '.roadmap', 'retired.jsonl');
  if (existsSync(retiredPath)) {
    const lines = readFileSync(retiredPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.nodeId) retired.add(record.nodeId);
      } catch {}
    }
  }
  return retired;
}

// --- Trail recording ---
function recordTrail(entry: any) {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  appendFileSync(trailPath, JSON.stringify(entry) + '\n', 'utf-8');

  // Also write to global trail
  const globalTrailPath = join(homedir(), '.roadmap', 'trail.jsonl');
  const globalDir = join(homedir(), '.roadmap');
  if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
  appendFileSync(globalTrailPath, JSON.stringify(entry) + '\n', 'utf-8');
}

// --- Async section ---
async function crossOrientWithState(dag: Graph<string>) {
  const completion = CompletionStore.loadOrEmpty(repoRoot);
  const retired = retiredSet();

  const pos = orient(dag, completion, retired);

  // Recompute remaining based on completion store
  const allNodeIds = Object.keys(dag.nodes);
  const remainingIds = allNodeIds.filter(nid => !retired.has(nid) && !completion.hasPassing(nid));

  return {
    ...pos,
    remaining: remainingIds,
  };
}

// --- Main ---
async function main() {
  // Always consolidate: ensure all DAGs are merged into head.json with correct order
  try {
    const consolidationResult = await ensureConsolidated(repoRoot);
  } catch (err) {
    // Consolidation failure is non-fatal, log but continue with existing head.json
  }

  const note = _note;

  // Enforce main branch for all DAG-mutating commands
  const BRANCH_EXEMPT = new Set(['help', '--help', '-h', 'topology', 'agent']);
  if (!BRANCH_EXEMPT.has(cmd)) {
    enforceMainBranch();
  }

  try {
    // Route to core commands or group handlers
    await routeCommand(cmd, note);
  } catch (e) {
    if (e instanceof RoadmapError) {
      const rej = e.toJSON();
      emit({ ok: false, cmd: _outputOpts.cmd, error: { code: rej.code ?? ErrorCode.INTERNAL_ERROR, message: rej.message ?? String(e), fix: rej.context?.fix ? [rej.context.fix] : undefined } }, _outputOpts);
      process.exit(1);
    } else {
      emit({ ok: false, cmd: _outputOpts.cmd, error: { code: ErrorCode.INTERNAL_ERROR, message: e instanceof Error ? e.message : String(e) } }, _outputOpts);
      process.exit(2);
    }
  }
}

// --- Core Router: 3 mainline commands + spec group ---
async function routeCommand(cmd: string, note: string | undefined): Promise<void> {
  switch (cmd) {
    // Core commands (mainline execution loop)
    case 'orient':    return await cmdOrient(note);
    case 'advance':   return await cmdAdvance(note!);
    case 'make':      return await cmdMake(note!);

    // Spec pipeline
    case 'spec':      return await cmdSpecGroup(note);

    // Topology group
    case 'topology':  return cmdTopologyGroup();

    // Agent coordination
    case 'agent':     return await cmdAgentGroup(note);

    // Help & unknown
    case 'help':
    case '--help':
    case '-h':        return cmdHelp();
    default:
      json({ error: `Unknown command: ${cmd}`, fix: `Mainline: {make, orient, advance}. Group: {spec}. Use 'roadmap help' for details.` });
      process.exit(1);
  }
}

// --- Commands ---

async function cmdOrient(note: string | undefined) {
  const isCheck = args.includes('--check');
  if (!hasLocalDAG) {
    if (!isCheck) {
      recordTrail({
        ts: new Date().toISOString(),
        cmd: 'orient',
        note: note ?? '',
        repo: basename(repoRoot),
        position: 'untracked',
      });
    }
    if (hasFlag(['--json', '-j'], args)) {
      json({
        schema_version: 1,
        tool: { name: 'roadmap', version: readPackageVersion() },
        workspace: {
          root: repoRoot,
          package_manager: 'unknown',
          node: process.version,
          platform: process.platform,
        },
        inputs: { dag: false },
        position: [],
        level: -1,
        produces: [],
        consumes: [],
        batchRemaining: [],
        batchComplete: false,
        done: 0,
        remaining: 0,
        complete: false,
        errors: [{ kind: 'no_dag', message: 'No roadmap tracked in this repo' }],
        exit: { code: 0 },
      } satisfies OrientV1);
    } else {
      json({ position: 'untracked', repo: basename(repoRoot), tracked: false });
    }
    return;
  }

  const dag = await loadDAGAsync();

  const pos = await crossOrientWithState(dag);

  // Position is receipt-authoritative — no post-hoc filtering needed
  let nextPosition = pos.position;
  let nextBatchRemaining = pos.batchRemaining;
  let nextLevel = pos.level;

  // Annotate current batch nodes with their mode
  const batchModes: Record<string, string> = {};
  for (const nodeId of nextPosition) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (node?.mode === 'plan') batchModes[nodeId] = 'plan';
  }

  // Annotate batch nodes with claim status
  const claimStore = loadClaims(repoRoot);
  const claimAnnotations = annotateWithClaims(nextPosition, claimStore);

  const result: Record<string, unknown> = {
    position: nextPosition,
    level: nextLevel,
    produces: pos.produces,
    consumes: pos.consumes,
    batchRemaining: nextBatchRemaining,
    batchComplete: nextBatchRemaining.length === 0,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.remaining.length === 0,
  };

  if (!isCheck) {
    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'orient',
      note: note ?? '',
      repo: basename(repoRoot),
      position: nextPosition,
      level: nextLevel,
    });
  }

  // Emit result
  emit({ ok: true, cmd: _outputOpts.cmd, data: result }, _outputOpts);
}

async function cmdAdvance(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap spec plan --gallery --note "..."' });
    process.exit(1);
    return;
  }

  const dag = await loadDAGAsync();
  const pos = await crossOrientWithState(dag);

  // Validate current batch is complete
  if (!pos.batchComplete) {
    const remaining = pos.batchRemaining;
    json({
      error: 'Batch not complete',
      remaining: remaining.length,
      nodes: remaining,
      fix: `Complete nodes: ${remaining.join(', ')}`,
    });
    process.exit(1);
    return;
  }

  // Validate all produce artifacts exist for current batch
  const completions = await loadCompletionsWithEvidence(repoRoot);
  for (const nodeId of pos.position) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    const produces = node.produces ?? [];
    if (!completions.has(nodeId) && produces.length > 0) {
      json({
        error: `Missing completion for ${nodeId}`,
        produces,
        fix: 'Node has not been completed yet',
      });
      process.exit(1);
      return;
    }

    // Verify artifacts exist
    for (const artifact of produces) {
      const fullPath = join(repoRoot, artifact);
      if (!existsSync(fullPath)) {
        json({
          error: `Missing artifact: ${artifact}`,
          node: nodeId,
          fix: 'Artifact was not produced',
        });
        process.exit(1);
        return;
      }
    }
  }

  // Move to next batch using advanceBatch
  const next = await advanceBatch(dag, completions as any, retiredSet());

  if (!next || next.position.length === 0) {
    // Terminal: all work complete
    json({
      ok: true,
      advanced: true,
      level: pos.level + 1,
      position: [],
      message: 'All work complete',
      done: true,
    });

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'advance',
      note,
      repo: basename(repoRoot),
      position: [],
      level: pos.level + 1,
      detail: { done: true },
    });
    return;
  }

  json({
    ok: true,
    advanced: true,
    previousLevel: pos.level,
    level: next.level,
    position: next.position,
    batchRemaining: next.batchRemaining,
    produces: next.produces,
    consumes: next.consumes,
  });

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'advance',
    note,
    repo: basename(repoRoot),
    position: next.position,
    level: next.level,
  });
}

async function cmdMake(note: string) {
  const specPath = args[1];
  if (!specPath) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap make <spec-path>',
      entry: 'bin/roadmap',
    }, 'Missing spec path');
  }

  const resolved = resolve(repoRoot, specPath);
  if (!existsSync(resolved)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: resolved,
      fix: `Create ${specPath} first`,
    }, `Spec not found: ${resolved}`);
  }

  // Load and parse the spec (through gitsafe)
  const specContent = safeReadFile(resolved);
  let parsed: any;
  try {
    parsed = JSON.parse(specContent);
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec is valid JSON',
    }, `Failed to parse spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Intake enforcement: reject raw DAG JSON, require spec format
  if (parsed.nodes && typeof parsed.nodes === 'object' && !parsed.tasks) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: [
        'Cannot create DAG from raw JSON.',
        'roadmap make expects a spec, not a DAG definition.',
        '',
        'Proper workflow:',
        '  1. roadmap spec plan --from <requirements.md> --output spec.json',
        '  2. roadmap make spec.json',
        '  3. roadmap show <node-id> to inspect',
      ].join('\n'),
    }, 'Invalid spec: raw DAG detected. Use the spec pipeline to create a spec first.');
  }

  // Validate required spec fields
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Spec must have a "tasks" array. Use: roadmap spec plan --from <requirements.md>',
    }, 'Invalid spec: missing "tasks" array');
  }

  if (!parsed.metadata || typeof parsed.metadata !== 'object') {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Spec must have a "metadata" object with "generated" and "compile_hash". Use the spec pipeline.',
    }, 'Invalid spec: missing "metadata" object');
  }

  if (!parsed.schema_version) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Spec must have "schema_version". Use the spec pipeline to generate a valid spec.',
    }, 'Invalid spec: missing "schema_version"');
  }

  // Convert spec to DAG
  let dag: any;
  try {
    dag = tasksToDAG(parsed.tasks, { dagId: parsed.dag_id ?? parsed.id ?? 'ideal-dag', dagDesc: parsed.dag_desc });
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec conforms to SpecIR format',
    }, `Failed to convert spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Validate the DAG
  try {
    define(dag);
    const verifyErrors = verify(dag);
    const checkResult = check(dag);

    if (!checkResult.done || verifyErrors.length > 0) {
      throw new Error(`${verifyErrors.length} verification errors`);
    }
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Fix the spec and re-run',
    }, `Spec validation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Terminal intent gate invariant
  const terminalError = validateTerminalIntentGate(dag);
  if (terminalError && !args.includes('--skip-terminal-intent')) {
    throw new RoadmapError('VALIDATION_FAILED', {
      node: terminalError.node,
      fix: terminalError.fix,
    }, terminalError.message);
  }

  // Write to head.json
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');

  // Write spec-origin receipt for provenance tracking
  const dagJson = JSON.stringify(dag);
  const dagHash = createHash('sha256').update(dagJson).digest('hex');
  const specHash = createHash('sha256').update(specContent).digest('hex');
  const origin: SpecOrigin = {
    schemaVersion: 1,
    engine: parsed.engine?.name ?? 'spec-kit',
    version: parsed.engine?.version ?? '0.0.0',
    compile_hash: parsed.metadata?.compile_hash ?? dagHash,
    spec_sha: specHash,
    importedAt: new Date().toISOString(),
    dagId: parsed.dag_id ?? parsed.id ?? 'ideal-dag',
  };
  writeSpecOrigin(repoRoot, origin);

  // Commit
  try {
    execSync('git add .roadmap/head.json .roadmap/spec-origin.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "make: ideal DAG from ${specPath}"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch (e) {
    // Commit might fail, but DAG is written
  }

  const pos = await crossOrientWithState(dag);

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'make',
    note,
    repo: basename(repoRoot),
    position: pos.position,
    level: pos.level,
    detail: { spec: specPath, nodes: Object.keys(dag.nodes ?? {}).length },
  });

  json({
    ok: true,
    dag: dag,
    position: pos.position,
    level: pos.level,
    message: 'Ideal DAG created from spec',
  });
}

async function cmdSpecGroup(note: string | undefined) {
  const sub = args[1];
  switch (sub) {
    case 'help':
    case '--help':
    case '-h':
      return cmdSpecHelp();
    case 'plan':     return await cmdPlanRouter(note!);
    case 'import':   return cmdSpecImport(note!);
    case 'intake':   return cmdIntake(note!);
    case 'compile':  return cmdSpecCompile(note!);
    case 'init':     return cmdSpecInit(note!);
    default:
      json({ error: `Unknown spec subcommand: ${sub}`, fix: 'roadmap spec plan|import|intake|compile|init' });
      process.exit(1);
  }
}

function cmdSpecHelp() {
  json({
    command: 'spec',
    description: 'Spec intake pipeline',
    subcommands: [
      { name: 'plan', args: '[--gallery|select <id>|status]', description: 'Spec planning: gallery, selection, status' },
      { name: 'import', args: '--from speckit <file.md> --id <dag-id>', description: 'Parse tasks.md → roadmap DAG' },
      { name: 'intake', args: '[absorb|scan|import|certify]', description: 'Absorb git range → intake JSON' },
      { name: 'compile', args: '', description: 'Parse tasks → spec-compiled.json (roadmap IR)' },
      { name: 'init', args: '--id <dag-id> [--engine <name>]', description: 'Create spec workspace + config' },
    ],
    examples: [
      'roadmap spec plan --gallery --note "show gallery"',
      'roadmap spec import --from speckit tasks.md --id phase-2 --note "import"',
      'roadmap spec plan select auth-spec --note "select spec"',
      'roadmap spec compile --note "compile spec"',
      'roadmap spec init --id phase-2 --note "init workspace"',
    ],
  });
}

// Route plan to appropriate handler based on subcommand/flags
async function cmdPlanRouter(note: string) {
  if (args.includes('--gallery')) return await cmdPlanGallery(note);
  if (args[2] === 'select') return await cmdPlanSelect(note);
  if (args[2] === 'status') return await cmdPlanStatus();
  json({ error: 'Unknown plan subcommand', fix: 'roadmap spec plan --gallery | spec plan select <id> --note "..." | spec plan status' });
  process.exit(1);
}

async function cmdPlanGallery(note: string) {
  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';

  const evalDir = join(repoRoot, '.roadmap', 'evaluations');

  if (!existsSync(specSource)) {
    json({ error: `Spec source not found: ${specSource}`, fix: 'Run: roadmap spec compile --note "compile spec"' });
    process.exit(1);
    return;
  }

  const jsonOutput = hasFlag(['--json', '-j'], args);

  const candidates = buildGallery(specSource, evalDir);

  if (jsonOutput) {
    recordTrail({
      ts: new Date().toISOString(), cmd: 'spec.plan.gallery', note,
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

  // Recommendation: lowest risk
  const recommended = candidates.reduce((best, c) => c.estimates.risk < best.estimates.risk ? c : best, candidates[0]);
  lines.push(`Recommendation: ${recommended.id} (risk=${recommended.estimates.risk.toFixed(2)}, cost=$${recommended.estimates.costUSD.toFixed(4)})`);
  lines.push('');
  lines.push(`Select [${candidates.map((_, i) => String.fromCharCode(65 + i)).join('/')}]:`);
  lines.push('  roadmap spec plan select <id> --note "..."');
  lines.push('');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.gallery', note,
    repo: basename(repoRoot),
    detail: { candidateCount: candidates.length, recommended: recommended.id, specSource },
  });

  console.log(lines.join('\n'));
}

async function cmdPlanSelect(note: string) {
  const selectId = args[2];
  if (!selectId) {
    json({ error: 'Missing candidate ID', fix: 'roadmap spec plan select <id> --note "..."' });
    process.exit(1);
    return;
  }

  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';
  const evalDir = join(repoRoot, '.roadmap', 'evaluations');
  const headPath = join(repoRoot, '.roadmap', 'head.json');

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

  // Validate the execution plan DAG before replacing head.json
  try {
    define(selected.dag as any);
    const verifyErrors = verify(selected.dag as any);
    if (verifyErrors.length > 0) {
      json({
        error: 'Selected execution plan failed validation',
        details: verifyErrors,
        fix: 'The strategy DAG has contract violations. This is a bug in the strategy generation.',
      });
      process.exit(1);
    }
    const checkResult = check(selected.dag as any);
    if (!checkResult.done) {
      json({
        error: 'Selected execution plan is incomplete',
        orphans: checkResult.orphans,
        fix: 'The strategy DAG has unreachable nodes. This is a bug in the strategy generation.',
      });
      process.exit(1);
    }
  } catch (e: any) {
    json({
      error: 'Selected execution plan failed structural validation',
      reason: e.message || String(e),
      fix: 'The strategy DAG is malformed. This is a bug in the strategy generation.',
    });
    process.exit(1);
  }

  // Write selected execution plan as head.json (replaces current DAG)
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(headPath, JSON.stringify(selected.dag, null, 2) + '\n');

  // Commit the strategy selection
  try {
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "roadmap: strategy select ${selected.id} — execution plan with gates baked in"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch (e) {
    // Commit might fail if no changes or git not configured, but that's OK
  }

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.select', note,
    repo: basename(repoRoot),
    detail: { selectedId: selected.id, runId, specSource, manualOverride: true },
  });

  json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json', recovery: 'roadmap dig .roadmap/head.json --restore' });
  return;
}

async function cmdPlanStatus() {
  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';

  if (!existsSync(specSource)) {
    json({ error: `Spec source not found: ${specSource}` });
    process.exit(1);
    return;
  }

  const evalDir = join(repoRoot, '.roadmap', 'evaluations');
  const selectionPath = join(evalDir, 'plan-selection.jsonl');

  let selectedId = undefined;
  if (existsSync(selectionPath)) {
    const lines = readFileSync(selectionPath, 'utf-8').split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const latest = JSON.parse(lines[lines.length - 1]);
      selectedId = latest.selectedId;
    }
  }

  const candidates = buildGallery(specSource, evalDir);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.status', note: '', repo: basename(repoRoot),
    detail: { selectedId, candidates: candidates.length },
  });

  json({
    candidates,
    selected: selectedId,
    totalCandidates: candidates.length,
  });
}

// --- Spec import/intake/compile/init stubs ---

function cmdSpecImport(note: string) {
  json({ error: 'spec import not yet implemented in mainline', fix: 'roadmap spec import --from speckit <file.md> --id <dag-id> --note "..."' });
}

function cmdIntake(note: string) {
  json({ error: 'spec intake not yet implemented in mainline', fix: 'roadmap spec intake [absorb|scan|import|certify] --note "..."' });
}

function cmdSpecCompile(note: string) {
  json({ error: 'spec compile not yet implemented in mainline', fix: 'roadmap spec compile --note "..."' });
}

function cmdSpecInit(note: string) {
  json({ error: 'spec init not yet implemented in mainline', fix: 'roadmap spec init --id <dag-id> --note "..."' });
}

// --- Topology group ---

function cmdTopologyGroup() {
  const sub = args[1];
  switch (sub) {
    case 'help':
    case '--help':
    case '-h':
      return cmdTopologyHelp();
    case 'show':
      return cmdTopologyShow();
    case 'where':
      return cmdTopologyWhere();
    case 'validate':
      return cmdTopologyValidate();
    case 'enforce':
      return cmdTopologyEnforce();
    default:
      json({ error: `Unknown topology subcommand: ${sub}`, fix: 'roadmap topology show|where|validate|enforce' });
      process.exit(1);
  }
}

function cmdTopologyHelp() {
  json({
    command: 'topology',
    description: 'Git architecture topology for LLM agents',
    subcommands: [
      { name: 'show', args: '', description: 'Full architecture: clones, branches, contracts' },
      { name: 'where', args: '', description: 'Current position: clone, branch, sync status' },
      { name: 'validate', args: '', description: 'Verify clone state matches expected topology' },
      { name: 'enforce', args: '--op <operation> [--branch <branch>] [--to <target>]', description: 'Check if operation is allowed in current context' },
    ],
    examples: [
      'roadmap topology show',
      'roadmap topology where',
      'roadmap topology validate',
      'roadmap topology enforce --op push --to origin',
      'roadmap topology enforce --op work --branch feat/new',
    ],
  });
}

function cmdTopologyShow() {
  const result = getArchitecture(repoRoot);
  emit({ ok: true, cmd: 'topology.show', data: result }, _outputOpts);
}

function cmdTopologyWhere() {
  const result = getWhere(repoRoot);
  emit({ ok: true, cmd: 'topology.where', data: result }, _outputOpts);
}

function cmdTopologyValidate() {
  const result = validateClone(repoRoot);
  emit({ ok: true, cmd: 'topology.validate', data: result }, _outputOpts);
}

function cmdTopologyEnforce() {
  const opIdx = args.indexOf('--op');
  if (opIdx === -1 || !args[opIdx + 1]) {
    json({ error: 'Missing --op <operation>', fix: 'roadmap topology enforce --op push|merge|fetch|checkout|commit|work|read [--branch X] [--to Y]' });
    process.exit(1);
    return;
  }
  const op = args[opIdx + 1] as Operation;
  const branchIdx = args.indexOf('--branch');
  const branch = branchIdx !== -1 ? args[branchIdx + 1] : undefined;
  const toIdx = args.indexOf('--to');
  const to = toIdx !== -1 ? args[toIdx + 1] : undefined;

  const result = enforceOperation(repoRoot, op, branch, to);
  emit({ ok: true, cmd: 'topology.enforce', data: result }, _outputOpts);
}

// --- Agent group ---

async function cmdAgentGroup(note: string | undefined) {
  const sub = args[1];
  switch (sub) {
    case 'help':
    case '--help':
    case '-h':
      return cmdAgentHelp();
    case 'claim':
      return await cmdAgentClaim(note);
    case 'complete':
      return await cmdAgentComplete(note);
    case 'status':
      return cmdAgentStatus();
    case 'cleanup':
      return cmdAgentCleanup();
    default:
      json({ error: `Unknown agent subcommand: ${sub}`, fix: 'roadmap agent claim|complete|status|cleanup' });
      process.exit(1);
  }
}

function cmdAgentHelp() {
  json({
    command: 'agent',
    description: 'Agent task coordination: claim, work, complete (zero git management)',
    subcommands: [
      { name: 'claim', args: '<task-id> [--agent-id <id>]', description: 'Claim task + create isolated worktree' },
      { name: 'complete', args: '<task-id> [--message "summary"]', description: 'Verify artifacts, commit, push, cleanup' },
      { name: 'status', args: '', description: 'List active agent worktrees' },
      { name: 'cleanup', args: '<task-id>', description: 'Remove worktree + delete agent branch' },
    ],
    examples: [
      'roadmap agent claim my-task --agent-id agent-1',
      'roadmap agent complete my-task --message "implemented auth module"',
      'roadmap agent status',
      'roadmap agent cleanup my-task',
    ],
    workflow: [
      '1. roadmap agent claim <task-id>   -- get isolated worktree',
      '2. (work in worktree, edit files)',
      '3. roadmap agent complete <task-id> -- commit + push + cleanup',
    ],
  });
}

async function cmdAgentClaim(note: string | undefined) {
  const taskId = args[2];
  if (!taskId) {
    json({ error: 'Missing task-id', fix: 'roadmap agent claim <task-id> [--agent-id <id>]' });
    process.exit(1);
    return;
  }

  const agentIdIdx = args.indexOf('--agent-id');
  const agentId = agentIdIdx !== -1 ? args[agentIdIdx + 1] : `agent-${Date.now().toString(36)}`;

  // Create claim in claims store
  const claimStore = loadClaims(repoRoot);
  const now = new Date();
  const ttlHours = 4;
  const claimExpiry = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();

  // Check for existing active claim
  const existing = claimStore[taskId];
  if (existing && !isExpired(existing, now)) {
    json({
      error: `Task ${taskId} already claimed by ${existing.owner}`,
      claimedAt: existing.claimedAt,
      expiresAt: existing.claimExpiry,
      fix: `Wait for claim to expire or use: roadmap agent cleanup ${taskId}`,
    });
    process.exit(1);
    return;
  }

  // Write claim
  claimStore[taskId] = { owner: agentId, claimedAt: now.toISOString(), claimExpiry };
  saveClaims(repoRoot, claimStore);

  // Create worktree
  let worktreeResult;
  try {
    worktreeResult = createAgentWorktree(repoRoot, agentId, taskId);
  } catch (e) {
    // Rollback claim on worktree failure
    delete claimStore[taskId];
    saveClaims(repoRoot, claimStore);
    json({
      error: `Failed to create worktree: ${e instanceof Error ? e.message : String(e)}`,
      fix: 'Check disk space and git worktree state',
    });
    process.exit(1);
    return;
  }

  recordTrail({
    ts: now.toISOString(),
    cmd: 'agent.claim',
    note: note ?? `claim ${taskId}`,
    repo: basename(repoRoot),
    detail: { taskId, agentId, branch: worktreeResult.branch },
  });

  emit({ ok: true, cmd: 'agent.claim', data: {
    claimed: true,
    taskId,
    agentId,
    worktree: worktreeResult.worktreePath,
    branch: worktreeResult.branch,
    cwd: worktreeResult.cwd,
    produces: worktreeResult.produces,
    consumes: worktreeResult.consumes,
    claimExpiry,
    guidance: `cd ${worktreeResult.cwd} && work on produces: [${worktreeResult.produces.join(', ')}]`,
  }}, _outputOpts);
}

async function cmdAgentComplete(note: string | undefined) {
  const taskId = args[2];
  if (!taskId) {
    json({ error: 'Missing task-id', fix: 'roadmap agent complete <task-id> [--message "summary"]' });
    process.exit(1);
    return;
  }

  const msgIdx = args.indexOf('--message');
  const commitMessage = msgIdx !== -1 ? args[msgIdx + 1] : `${taskId}: task complete`;

  const worktreePath = join(repoRoot, '.claude', 'worktrees', taskId);
  if (!existsSync(worktreePath)) {
    json({ error: `No worktree found for ${taskId}`, fix: 'Claim the task first: roadmap agent claim ' + taskId });
    process.exit(1);
    return;
  }

  // Read brief to get produces list
  const briefPath = join(worktreePath, '.roadmap', `brief-${taskId}.json`);
  let produces: string[] = [];
  let branch = '';
  if (existsSync(briefPath)) {
    const brief = JSON.parse(readFileSync(briefPath, 'utf-8'));
    produces = brief.produces ?? [];
    branch = brief.branch ?? '';
  }

  if (!branch) {
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath, stdio: 'pipe' }).toString().trim();
    } catch {
      json({ error: 'Cannot determine branch in worktree', fix: 'Check worktree state' });
      process.exit(1);
      return;
    }
  }

  // Verify produces artifacts exist in worktree
  const missing: string[] = [];
  for (const artifact of produces) {
    const fullPath = join(worktreePath, artifact);
    if (!existsSync(fullPath)) missing.push(artifact);
  }

  if (missing.length > 0) {
    json({
      error: 'Missing produce artifacts',
      missing,
      worktree: worktreePath,
      fix: `Create the missing files in ${worktreePath}`,
    });
    process.exit(1);
    return;
  }

  // Stage produces + commit
  try {
    if (produces.length > 0) {
      execSync(`git add ${produces.map(p => `"${p}"`).join(' ')}`, { cwd: worktreePath, stdio: 'pipe' });
    } else {
      // No explicit produces — add all changes
      execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });
    }

    // Check if there are staged changes
    const status = execSync('git diff --cached --name-only', { cwd: worktreePath, stdio: 'pipe' }).toString().trim();
    let commitSha = '';

    if (status) {
      execSync(`git commit -m "${taskId}: ${commitMessage}"`, { cwd: worktreePath, stdio: 'pipe' });
      commitSha = execSync('git rev-parse --short HEAD', { cwd: worktreePath, stdio: 'pipe' }).toString().trim();
    }

    // Push to origin
    let pushed = false;
    try {
      execSync(`git push origin "${branch}"`, { cwd: worktreePath, stdio: 'pipe', timeout: 30000 });
      pushed = true;
    } catch {
      // Push may fail if no remote or network — non-fatal
    }

    // Cleanup worktree
    const cleanup = cleanupAgentWorktree(repoRoot, taskId);

    // Release claim
    const claimStore = loadClaims(repoRoot);
    delete claimStore[taskId];
    saveClaims(repoRoot, claimStore);

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'agent.complete',
      note: note ?? `complete ${taskId}`,
      repo: basename(repoRoot),
      detail: { taskId, commit: commitSha, branch, pushed },
    });

    emit({ ok: true, cmd: 'agent.complete', data: {
      completed: true,
      taskId,
      commit: commitSha || null,
      branch,
      pushed,
      cleaned: cleanup.cleaned,
      message: pushed
        ? `Task ${taskId} completed, committed, pushed to ${branch}`
        : `Task ${taskId} completed, committed locally on ${branch} (push failed — manual push needed)`,
    }}, _outputOpts);

  } catch (e) {
    json({
      error: `Completion failed: ${e instanceof Error ? e.message : String(e)}`,
      worktree: worktreePath,
      fix: 'Check git state in the worktree',
    });
    process.exit(1);
  }
}

function cmdAgentStatus() {
  const worktrees = listAgentWorktrees(repoRoot);
  emit({ ok: true, cmd: 'agent.status', data: {
    activeWorktrees: worktrees.length,
    worktrees,
    guidance: worktrees.length === 0
      ? 'No active agent worktrees. Claim a task: roadmap agent claim <task-id>'
      : `${worktrees.length} active worktree(s). Complete with: roadmap agent complete <task-id>`,
  }}, _outputOpts);
}

function cmdAgentCleanup() {
  const taskId = args[2];
  if (!taskId) {
    json({ error: 'Missing task-id', fix: 'roadmap agent cleanup <task-id>' });
    process.exit(1);
    return;
  }

  const result = cleanupAgentWorktree(repoRoot, taskId);

  // Release claim
  const claimStore = loadClaims(repoRoot);
  if (taskId in claimStore) {
    delete claimStore[taskId];
    saveClaims(repoRoot, claimStore);
  }

  emit({ ok: true, cmd: 'agent.cleanup', data: {
    taskId,
    cleaned: result.cleaned,
    branchDeleted: result.branch,
    message: result.cleaned
      ? `Worktree and branch cleaned for ${taskId}`
      : `No worktree found for ${taskId}`,
  }}, _outputOpts);
}

// --- Help ---
function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Core commands (mainline execution loop):
  make <spec>        Create ideal DAG from spec
  orient             Current batch position + produces/consumes
  advance            Advance to next batch (requires batch complete)

Command groups (use 'roadmap <group> help' for details):
  spec <sub>         Spec planning and intake: plan, import, intake, compile, init
  topology <sub>     Git architecture topology: show, where, validate, enforce
  agent <sub>        Agent coordination: claim, complete, status, cleanup

All commands require --note "reason" (except help/orient/topology/agent).
Output is JSON. Use jq for filtering.

Examples:
  roadmap orient --note "check position"
  roadmap make spec.json --note "create ideal DAG"
  roadmap advance --note "move to next batch"
  roadmap topology where
  roadmap agent claim my-task --agent-id agent-1
  roadmap agent complete my-task --message "done"
`);
}

// --- Shared utilities ---

// Async version: loads and optionally merges multiple DAGs
async function loadDAGAsync(): Promise<Graph<string>> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json or use: roadmap make <spec> --note "..."',
      entry: 'roadmap orient',
    }, 'No .roadmap/head.json found.');
  }

  try {
    // Attempt auto-merge: consolidate multiple DAGs if present
    const result = await loadDAGWithAutoMerge(repoRoot);
    return result.graph;
  } catch (err) {
    // Fallback: load head.json directly
    return JSON.parse(safeReadFile(headPath));
  }
}

// Sync version: loads from head.json only
function loadDAG(): Graph<string> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json or use: roadmap make <spec> --note "..."',
      entry: 'roadmap orient',
    }, 'No .roadmap/head.json found.');
  }
  return JSON.parse(safeReadFile(headPath));
}

function json(obj: unknown) {
  const hasError = typeof obj === 'object' && obj !== null && 'error' in obj;

  // Send to emit() for stdout/exit/rendering
  emit({ ok: !hasError, cmd: _outputOpts.cmd, data: obj } as any, _outputOpts);
}

// Entry point
main();
