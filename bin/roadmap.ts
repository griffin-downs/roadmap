#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'spec']);
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
  const completionsMap = await loadCompletionsWithEvidence(repoRoot);
  const retired = retiredSet();

  // Convert Map to CompletionStore-compatible interface
  const completions: any = completionsMap;

  const pos = orient(dag, completions, retired);

  // Recompute remaining based on completions
  const allNodeIds = Object.keys(dag.nodes);
  const remainingIds = allNodeIds.filter(nid => !retired.has(nid) && !completionsMap.has(nid));

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
  // Plan gate not required in minimal mode
  if (!args.includes('--skip-plan-gate')) {
    // Optional: could add plan gate check here if needed
  }

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

  // Load and parse the spec
  const specContent = readFileSync(resolved, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(specContent);
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec is valid JSON',
    }, `Failed to parse spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Convert spec to DAG
  let dag: any;
  try {
    // If parsed is a SpecIR (has tasks array), convert it
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      dag = tasksToDAG(parsed.tasks, parsed.id ?? 'ideal-dag');
    } else if (parsed.nodes && typeof parsed.nodes === 'object') {
      // Already a DAG
      dag = parsed;
    } else {
      throw new Error('Spec must have "tasks" array or "nodes" object');
    }
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec conforms to SpecIR or DAG format',
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

  // Commit
  try {
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
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
  console.log(`roadmap spec — Spec intake pipeline

Subcommands:
  plan [--gallery|select <id>|status]
    Spec planning: gallery, selection, status
  import --from speckit <file.md> --id <dag-id>
    Parse tasks.md → roadmap DAG
  intake [absorb|scan|import|certify]
    Absorb git range → intake JSON
  compile
    Parse tasks → spec-compiled.json (roadmap IR)
  init --id <dag-id> [--engine <name>]
    Create spec workspace + config

Examples:
  roadmap spec plan --gallery --note "show gallery"
  roadmap spec import --from speckit tasks.md --id phase-2 --note "import"
  roadmap spec plan select auth-spec --note "select spec"
  roadmap spec compile --note "compile spec"
  roadmap spec init --id phase-2 --note "init workspace"
`);
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

// --- Help ---
function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Core commands (mainline execution loop):
  make <spec>        Create ideal DAG from spec (JSON or IR)
  orient             Current batch position + produces/consumes
  advance            Advance to next batch — validate all work complete

Command groups (use 'roadmap <group> help' for details):
  spec <sub>         Spec pipeline: plan, import, intake, compile, init

Global flags:
  --quiet, -q        Suppress non-fatal output
  --json, -j         Machine-readable JSON output
  --dry-run          Show what would happen without executing

All commands (except help/orient) require --note "reason".

Examples:
  roadmap orient --note "check position"
  roadmap make spec.json --note "create ideal DAG"
  roadmap advance --note "move to next batch"
  roadmap spec plan --gallery --note "show candidates"
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
    return JSON.parse(readFileSync(headPath, 'utf-8'));
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
  return JSON.parse(readFileSync(headPath, 'utf-8'));
}

function json(obj: unknown) {
  const hasError = typeof obj === 'object' && obj !== null && 'error' in obj;

  // Send to emit() for stdout/exit/rendering
  emit({ ok: !hasError, cmd: _outputOpts.cmd, data: obj } as any, _outputOpts);
}

// Entry point
main();
