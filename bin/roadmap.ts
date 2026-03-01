#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  define, check, verify, order, parallelOrder, batchConflicts, orient, readyNodes, nextBatch, criticalPath, reconcile,
  validateNode, validateGraph, consumeArtifact,
} from '../src/protocol.ts';
import type { ConsumeSpec } from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import { crossOrient } from '../src/lib/cross-orient.ts';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';
import { discoverDependencies, resolveSiblingPath } from '../src/lib/utils/dependency-resolver.ts';
import { loadClaims, saveClaims, isExpired, activeClaims, annotateWithClaims, assignBatch } from '../src/lib/claims/claims.ts';
import { parseTasksMd, tasksToDAG } from '../src/lib/intake/speckit-import.ts';
import { compileIR, parseIRFile, defaultConfig } from '../src/lib/intake/spec-ir.ts';
import type { SpecConfig, SpecIR, SpecIRTask, SpecInput } from '../src/lib/intake/spec-ir.ts';
import { enrichIntentGate } from '../src/lib/intent/intent-gate-enrichment.ts';
import { loadCompletions, getCompletedNodeIds } from '../src/lib/completion/completion-tracker.ts';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence, hasPassingReceipt } from '../src/lib/evidence/completion-evidence.ts';
import type { EvidenceRecord } from '../src/lib/evidence/completion-evidence.ts';
import { buildSpawnPlan } from '../src/lib/recipes/spawn/spawn-plan.ts';
import { buildScaffold } from '../src/lib/scaffold.ts';
import { buildClusters } from '../src/lib/utils/cluster/cluster.ts';
import { buildSchedule } from '../src/lib/schedule.ts';
import { propagateConstraints } from '../src/lib/propagate.ts';
import { compilePrompts } from '../src/lib/compile-prompts.ts';
import { compileBrief } from '../src/lib/compile-brief.ts';
import { compileBriefWithSpecKit } from '../src/commands/compile-brief-sk.ts';
import { recordEvaluation, judgmentToRecord } from '../src/lib/intent/intent-evaluator.ts';
import { validateTerminalIntentGate, validateInitIntentGate, findInitBoundary } from '../src/lib/validate-dag.ts';
import { writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit } from '../src/lib/intake/spec-origin.ts';
import type { SpecOrigin, SpecImportReceipt } from '../src/lib/intake/spec-origin.ts';
import { scanIntake, importIntake, certifyIntake } from '../src/lib/intake/intake.ts';
import { runIntakeAbsorb } from '../src/lib/intake/intake-cmd.ts';
import { addPeer, removePeer, buildFederationView, federationStatus } from '../src/lib/utils/federation/federation.ts';
import { buildPlanOverlay, writePlanOverlay, loadPlanOverlay, isOverlayValid } from '../src/lib/plan-overlay.ts';
import { runOverlayFromIntake } from '../src/lib/recipes/overlay/overlay-cmd.ts';
import { createDispatchPlan, applyDispatchPlan, loadDispatchPlan, dispatchStatus } from '../src/lib/recipes/dispatch/dispatch.ts';
import { buildGallery } from '../src/lib/gallery-templates/index.ts';
import { listNodeReceipts, completionDoctor, completionCompact } from '../src/lib/receipts-ux.ts';
import { certifyAutoIntake } from '../src/lib/intake/auto-intake.ts';
import { estimateCost } from '../src/lib/cost-estimator.ts';
import { runEnvAudit } from '../src/lib/env-audit.ts';
import { runAuditIngest } from '../src/lib/audit/ingest.ts';
import { runAuditRecommend } from '../src/lib/audit/recommend.ts';
import { runProfile } from '../src/lib/profile-cmd.ts';
import { runPatchStack } from '../src/lib/recipes/patch/patch-stack-cmd.ts';
import { installAll, extractVersionHash, readPackageVersion, computeSkillHash } from '../src/lib/install-skills.ts';
import { specKitInit, SPEC_KIT_INIT_HELP } from '../src/commands/spec-init.ts';
import { loadCandidate, computeHeadSha, candidateExists, writeCandidateDAG } from '../src/lib/dag-candidate.ts';
import { writeToken, readToken, listTokens, isTokenExpired, tokenId as deriveTokenId, TOKEN_DIR } from '../src/lib/utils/tokens/token-store.ts';
import type { TokenType, BoundToken } from '../src/lib/utils/tokens/token-store.ts';
import { readIndex, gcTokens } from '../src/lib/utils/tokens/token-index.ts';
import type { Graph, Orientation } from '../src/protocol.ts';
import type { SiblingStatus } from '../src/lib/cross-orient.ts';
import type { OrientV1, OrientDag, OrientDagNode, OrientDagEdge, OrientBlockedNode } from '../src/lib/core/orient-schema.ts';
import { emit, emitError, parseOutputOpts, ErrorCode, type OutputFormat, type RenderV1 } from '../src/lib/cli-envelope.ts';
import { render, renderDagLayers, type RenderOpts, type RenderModel, type RenderOutput, type DagLayer, type DagNode } from '../src/lib/render/index.ts';
import { resolveWidth } from '../src/lib/render/layout.ts';
import { renderOrient, renderChart, renderPlanGallery, renderPlanSelect, renderPlanStatus, renderDoctor, renderValidate, renderTrail, renderRemaining } from '../src/lib/cli-human.ts';
import type { OrientData, ChartData, GalleryData, PlanSelectData, PlanStatusData, DoctorData, ValidateData, TrailData, RemainingData } from '../src/lib/cli-human.ts';
import { ensureRunDir, readMeta, writeMeta, runDir, type RunId, type RunMeta, generateRunId } from '../src/lib/metaflow/index.ts';
import { isReceiptRequired } from '../src/lib/metaflow/command-registry.ts';
import { SessionStore } from '../src/lib/metaflow/state/session-store.ts';
import { buildQuestionBlock, recordAnswer, getAnswers } from '../src/lib/metaflow/ask.ts';
import { InteractionReceiptWriter } from '../src/lib/metaflow/execution/receipt-writer.ts';
import { wrapSubcommand } from '../src/lib/metaflow/execution/wrap.ts';
import { mineRun, miningExists } from '../src/lib/metaflow/phases/mine-run.ts';
import { buildOptimizationNodes, readMining, emitOptExpansion } from '../src/lib/metaflow/phases/opt-dag.ts';
import { validateAuditTail } from '../src/lib/import/audit-tail-gate.ts';
import { loadRequired } from '../src/lib/metaflow/audit/audit.ts';
import { writeAuditReceipt } from '../src/lib/metaflow/audit/receipt.ts';

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

// --- Global output opts (FR-CLI-001) ---
function deriveEnvelopeCmd(): string {
  if (cmd === 'plan') {
    if (args.includes('--gallery')) return 'plan.gallery';
    if (args[1] === 'select') return 'plan.select';
    if (args[1] === 'status') return 'plan.status';
    return 'plan';
  }
  if (cmd === 'position') return 'orient';
  if (cmd === 'patch') { if (args[1] === 'stack') return 'patch.stack'; return 'patch'; }
  if (cmd === 'gate') { if (args[1] === 'merge') return 'gate.merge'; return 'gate'; }
  if (cmd === 'spec') {
    if (args[1] === 'init') return 'spec.init';
    if (args[1] === 'generate') return 'spec.generate';
    if (args[1] === 'compile') return 'spec.compile';
    return 'spec';
  }
  if (cmd === 'dag') {
    if (args[1] === 'diff') return 'dag.diff';
    return 'dag';
  }
  if (cmd === 'token') {
    if (args[1]) return `token.${args[1]}`;
    return 'token';
  }
  if (cmd === 'mf') {
    if (args[1] === 'init') return 'mf.init';
    if (args[1] === 'dispatch') return 'mf.dispatch';
    if (args[1] === 'retire-team') return 'mf.retire-team';
    if (args[1] === 'wrap') return 'mf.wrap';
    if (args[1] === 'mine') return 'mf.mine';
    if (args[1] === 'complete') return 'mf.complete';
    return 'mf';
  }
  if (cmd === 'internal') {
    if (args[1] === 'execute-flow') return 'internal.execute-flow';
    return 'internal';
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
  chart: (d) => renderChart(d as ChartData),
  'plan.gallery': (d) => renderPlanGallery(d as GalleryData),
  'plan.select': (d) => renderPlanSelect(d as PlanSelectData),
  'plan.status': (d) => renderPlanStatus(d as PlanStatusData),
  doctor: (d) => renderDoctor(d as DoctorData),
  validate: (d) => renderValidate(d as ValidateData),
  trail: (d) => renderTrail(d as TrailData),
  remaining: (d) => renderRemaining(d as RemainingData),
};
if (_humanRenderers[_outputOpts.cmd]) {
  _outputOpts.humanRenderer = _humanRenderers[_outputOpts.cmd];
}

// Commands that don't require a note
// Special case: orient/position with --check is note-exempt (silent polling)
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'trail', 'chart', 'install', 'dig', 'claim', 'diff', 'show', 'iter-id', 'explore', 'remaining', 'doctor', 'status', 'explain', 'receipts', 'artifacts', 'env-audit', 'completion', 'spec-kit', 'internal']);
const isOrientCheck = (cmd === 'orient' || cmd === 'position') && args.includes('--check');
if (isOrientCheck) {
  NOTE_EXEMPT.add('orient');
  NOTE_EXEMPT.add('position');
}
// checkpoint --list/--restore are read-only; --label is note-optional (claim is the evidence trail)
if (cmd === 'checkpoint' && (args.includes('--list') || args.includes('--restore') || args.includes('--label'))) {
  NOTE_EXEMPT.add('checkpoint');
}
// token list/inspect/gc and dag diff are read-only
if (cmd === 'token' && ['list', 'inspect', 'gc'].includes(args[1])) {
  NOTE_EXEMPT.add('token');
}
if (cmd === 'dag' && args[1] === 'diff') {
  NOTE_EXEMPT.add('dag');
}
// plan status is read-only
if (cmd === 'plan' && args[1] === 'status') {
  NOTE_EXEMPT.add('plan');
}
// compile-brief --help is read-only
if (cmd === 'compile-brief' && args.includes('--help')) {
  NOTE_EXEMPT.add('compile-brief');
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

// --- Completion state: single entry point for orient evidence ---
// All orient() calls in this CLI MUST use loadStore() + orient(dag, store).
// Receipt-only truth: a node is done iff CompletionStore.hasPassing(id).

function loadStore(): CompletionStore {
  return CompletionStore.loadOrEmpty(repoRoot);
}

function orientWithState(dag: Graph<string>) {
  return orient(dag, loadStore(), retiredSet());
}

async function crossOrientWithState(dag: Graph<string>) {
  return crossOrient(dag, repoRoot, loadStore(), retiredSet());
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
      case 'verify':    return await cmdVerify(note!);
      case 'check':     return await cmdCheck(note!);
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
      case 'dag':       return cmdDag(note!);
      case 'token':     return await cmdToken(note!);
      case 'import':    return cmdImport(note!);
      case 'intake':    return cmdIntake(note!);
      case 'federation': return cmdFederation(note!);
      case 'dispatch':  return await cmdDispatch(note!);
      case 'spec':      return cmdSpec(note!);
      case 'spec-kit':  return cmdSpecKit(note);
      case 'init':      return cmdInit(note!);
      case 'report':    return await cmdReport(note!);
      case 'scaffold':  return await cmdScaffold(note!);
      case 'cluster':   return cmdCluster(note!);
      case 'schedule':  return cmdSchedule(note!);
      case 'show':      return cmdShow();
      case 'commit':    return cmdCommit(note!);
      case 'complete':  return await cmdComplete(note!);
      case 'certify':   return await cmdCertify(note!);
      case 'checkpoint': return cmdCheckpoint(note);
      case 'diff':      return cmdDiff();
      case 'iter-id':   return cmdIterId();
      case 'dig':       return cmdDig();
      case 'propagate': return cmdPropagate(note!);
      case 'remaining': return cmdRemaining();
      case 'doctor':    return cmdDoctor();
      case 'status':    return cmdStatus();
      case 'explain':   return cmdExplain();
      case 'receipts':  return cmdReceipts();
      case 'completion': return cmdCompletion();
      case 'artifacts': return cmdArtifacts();
      case 'gallery':   return cmdGallery();
      case 'blend':     return cmdBlend();
      case 'explore':   return await cmdExplore();
      case 'contract':  return cmdContract(note!);
      case 'env-audit': return cmdEnvAudit();
      case 'profile':   return cmdProfile(note!);
      case 'audit':     return cmdAudit(note!);
      case 'patch':     return cmdPatch(note!);
      case 'compile-prompts': return cmdCompilePrompts(note!);
      case 'compile-brief': return cmdCompileBrief(note!);
      case 'gate':      return cmdGate(note!);
      case 'plan':
        if (args.includes('--gallery')) return await cmdPlanGallery(note!);
        if (args[1] === 'select') return await cmdPlanSelect(note!);
        if (args[1] === 'status') return await cmdPlanStatus();
        if (args[1] === 'overlay') return cmdPlanOverlay(note!);
        if (args[1] === 'schedule') return cmdPlanScheduleFromOverlay(note!);
        json({ error: 'Unknown plan subcommand', fix: 'roadmap plan --gallery | plan select <id> --note "..." | plan status | plan overlay --select <id> --note "..." | plan schedule --note "..."' });
        process.exit(1);
        return;
      case 'strategy':  return await cmdStrategy(note!);
      case 'mf':        return await cmdMf(note!);
      case 'internal':  return await cmdInternal(note!);
      case 'help':
      case '--help':
      case '-h':        return cmdHelp();
      default:
        json({ error: `Unknown command: ${cmd}`, fix: 'roadmap help' });
        process.exit(1);
    }
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
    if (args.includes('--json')) {
      json({
        schema_version: 1,
        tool: { name: 'roadmap', version: readPackageVersion() },
        workspace: {
          root: repoRoot,
          package_manager: detectPackageManager(),
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

  const dag = loadDAG();

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
    const ready = readyNodes(dag, loadStore(), retiredSet());
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
    const next = nextBatch(dag, loadStore(), retiredSet());
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

  // --brief: compile agent briefs for all nodes in current batch
  if (args.includes('--brief')) {
    const envPath = resolve(repoRoot, 'environment.md');
    let envSource: string | undefined;
    if (existsSync(envPath)) {
      envSource = readFileSync(envPath, 'utf-8');
    }

    const briefs: Record<string, any> = {};
    for (const nodeId of pos.position) {
      try {
        const brief = compileBrief(dag, nodeId, envSource);
        briefs[nodeId] = brief;
      } catch (e) {
        // If brief compilation fails, skip that node but continue
        briefs[nodeId] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    result.briefs = briefs;
  }

  // Strategy hint latch: if note contains strategy tokens and no active strategy, surface it
  if (note) {
    const { shouldLatch, isLatched, writeLatch, readActiveStrategy } = await import('../src/lib/strategy/active.ts');
    if (shouldLatch(note) && !isLatched(repoRoot)) {
      writeLatch(repoRoot, []);
    }
    if (isLatched(repoRoot) && !readActiveStrategy(repoRoot)) {
      const { proposeCandidates } = await import('../src/lib/strategy/select.ts');
      result.strategyRequired = true;
      result.candidates = proposeCandidates().map(c => ({ id: c.id, name: c.name, gateMode: c.gateMode, risk: c.estimatedRisk }));
    }
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
  // Build orient RenderModel
  const orientBatches = parallelOrder(dag);
  const doneSet = new Set(pos.done);
  const orientLayers: DagLayer[] = orientBatches.map((batch, i) => ({
    level: i,
    nodes: batch.map((id): DagNode => {
      const status: DagNode['status'] = doneSet.has(id) ? 'done'
        : pos.position.includes(id) ? 'current'
        : 'pending';
      const node = dag.nodes[id as keyof typeof dag.nodes] as any;
      return { id, status, desc: node?.desc };
    }),
  }));
  const orientRenderModel: RenderModel = {
    kind: 'orient',
    title: `orient: ${dag.id}`,
    nodes: [
      { t: 'kv', key: 'position', value: (result.position as string[]).join(', ') || '(none)' },
      { t: 'kv', key: 'level', value: String(result.level) },
      { t: 'bar', label: 'progress', cur: pos.done.length, total: pos.done.length + pos.remaining.length },
      { t: 'line' },
      { t: 'dagLayers', layers: orientLayers },
    ],
  };

  // --json: emit v1 machine envelope
  if (args.includes('--json')) {
    const v1 = buildOrientV1(dag, result, pos);
    json(v1, orientRenderModel);
  } else {
    json(result, orientRenderModel);
  }
}

function detectPackageManager(): string | undefined {
  if (existsSync(join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(repoRoot, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(repoRoot, 'bun.lockb')) || existsSync(join(repoRoot, 'bun.lock'))) return 'bun';
  if (existsSync(join(repoRoot, 'package-lock.json'))) return 'npm';
  return undefined;
}

function buildOrientV1(dag: Graph<string>, result: Record<string, unknown>, pos: any): OrientV1 {
  const v1: OrientV1 = {
    schema_version: 1,
    tool: { name: 'roadmap', version: readPackageVersion() },
    workspace: {
      root: repoRoot,
      dag_id: dag.id,
      package_manager: detectPackageManager(),
      node: process.version,
      platform: process.platform,
    },
    inputs: {
      dag: args.includes('--dag'),
    },

    position: result.position as string[],
    level: result.level as number,
    produces: pos.produces,
    consumes: pos.consumes,
    batchRemaining: pos.batchRemaining,
    batchComplete: (result.batchComplete as boolean) ?? false,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.remaining.length === 0,

    exit: { code: 0 },
  };

  if (result.preGate) v1.preGate = result.preGate as string[];
  if (result.planNodes) v1.planNodes = result.planNodes as Record<string, string>;
  if (result.claims) v1.claims = result.claims as Record<string, unknown>;
  if (result.iteration !== undefined) v1.iteration = result.iteration as number;

  // --dag: full DAG structure with nodes, edges, toposort, blocked, executable
  if (args.includes('--dag')) {
    v1.dag = buildOrientDag(dag, pos);
  }

  return v1;
}

function buildOrientDag(dag: Graph<string>, pos: any): OrientDag {
  const nodes = dag.nodes as Record<string, any>;
  const doneSet = new Set(pos.done as string[]);
  const remainingSet = new Set((pos.remaining as string[]) ?? []);
  const batchSet = new Set(pos.position as string[]);

  const dagNodes: OrientDagNode[] = [];
  const dagEdges: OrientDagEdge[] = [];

  for (const [id, node] of Object.entries(nodes)) {
    const n = node as any;

    let status: 'satisfied' | 'pending' | 'blocked' = 'pending';
    if (doneSet.has(id)) status = 'satisfied';
    else if (!batchSet.has(id) && !doneSet.has(id)) {
      // Check if all deps are satisfied
      const allDepsMet = (n.deps ?? []).every((d: string) => doneSet.has(d));
      status = allDepsMet ? 'pending' : 'blocked';
    }

    dagNodes.push({
      id,
      desc: n.desc ?? '',
      mode: n.mode ?? 'execute',
      produces: n.produces ?? [],
      consumes: n.consumes ?? [],
      deps: n.deps ?? [],
      status,
      validate: n.validate ?? [],
    });

    for (const dep of n.deps ?? []) {
      dagEdges.push({ from: dep, to: id, kind: 'dep' });
    }
  }

  // Toposort from parallelOrder
  const batches = parallelOrder(dag);
  const toposort = batches.flat();

  // Blocked: nodes with unsatisfied deps
  const blocked: OrientBlockedNode[] = dagNodes
    .filter(n => n.status === 'blocked')
    .map(n => ({
      id: n.id,
      missing: n.deps.filter(d => !doneSet.has(d)),
      reason: `waiting on: ${n.deps.filter(d => !doneSet.has(d)).join(', ')}`,
    }));

  // Executable: pending nodes whose deps are all satisfied (current batch + ready)
  const executable = dagNodes
    .filter(n => n.status === 'pending' || batchSet.has(n.id))
    .filter(n => n.status !== 'blocked')
    .map(n => n.id);

  return {
    id: dag.id,
    desc: dag.desc,
    node_count: dagNodes.length,
    nodes: dagNodes,
    edges: dagEdges,
    toposort,
    blocked,
    executable,
  };
}

async function cmdAdvance(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo' });
    return;
  }

  if (!args.includes('--skip-plan-gate')) {
    const { requirePlanGate } = await import('../src/lib/recipes/plan/plan-gate.ts');
    const gate = requirePlanGate(repoRoot);
    if (!gate.ok) { json({ error: gate.reason, fix: gate.fix }); process.exit(1); }
  }

  const { advanceBatch, validateBatch } = await import('../src/protocol.ts');
  const dag = loadDAG();
  const predicate = fileExists(repoRoot);
  const structuralOnly = args.includes('--structural-only');
  const allowConflicts = args.includes('--allow-conflicts');

  try {
    // Get current position (receipt-authoritative)
    const current = orientWithState(dag);

    // Validate batch is complete (artifact existence)
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

    // FR-GOV-004: enforce batchConflicts on next batch before advancing
    const next = await advanceBatch(dag, loadStore(), retiredSet());

    const nextConflicts = batchConflicts(dag).filter(c => c.level === next.level);
    if (nextConflicts.length > 0 && !allowConflicts) {
      json({
        error: 'Next batch has produce conflicts — parallel execution unsafe',
        nextBatch: next.position,
        nextLevel: next.level,
        conflicts: nextConflicts.map(c => ({ type: c.type, file: c.file, nodes: c.writers })),
        fix: 'Resolve conflicts (split nodes or serialize) then retry. Use --allow-conflicts to override (receipted).',
      });
      return;
    }
    if (nextConflicts.length > 0 && allowConflicts) {
      writeConflictOverrideReceipt(nextConflicts, next.level, 'advance');
    }

    // Run validate[] rules on every node in the batch (default: strict).
    // --structural-only skips quality gates (artifact-existence only).
    if (!structuralOnly) {
      const batchResult = await validateBatch(dag, current.position, predicate);
      if (!batchResult.passed) {
        const failures = batchResult.results
          .filter((r: any) => !r.passed)
          .map((r: any) => ({
            node: r.nodeId,
            failedRules: r.checks
              .filter((c: any) => !c.passed)
              .map((c: any) => ({ type: c.rule.type, evidence: c.evidence })),
          }));
        json({
          error: 'Batch validation failed — quality gates block advancement',
          currentBatch: current.position,
          summary: batchResult.summary,
          failures,
          fix: 'Fix failing validations, then retry. Use --structural-only to bypass quality gates.',
        });
        return;
      }
    }

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
      validated: !structuralOnly,
      ...(nextConflicts.length > 0 ? { conflictsOverridden: nextConflicts.length } : {}),
    });
  } catch (e: any) {
    json({ error: e.message || 'Failed to advance batch' });
  }
}

function cmdDescribe(note: string) {
  const dag = loadDAG();
  const pos = orientWithState(dag);
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
  const pos = orientWithState(dag);

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

async function cmdVerify(note: string) {
  const { runVerify } = await import('../src/lib/verify.ts');
  const result = runVerify(repoRoot);

  if (hasLocalDAG) {
    const dag = loadDAG();
    const pos = orientWithState(dag);
    recordTrail({
      ts: new Date().toISOString(), cmd: 'verify', note,
      repo: basename(repoRoot),
      position: pos.position, level: pos.level, dagId: dag.id,
    });
  } else {
    recordTrail({
      ts: new Date().toISOString(), cmd: 'verify', note,
      repo: basename(repoRoot),
      position: 'untracked', level: 0,
    });
  }

  json(result);

  if (result.violations.length > 0) process.exit(1);
}

async function cmdCheck(note: string) {
  const idIdx = args.indexOf('--id');
  const checkId = idIdx !== -1 ? args[idIdx + 1] : 'roadmap.verify';

  const { runVerify } = await import('../src/lib/verify.ts');
  const result = runVerify(repoRoot);

  let commitSha: string | undefined;
  let treeSha: string | undefined;
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    treeSha = execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { /* not a git repo */ }

  // Collect artifact paths from .roadmap/artifacts/
  const artifactsDir = join(repoRoot, '.roadmap', 'artifacts');
  let artifacts: string[] = [];
  if (existsSync(artifactsDir)) {
    try {
      const nodes = readdirSync(artifactsDir);
      for (const node of nodes) {
        const nodeDir = join(artifactsDir, node);
        const runs = readdirSync(nodeDir);
        for (const run of runs) {
          const runDir = join(nodeDir, run);
          const files = readdirSync(runDir);
          artifacts.push(...files.map(f => join('.roadmap', 'artifacts', node, run, f)));
        }
      }
    } catch { /* ignore */ }
  }

  if (hasLocalDAG) {
    const dag = loadDAG();
    const pos = orientWithState(dag);
    recordTrail({
      ts: new Date().toISOString(), cmd: 'check', note,
      repo: basename(repoRoot),
      position: pos.position, level: pos.level, dagId: dag.id,
      detail: { checkId },
    });
  }

  json({
    checkId,
    commitSha,
    treeSha,
    violations: result.violations,
    warnings: result.warnings,
    artifacts,
    passed: result.violations.length === 0,
  });

  if (result.violations.length > 0) process.exit(1);
}

async function cmdExpand(note: string) {
  if (!args.includes('--skip-plan-gate')) {
    const { requirePlanGate } = await import('../src/lib/recipes/plan/plan-gate.ts');
    const gate = requirePlanGate(repoRoot);
    if (!gate.ok) { json({ error: gate.reason, fix: gate.fix }); process.exit(1); }
  }

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

  // Block if candidate already exists
  if (candidateExists(repoRoot)) {
    json({ error: 'Candidate already exists', fix: 'roadmap dag accept or roadmap dag reject first' });
    process.exit(1);
    return;
  }

  // Snapshot head.json content before expansion script mutates it
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const headSnapshot = readFileSync(headPath, 'utf-8');
  const dagBefore = JSON.parse(headSnapshot) as Graph<string>;
  const idsBefore = new Set(Object.keys(dagBefore.nodes));
  const nodesBefore = idsBefore.size;

  // Set expansion type as env var so scripts can branch on it
  const candidatePath = join(repoRoot, '.roadmap', 'head.candidate.json');
  execSync(`node --experimental-strip-types ${resolved}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ROADMAP_EXPANSION_TYPE: expansionType, ROADMAP_CANDIDATE_PATH: candidatePath },
  });

  // Read the modified DAG from head.json (script wrote there)
  const dagAfter = loadDAG();
  const idsAfter = Object.keys(dagAfter.nodes);
  const nodesAfter = idsAfter.length;
  const addedIds = idsAfter.filter(id => !idsBefore.has(id));
  const added = addedIds.length;

  // Restore head.json to its original content
  writeFileSync(headPath, headSnapshot);

  // Validate the expanded DAG
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

  // FR-GOV-004: enforce batchConflicts on expanded DAG
  const allowConflicts = args.includes('--allow-conflicts');
  const expandConflicts = batchConflicts(dagAfter);
  if (expandConflicts.length > 0 && !allowConflicts) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Resolve conflicts (split nodes or serialize) then re-run. Use --allow-conflicts to override (receipted).',
      conflicts: expandConflicts.map(c => ({ type: c.type, file: c.file, nodes: c.writers, level: c.level })),
    }, `Expansion introduces ${expandConflicts.length} batch conflict(s) — parallel execution unsafe`);
  }
  if (expandConflicts.length > 0 && allowConflicts) {
    writeConflictOverrideReceipt(expandConflicts, -1, 'expand');
  }

  // Write candidate DAG instead of directly mutating head.json
  writeCandidateDAG(repoRoot, dagAfter, 'expand', scriptPath);

  const posAfter = orient(dagBefore, loadStore(), retiredSet());
  recordTrail({ ts: new Date().toISOString(), cmd: 'expand', note, repo: basename(repoRoot), position: posAfter.position, level: posAfter.level, dagId: dagAfter.id, detail: { script: scriptPath, added, type: expansionType, candidate: true } });

  json({
    expanded: true,
    candidate: true,
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
    fix: 'Review with: roadmap dag diff, then: roadmap dag accept --note "..."',
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
  const posBranch = orient(dagAfterBranch, loadStore(), retiredSet());
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
  const pos = orientWithState(dag);

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
  const completion = loadStore();
  const pos = await crossOrientWithState(dag);
  const batches = parallelOrder(dag);
  const claimStore = loadClaims(repoRoot);
  const now = new Date();
  const nodeIds = Object.keys(dag.nodes);
  const doneSet = new Set(pos.done);
  const preGateSet = new Set(pos.preGate);
  const retired = retiredSet();
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
        const sibPos = orient(sibDag, CompletionStore.loadOrEmpty(sib.path));
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
  console.log(`  [✅ done]  [⏭️ skip]  [🟦 plan]  [❌ fail]  [⏳ pending]  [👉 current]  [🔍 pre-gate]`);
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
      const cpTag = cpSet.has(n) ? '⚡' : '';
      // Retired/done are terminal states — check before position
      if (retired.has(n)) return `⏭️ ${n}`;
      if (doneSet.has(n)) return `✅ ${cpTag}${n}`;
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
        return `👉 ${cpTag}${n}${claimTag}`;
      }
      if (completion.hasFailing(n)) return `❌ ${cpTag}${n}`;
      if (preGateSet.has(n)) return `🔍 ${cpTag}${n}`;
      if (node?.mode === 'plan') return `🟦 ${cpTag}${n}`;
      return `⏳ ${cpTag}${n}`;
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

  // When --json requested, also emit structured envelope with chart RenderModel
  if (_outputOpts.format === 'json') {
    const chartLayers: DagLayer[] = batches.map((batch, i) => ({
      level: i,
      nodes: batch.map((id): DagNode => {
        const status: DagNode['status'] = retired.has(id) ? 'retired'
          : doneSet.has(id) ? 'done'
          : pos.position.includes(id) ? 'current'
          : completion.hasFailing(id) ? 'fail'
          : 'pending';
        const node = dag.nodes[id as keyof typeof dag.nodes] as any;
        return { id, status, desc: node?.desc };
      }),
    }));
    const chartRenderModel: RenderModel = {
      kind: 'chart',
      title: `chart: ${dag.id}`,
      nodes: [
        { t: 'h1', s: `${dag.id} \u2014 ${dag.desc}` },
        { t: 'bar', label: 'progress', cur: doneCount, total: totalNodes },
        { t: 'kv', key: 'position', value: pos.position.join(', ') || '(complete)' },
        { t: 'line' },
        { t: 'dagLayers', layers: chartLayers },
      ],
    };
    const chartData = { dagId: dag.id, done: doneCount, total: totalNodes, pct, position: pos.position, level: pos.level };
    json(chartData, chartRenderModel);
  }
}

function cmdDoctor() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const subcommand = args[1];
  if (subcommand !== 'completion') {
    json({ error: 'Unknown doctor subcommand', fix: 'roadmap doctor completion' });
    process.exit(1);
  }

  const dag = loadDAG();
  const completion = loadStore();
  const retired = retiredSet();
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const storeIds = completion.allIds();
  const passingIds = completion.passingIds();
  const failingIds = completion.failingIds();

  // Stale completions: in store but not in DAG
  const stale = [...storeIds].filter(id => !dagNodeIds.has(id));

  // Missing: in DAG but no receipt (not retired)
  const pending: string[] = [];
  const planNodes: string[] = [];
  const skippedNodes = [...retired].filter(id => dagNodeIds.has(id));

  for (const id of dagNodeIds) {
    const node = (dag.nodes as Record<string, any>)[id];
    if (retired.has(id)) continue;
    if (node?.mode === 'plan') {
      planNodes.push(id);
      if (!completion.hasRecord(id)) pending.push(id);
      continue;
    }
    if (!completion.hasRecord(id)) pending.push(id);
  }

  const report = {
    nodeCount: dagNodeIds.size,
    completedCount: passingIds.size,
    failedCount: failingIds.size,
    pendingCount: pending.length,
    staleCount: stale.length,
    planCount: planNodes.length,
    skippedCount: skippedNodes.length,
    stale,
    pending,
    failed: [...failingIds],
    plan: planNodes,
    skipped: skippedNodes,
  };

  // Determine exit code
  let exitCode = 0;
  const issues: string[] = [];

  // Stale retired: retired IDs not in current DAG
  const staleRetired = [...retired].filter(id => !dagNodeIds.has(id));

  if (stale.length > 0) {
    issues.push(`${stale.length} stale completion(s) — node IDs not in head.json: ${stale.join(', ')}`);
    exitCode = 1;
  }
  if (staleRetired.length > 0) {
    issues.push(`${staleRetired.length} stale retired entry/entries — not in head.json: ${staleRetired.join(', ')}`);
  }
  if (failingIds.size > 0) {
    issues.push(`${failingIds.size} node(s) with failing receipts: ${[...failingIds].join(', ')}`);
    exitCode = 1;
  }

  if (args.includes('--json')) {
    json({ ...report, issues, ok: exitCode === 0 });
    if (exitCode) process.exit(exitCode);
    return;
  }

  console.log(`\n  Completion diagnostics for ${dag.id}:\n`);
  console.log(`  Nodes:     ${dagNodeIds.size}`);
  console.log(`  Completed: ${passingIds.size}`);
  console.log(`  Failed:    ${failingIds.size}`);
  console.log(`  Pending:   ${pending.length}`);
  console.log(`  Plan:      ${planNodes.length}`);
  console.log(`  Skipped:   ${skippedNodes.length}`);
  console.log(`  Stale:     ${stale.length}`);

  if (issues.length > 0) {
    console.log('\n  Issues:');
    for (const issue of issues) console.log(`    ⚠️  ${issue}`);
  } else {
    console.log('\n  ✅ No issues found.');
  }
  console.log('');

  if (exitCode) process.exit(exitCode);
}

function cmdRemaining() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const includeNonExec = args.includes('--include-nonexec');
  const dag = loadDAG();
  const completion = loadStore();
  const retired = retiredSet();
  const pos = orientWithState(dag);
  const allNodes = Object.keys(dag.nodes) as string[];
  const doneSet = new Set(pos.done);

  // Remaining = not done, not retired, topo ordered (from orient.remaining + batchRemaining)
  const remaining = [...pos.batchRemaining, ...pos.remaining];

  const results: { id: string; mode: string; blockedBy: string; state: string }[] = [];

  for (const id of remaining) {
    if (retired.has(id)) continue;
    const node = (dag.nodes as Record<string, any>)[id];
    if (!node) continue;

    const mode = node.mode ?? 'execute';
    if (!includeNonExec && mode === 'plan') continue;

    // Determine blocking deps
    const deps: string[] = node.deps ?? [];
    const blockers = deps.filter((d: string) => !doneSet.has(d) && !retired.has(d));
    const blockedBy = blockers.length > 0
      ? blockers.join(', ')
      : 'unblocked';

    const state = completion.hasFailing(id) ? 'failed' : 'pending';

    results.push({ id, mode, blockedBy, state });
  }

  if (args.includes('--json')) {
    json({ remaining: results, count: results.length });
    return;
  }

  if (results.length === 0) {
    console.log('No remaining nodes.');
    return;
  }

  console.log(`\n  ${results.length} remaining node(s):\n`);
  for (const r of results) {
    const stateTag = r.state === 'failed' ? '❌' : '⏳';
    const modeTag = r.mode === 'plan' ? ' [plan]' : '';
    console.log(`  ${stateTag} ${r.id}${modeTag}  ← ${r.blockedBy}`);
  }
  console.log('');
}

function cmdStatus() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const dag = loadDAG();
  const completion = loadStore();
  const retired = retiredSet();
  const dagNodeIds = new Set(Object.keys(dag.nodes));

  const passingIds = completion.passingIds();
  const failingIds = completion.failingIds();
  const skippedNodes = [...retired].filter(id => dagNodeIds.has(id));

  let pendingCount = 0;
  let plannedCount = 0;

  for (const id of dagNodeIds) {
    if (retired.has(id)) continue;
    if (passingIds.has(id)) continue;
    const node = (dag.nodes as Record<string, any>)[id];
    if (node?.mode === 'plan') {
      plannedCount++;
      if (!completion.hasRecord(id)) pendingCount++;
      continue;
    }
    if (!completion.hasRecord(id)) pendingCount++;
  }

  const status = {
    dagId: dag.id,
    total: dagNodeIds.size,
    done: passingIds.size,
    pending: pendingCount,
    failed: failingIds.size,
    skipped: skippedNodes.length,
    planned: plannedCount,
  };

  json(status);
}

function cmdExplain() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeIdx = args.indexOf('--node');
  const nodeId = nodeIdx !== -1 ? args[nodeIdx + 1] : args[1];
  if (!nodeId) {
    json({ error: 'Missing node ID', fix: 'roadmap explain --node <id>' });
    process.exit(1);
  }

  const dag = loadDAG();
  const node = (dag.nodes as Record<string, any>)[nodeId];
  if (!node) {
    json({ error: `Node "${nodeId}" not found` });
    process.exit(1);
  }

  const completion = loadStore();
  const record = completion.record(nodeId);
  const produces = (node.produces ?? []) as string[];

  // Check file existence for each produces artifact
  const produceStatus = produces.map((p: string) => ({
    path: p,
    exists: existsSync(join(repoRoot, p)),
  }));

  // Receipt and validator info
  const hasReceipt = completion.hasRecord(nodeId);
  const isPassing = completion.hasPassing(nodeId);
  const isFailing = completion.hasFailing(nodeId);

  // Failing validators
  const failingChecks = (record?.validationChecks ?? []).filter(c => !c.passed);

  // Fix suggestions
  const fixes: string[] = [];
  if (!hasReceipt) fixes.push(`Run: roadmap complete ${nodeId} --note "reason"`);
  if (isFailing) fixes.push('Fix failing validators and re-complete');
  for (const p of produceStatus) {
    if (!p.exists) fixes.push(`Missing artifact: ${p.path}`);
  }

  json({
    nodeId,
    desc: node.desc,
    mode: node.mode ?? 'execute',
    produces: produceStatus,
    receipt: hasReceipt ? {
      present: true,
      passing: isPassing,
      failing: isFailing,
      completedAt: record?.completedAt,
      owner: record?.owner,
      gitSha: record?.gitSha,
    } : { present: false },
    failingValidators: failingChecks,
    fixes,
  });
}

function cmdReceipts() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeIdx = args.indexOf('--node');
  const filterNode = nodeIdx !== -1 ? args[nodeIdx + 1] : undefined;

  const completion = loadStore();
  const dag = loadDAG();
  const allNodes = Object.keys(dag.nodes);

  const receipts: any[] = [];
  for (const id of allNodes) {
    if (filterNode && id !== filterNode) continue;
    const record = completion.record(id);
    if (!record) continue;
    receipts.push({
      nodeId: id,
      completedAt: record.completedAt,
      owner: record.owner,
      passing: completion.hasPassing(id),
      checks: (record.validationChecks ?? []).length,
      gitSha: record.gitSha,
    });
  }

  json({ receipts, count: receipts.length });
}

function cmdCompletion() {
  const sub = args[1];

  if (sub === 'doctor') return cmdCompletionDoctor();
  if (sub === 'compact') return cmdCompletionCompact();
  if (sub === 'ls') return cmdReceiptsLs();

  json({ error: 'Unknown completion subcommand', fix: 'roadmap completion doctor | completion compact [--dry-run] | completion ls --node <id>' });
  process.exit(1);
}

function cmdReceiptsLs() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeIdx = args.indexOf('--node');
  if (nodeIdx === -1 || !args[nodeIdx + 1]) {
    json({ error: 'Missing --node <id>', fix: 'roadmap completion ls --node <nodeId>' });
    process.exit(1);
  }

  const nodeId = args[nodeIdx + 1];
  const receipts = listNodeReceipts(repoRoot, nodeId);
  json({ nodeId, receipts, count: receipts.length });
}

function cmdCompletionDoctor() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const result = completionDoctor(repoRoot);
  json(result);
  if (!result.ok) process.exit(1);
}

function cmdCompletionCompact() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const result = completionCompact(repoRoot, { dryRun });
  json(result);
}

function cmdArtifacts() {
  const nodeIdx = args.indexOf('--node');
  const filterNode = nodeIdx !== -1 ? args[nodeIdx + 1] : undefined;

  const artifactsDir = join(repoRoot, '.roadmap', 'artifacts');
  if (!existsSync(artifactsDir)) {
    json({ artifacts: [], count: 0 });
    return;
  }

  const artifacts: { nodeId: string; runId: string; files: string[] }[] = [];
  try {
    const nodes = readdirSync(artifactsDir);
    for (const node of nodes) {
      if (filterNode && node !== filterNode) continue;
      const nodeDir = join(artifactsDir, node);
      const runs = readdirSync(nodeDir);
      for (const run of runs) {
        const runDir = join(nodeDir, run);
        const files = readdirSync(runDir);
        artifacts.push({
          nodeId: node,
          runId: run,
          files: files.map(f => join('.roadmap', 'artifacts', node, run, f)),
        });
      }
    }
  } catch { /* ignore */ }

  json({ artifacts, count: artifacts.length });
}

// gallery explain <candidateId> — reads .roadmap/receipts/candidate-<candidateId>.json
function cmdGallery() {
  const sub = args[1];
  if (sub === 'explain') {
    const candidateId = args[2];
    if (!candidateId) {
      json({ error: 'Missing candidateId', fix: 'roadmap gallery explain <candidateId>' });
      process.exit(1);
    }
    const receiptPath = join(repoRoot, '.roadmap', 'receipts', `candidate-${candidateId}.json`);
    if (!existsSync(receiptPath)) {
      json({ error: `No receipt found for candidate '${candidateId}'`, path: receiptPath });
      process.exit(1);
    }
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));
    json(receipt);
    return;
  }
  json({ error: 'Unknown gallery subcommand', fix: 'roadmap gallery explain <candidateId>' });
  process.exit(1);
}

// blend explain <blendId> — reads blend ledger and finds the entry matching blendId
function cmdBlend() {
  const sub = args[1];
  if (sub === 'explain') {
    const blendId = args[2];
    if (!blendId) {
      json({ error: 'Missing blendId', fix: 'roadmap blend explain <blendId>' });
      process.exit(1);
    }
    const ledgerPath = join(repoRoot, '.roadmap', 'blend-ledger.jsonl');
    if (!existsSync(ledgerPath)) {
      json({ error: 'No blend ledger found', path: ledgerPath });
      process.exit(1);
    }
    const entries = readFileSync(ledgerPath, 'utf-8')
      .trim().split('\n').filter(Boolean)
      .map((line: string) => JSON.parse(line));
    const entry = entries.find((e: { blendId: string }) => e.blendId === blendId);
    if (!entry) {
      json({ error: `No blend receipt found for blendId '${blendId}'` });
      process.exit(1);
    }
    json({ blendId: entry.blendId, guardResults: entry.guardResults, statementOwnership: entry.statementOwnership, checkSet: entry.checkSet });
    return;
  }
  json({ error: 'Unknown blend subcommand', fix: 'roadmap blend explain <blendId>' });
  process.exit(1);
}

function cmdContract(note: string) {
  const sub = args[1];
  if (sub !== 'test') {
    json({ error: 'Unknown contract subcommand', fix: 'roadmap contract test --note "reason"' });
    process.exit(1);
  }

  // Contract test: verify JSON envelope + error code + stderr discipline
  const issues: string[] = [];

  // 1. Check kernel.json exists
  const kernelPath = join(repoRoot, '.roadmap', 'kernel.json');
  if (!existsSync(kernelPath)) {
    issues.push('Missing .roadmap/kernel.json — governance kernel not defined');
  } else {
    try {
      const kernel = JSON.parse(readFileSync(kernelPath, 'utf-8'));
      if (!kernel.schemaVersion || !Array.isArray(kernel.policies)) {
        issues.push('kernel.json malformed — needs schemaVersion and policies array');
      }
    } catch {
      issues.push('kernel.json parse error');
    }
  }

  // 2. Check that CLI uses emit() for all output (envelope discipline)
  const cliPath = join(repoRoot, 'bin', 'roadmap.ts');
  if (existsSync(cliPath)) {
    const cliSource = readFileSync(cliPath, 'utf-8');
    const rawConsoleLines = cliSource.split('\n').filter(l =>
      l.includes('console.log(') && !l.trim().startsWith('//') && !l.includes('cmdHelp')
    );
    // Informational — not a violation. Legacy human-format commands use console.log legitimately.
    if (rawConsoleLines.length > 200) {
      issues.push(`${rawConsoleLines.length} raw console.log calls — excessive, migrate to emit()`);
    }
  }

  // 3. Check ErrorCode enum has standard codes
  const requiredCodes = ['VALIDATION_FAILED', 'NODE_NOT_FOUND', 'INTERNAL_ERROR'];
  for (const code of requiredCodes) {
    if (!(code in ErrorCode)) {
      issues.push(`Missing error code: ${code}`);
    }
  }

  if (hasLocalDAG) {
    const dag = loadDAG();
    const pos = orientWithState(dag);
    recordTrail({
      ts: new Date().toISOString(), cmd: 'contract', note,
      repo: basename(repoRoot),
      position: pos.position, level: pos.level, dagId: dag.id,
      detail: { sub: 'test', issues: issues.length },
    });
  }

  json({
    passed: issues.length === 0,
    issues,
    checked: ['kernel.json', 'envelope-discipline', 'error-codes'],
  });

  if (issues.length > 0) process.exit(1);
}


function cmdPatch(note: string) {
  if (args[1] !== 'stack') {
    json({ error: 'Unknown patch subcommand', fix: 'roadmap patch stack --nodes <id1,id2,...> --base <sha> --note "..."' });
    process.exit(1);
    return;
  }
  const nodesIdx = args.indexOf('--nodes');
  const baseIdx = args.indexOf('--base');
  if (nodesIdx === -1 || baseIdx === -1) {
    json({ error: 'Missing required flags', fix: 'roadmap patch stack --nodes <id1,id2,...> --base <sha> --note "..."' });
    process.exit(1);
    return;
  }
  const nodeIds = (args[nodesIdx + 1] ?? '').split(',').filter(Boolean);
  const baseSha = args[baseIdx + 1] ?? '';
  if (!nodeIds.length || !baseSha) {
    json({ error: 'Empty --nodes or --base', fix: 'Provide comma-separated node IDs and a valid base SHA' });
    process.exit(1);
    return;
  }
  const record = runPatchStack({ nodeIds, baseSha, repoRoot });
  recordTrail({ ts: new Date().toISOString(), cmd: 'patch', note, position: '', level: 0 });
  json(record);
}
function cmdEnvAudit() {
  const result = runEnvAudit(repoRoot);
  json(result);
  if (!result.pass) process.exit(1);
}

function cmdProfile(note: string) {
  const nodeId = args.includes("--node") ? args[args.indexOf("--node") + 1] : undefined;
  const lastNArg = args.includes("--last-n") ? args[args.indexOf("--last-n") + 1] : undefined;
  const lastN = lastNArg ? parseInt(lastNArg, 10) : undefined;

  const report = runProfile({ repoRoot, nodeId, lastN });

  // Human-readable table to stderr
  console.error("session                          | cmds | validators | avg ms | bypasses | retries");
  console.error("-".repeat(85));
  for (const p of Object.values(report.nodeProfiles)) {
    const id = p.nodeId.length > 32 ? p.nodeId.slice(0, 29) + "..." : p.nodeId.padEnd(32);
    console.error(
      `${id} | ${String(p.commandCount).padStart(4)} | ${String(p.validatorRuns).padStart(10)} | ${String(p.avgLatencyMs).padStart(6)} | ${String(p.bypassCount).padStart(8)} | ${String(p.retryCount).padStart(7)}`
    );
  }

  recordTrail({ command: "profile", note, position: [], level: -1 });
  json(report);
}


async function cmdStrategy(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'propose': {
      const { proposeCandidates } = await import('../src/lib/strategy/select.ts');
      const { renderCandidates } = await import('../src/lib/render/strategy.ts');
      const candidates = proposeCandidates();
      const rendered = renderCandidates(candidates);
      recordTrail({ ts: new Date().toISOString(), cmd: 'strategy propose', note, repo: basename(repoRoot) });
      process.stdout.write(rendered + '\n');
      json({ candidates: candidates.map(c => ({ id: c.id, name: c.name, rounds: c.rounds, gateMode: c.gateMode, risk: c.estimatedRisk })) });
      return;
    }
    case 'select': {
      const strategyId = args[2];
      if (!strategyId) {
        json({ error: 'Missing strategy ID', fix: 'roadmap strategy select <id> --note "reason"' });
        process.exit(1);
      }
      const runId = args.includes('--run') ? args[args.indexOf('--run') + 1] : `run-${Date.now()}`;
      const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
      const treeSha = execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf8' }).trim();
      const { selectStrategy } = await import('../src/lib/strategy/select.ts');
      const { renderReceipt } = await import('../src/lib/render/strategy.ts');
      const result = selectStrategy(repoRoot, strategyId, { runId, headSha, treeSha, selectionMethod: 'manual' });
      const rendered = renderReceipt(result.receipt);
      recordTrail({ ts: new Date().toISOString(), cmd: 'strategy select', note, repo: basename(repoRoot), detail: { strategyId, runId } });
      process.stdout.write(rendered + '\n');
      json({ selected: result.receipt, receiptPath: result.receiptPath });
      return;
    }
    case 'auto': {
      const maxPar = args.includes('--max-parallelism') ? parseInt(args[args.indexOf('--max-parallelism') + 1] ?? '1', 10) : 1;
      const runId = args.includes('--run') ? args[args.indexOf('--run') + 1] : `run-${Date.now()}`;
      const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
      const treeSha = execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf8' }).trim();
      const { autoSelect } = await import('../src/lib/strategy/select.ts');
      const { renderReceipt } = await import('../src/lib/render/strategy.ts');
      const result = autoSelect(repoRoot, { runId, headSha, treeSha, maxParallelism: maxPar });
      const rendered = renderReceipt(result.receipt);
      recordTrail({ ts: new Date().toISOString(), cmd: 'strategy auto', note, repo: basename(repoRoot), detail: { strategyId: result.receipt.strategyId, maxPar, runId } });
      process.stdout.write(rendered + '\n');
      json({ selected: result.receipt, receiptPath: result.receiptPath });
      return;
    }
    case 'status': {
      const { readActiveStrategy, isLatched, readActiveLatch } = await import('../src/lib/strategy/active.ts');
      const { renderActive } = await import('../src/lib/render/strategy.ts');
      const active = readActiveStrategy(repoRoot);
      const latched = isLatched(repoRoot);
      const latch = readActiveLatch(repoRoot);
      if (active) {
        process.stdout.write(renderActive(active) + '\n');
      }
      json({ latched, latch, active: active ?? null });
      return;
    }
    case 'clear': {
      const { clearStrategy } = await import('../src/lib/strategy/select.ts');
      const { clearLatch } = await import('../src/lib/strategy/active.ts');
      clearStrategy(repoRoot);
      clearLatch(repoRoot);
      recordTrail({ ts: new Date().toISOString(), cmd: 'strategy clear', note, repo: basename(repoRoot) });
      json({ cleared: true });
      return;
    }
    default:
      json({ error: `Unknown strategy subcommand: ${sub}`, fix: 'roadmap strategy propose|select|auto|status|clear --note "reason"' });
      process.exit(1);
  }
}


function cmdAudit(note: string) {
  const sub = args[1];
  if (sub === 'ingest') {
    const transcriptPath = args[2];
    if (!transcriptPath) {
      json({ error: 'Missing transcript path', fix: 'roadmap audit ingest <path> [--dag-id <id>]' });
      process.exit(1);
    }
    const dagIdIdx = args.indexOf('--dag-id');
    const dagId = dagIdIdx !== -1 ? args[dagIdIdx + 1] : undefined;
    const session = runAuditIngest({ transcriptPath: resolve(transcriptPath), dagId, repoRoot });
    recordTrail({ ts: new Date().toISOString(), cmd: 'audit ingest', note, repo: basename(repoRoot), detail: { sessionId: session.sessionId, toolCalls: session.toolCalls.length } });
    json(session);
    return;
  }
  if (sub === 'recommend') {
    const sessionIdx = args.indexOf('--session');
    const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : undefined;
    const result = runAuditRecommend({ sessionId, repoRoot });
    recordTrail({ ts: new Date().toISOString(), cmd: 'audit recommend', note, repo: basename(repoRoot), detail: { sessionId: result.sessionId, recommendations: result.recommendations.length, frictionScore: result.frictionScore } });
    json(result);
    return;
  }
  json({ error: `Unknown audit subcommand: ${sub}`, fix: 'roadmap audit ingest <path> | audit recommend' });
  process.exit(1);
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
  const pos = orientWithState(dag);
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
      status: retiredSet().has(id) ? 'retired' : doneSet.has(id) ? 'done' : pos.batchRemaining.includes(id) ? 'in-progress' : 'pending',
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
  const pos = orientWithState(dag);

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

  // Strategy gate: block complete when latched without active strategy
  const { checkStrategyGate } = await import('../src/lib/strategy/exec-gate.ts');
  const stratGate = checkStrategyGate(repoRoot);
  if (stratGate.blocked) {
    process.stderr.write(JSON.stringify({ error: 'Strategy required', code: stratGate.code, fix: stratGate.fix }) + '\n');
    process.exit(4);
  }

  if (!args.includes('--skip-plan-gate')) {
    const { requirePlanGate } = await import('../src/lib/recipes/plan/plan-gate.ts');
    const gate = requirePlanGate(repoRoot);
    if (!gate.ok) { json({ error: gate.reason, fix: gate.fix }); process.exit(1); }
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
  const pos = orientWithState(dag);

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
      const { launchApp, runExploreScript, teardown: teardownApp } = await import('../src/lib/exploration/runtime.ts');
      exploreResults = [];

      for (const rule of exploreRules) {
        let handle: import('../src/lib/exploration/runtime.ts').LaunchHandle | undefined;
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

  // Evidence for receipt-based completion
  let evidenceChecks: EvidenceRecord[] = [];

  if (!skipValidate) {
    const { validateNode } = await import('../src/protocol.ts');
    const validationOpts: Record<string, any> = {};
    if (intentJudgments) validationOpts.intentJudgments = intentJudgments;
    if (exploreResults) validationOpts.exploreResults = exploreResults;
    const validationResult = await validateNode(dag, nodeId, fileExists(repoRoot),
      Object.keys(validationOpts).length > 0 ? validationOpts : undefined,
    );

    // Capture evidence for receipt
    evidenceChecks = validationResult.checks.map((c: any) => ({
      rule: c.rule?.type ?? 'unknown',
      passed: c.passed,
      evidence: c.evidence ?? '',
    }));

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
      // Auto-expand if expandOnFail: true, even without explicit judgment data
      const nodeSpec = (dag.nodes as Record<string, any>)[nodeId];
      const expandOnFailRules = ((nodeSpec?.validate ?? []) as any[]).filter((r: any) => r.type === 'intent' && r.expandOnFail === true);
      const shouldAutoExpand = expandOnFailRules.length > 0 && !intentJudgments;

      if (intentJudgments || shouldAutoExpand) {
        const { extractIntentFailures, generateIntentExpansion, detectStall, buildEscalation } = await import('../src/lib/intent/intent-expansion.ts');

        // If auto-expanding, synthesize minimum judgment data (confidence 0 = needs work)
        const judgmentsToUse = intentJudgments ?? expandOnFailRules.map(r => ({
          statement: r.statement,
          confidence: 0,
          reasoning: 'Auto-expanded due to expandOnFail: true',
          evidence: [],
        }));

        const intentFailures = extractIntentFailures(validationResult.checks, judgmentsToUse);

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
  } else {
    // --skip-validate: record non-passing receipt (quarantined completion)
    evidenceChecks = [{ rule: 'skip-validate', passed: false, evidence: 'validation skipped by --skip-validate flag' }];
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
  const posAfter = orientWithState(dag);

  // 4. Auto-advance if this agent completed the last node in the batch.
  // Suppress with --no-advance for orchestrators that want to gate manually.
  let advanced: { previousBatch: string[]; nextBatch: string[]; nextLevel: number } | undefined;
  const noAdvance = args.includes('--no-advance');
  if (posAfter.batchComplete && !noAdvance && !posAfter.complete) {
    try {
      const { advanceBatch } = await import('../src/protocol.ts');
      const next = await advanceBatch(dag, loadStore(), retiredSet());
      advanced = { previousBatch: posAfter.position, nextBatch: next.position, nextLevel: next.level };
    } catch {
      // advanceBatch failed (e.g. missing artifacts) — surface batchComplete without advancing
    }
  }

  const finalPos = advanced
    ? orientWithState(dag)
    : posAfter;

  // 5. Surface newly unblocked nodes — downstream nodes whose deps are now all satisfied.
  const nowReady = readyNodes(dag, loadStore(), retiredSet());
  const unblocked = nowReady.map(n => n.id);

  // Run shell validators through validator-runner for artifact capture
  const nodeValidators = ((dag.nodes as Record<string, any>)[nodeId]?.validate ?? []) as any[];
  const shellRules = nodeValidators.filter((r: any) => r.type === 'shell');
  let validatorResults: import('../src/lib/completion-store.ts').ValidatorResult[] | undefined;
  if (shellRules.length > 0 && !skipValidate) {
    const { runValidator } = await import('../src/lib/validator-runner.ts');
    validatorResults = [];
    for (const rule of shellRules) {
      const vr = await runValidator(nodeId, `shell:${rule.command}`, rule.command, repoRoot, { captureArtifacts: true });
      validatorResults.push({ id: vr.id, passed: vr.passed, exitCode: vr.exitCode, stdoutSha: vr.stdoutSha, stderrSha: vr.stderrSha, artifactPaths: vr.artifactPaths });
    }
  }

  // Save completion with evidence to persistent tracking (receipt-authoritative)
  saveCompletionWithEvidence(repoRoot, nodeId, evidenceChecks, owner, checkpoint.id, validatorResults);

  // Auto-commit completion state unless --no-commit
  let autoCommitResult: { committed: boolean; reason?: string; receipt?: any } | undefined;
  const noCommit = args.includes('--no-commit');
  if (noCommit) {
    const { writeAuditReceipt } = await import('../src/lib/metaflow/audit/receipt.ts');
    const receipt = writeAuditReceipt(
      `autocommit-${nodeId}`, 'unknown', [], { schema_version: 1, runId: `autocommit-${nodeId}`, treeSha: 'unknown', sessionIds: [], computedAt: new Date().toISOString(), passed: false, detectorResults: [] } as any, repoRoot,
    );
    autoCommitResult = { committed: false, reason: 'no-commit-flag', receipt };
  } else {
    const { autoCommitCompletion } = await import('../src/lib/completion/auto-commit.ts');
    autoCommitResult = autoCommitCompletion(nodeId, repoRoot);
  }

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
    ...(autoCommitResult ? { autoCommit: autoCommitResult } : {}),
  });
}

// Re-run validators on a completed node and write a structured receipt if they pass.
// Unlike complete: no claiming, no checkpoint, no batch restriction, no advancing.
async function cmdCertify(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const nodeId = args[1];
  if (!nodeId) {
    json({ error: 'Missing node ID', fix: 'roadmap certify <node-id> --note "reason"' });
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

  const pos = orientWithState(dag);

  const { validateNode } = await import('../src/protocol.ts');
  const validationResult = await validateNode(dag, nodeId, fileExists(repoRoot));

  const evidenceChecks: EvidenceRecord[] = validationResult.checks.map((c: any) => ({
    rule: c.rule?.type ?? 'unknown',
    passed: c.passed,
    evidence: c.evidence ?? '',
  }));

  recordTrail({
    ts: new Date().toISOString(), cmd: 'certify', note,
    repo: basename(repoRoot), position: pos.position, level: pos.level, dagId: dag.id,
    detail: { nodeId, certified: validationResult.passed },
  });

  if (!validationResult.passed) {
    json({
      certified: false,
      node: nodeId,
      checks: validationResult.checks,
      failedCount: validationResult.checks.filter((c: any) => !c.passed).length,
    });
    process.exit(1);
  }

  saveCompletionWithEvidence(repoRoot, nodeId, evidenceChecks, owner);

  json({
    certified: true,
    node: nodeId,
    owner,
    checks: evidenceChecks,
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

  const pos = orientWithState(dag);

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
    const pos = orientWithState(dag);
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

  const pos = orientWithState(dag);
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
  const pos = orientWithState(dag);
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

  // Issue a BoundToken of type 'claim' as well
  const tokId = deriveTokenId('claim', nodeId, claimedAt);
  let headSha = 'unknown';
  try { headSha = computeHeadSha(repoRoot) ?? 'unknown'; } catch {}
  const claimToken: BoundToken = {
    schema_version: 1,
    tokenId: tokId,
    type: 'claim',
    subject: nodeId,
    owner,
    issuedAt: claimedAt,
    expiresAt: claimExpiry,
    boundTo: { headSha },
    payload: { ttlSeconds },
    ok: true,
  };
  writeToken(repoRoot, claimToken);

  json({ claimed: nodeId, owner, claimedAt, claimExpiry, ttlSeconds, tokenId: tokId });
}

// --- dag: candidate operations (diff, accept, reject) ---

function cmdDag(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'diff':   return cmdDagDiff();
    case 'accept': return cmdDagAccept(note);
    case 'reject': return cmdDagReject(note);
    default:
      json({ error: `Unknown dag subcommand: ${sub}`, fix: 'roadmap dag diff|accept|reject' });
      process.exit(1);
  }
}

function cmdDagDiff() {
  const dag = loadDAG();
  const envelope = loadCandidate(repoRoot);
  if (!envelope) {
    json({ error: 'No candidate found', fix: 'Run roadmap import or roadmap expand first' });
    process.exit(1);
    return;
  }

  const liveIds = new Set(Object.keys(dag.nodes));
  const candidateIds = new Set(Object.keys(envelope.dag.nodes));

  const added = [...candidateIds].filter(id => !liveIds.has(id));
  const removed = [...liveIds].filter(id => !candidateIds.has(id));
  const changed = [...liveIds].filter(id =>
    candidateIds.has(id) && JSON.stringify(dag.nodes[id]) !== JSON.stringify(envelope.dag.nodes[id])
  );

  const headSha = computeHeadSha(repoRoot);
  const staleDrift = headSha !== envelope.baseSha;

  json({
    added,
    removed,
    changed,
    baseSha: envelope.baseSha,
    candidateSource: envelope.source,
    staleDrift,
  });
}

function cmdDagAccept(note: string) {
  const envelope = loadCandidate(repoRoot);
  if (!envelope) {
    json({ error: 'No candidate to accept', fix: 'Run roadmap import or roadmap expand first' });
    process.exit(1);
    return;
  }

  // Stale check
  const headSha = computeHeadSha(repoRoot);
  if (headSha !== envelope.baseSha) {
    json({ error: 'Candidate is stale', fix: 'roadmap dag diff to review, then reject and re-import' });
    process.exit(1);
    return;
  }

  // Validate candidate DAG
  try { define(envelope.dag); } catch (e: any) {
    json({ error: 'Candidate DAG failed define()', detail: e.message, fix: 'Reject candidate and fix source' });
    process.exit(1);
    return;
  }

  const verifyErrors = verify(envelope.dag);
  if (verifyErrors.length > 0) {
    json({ error: 'Candidate DAG failed verify()', errors: verifyErrors, fix: 'Reject candidate and fix source' });
    process.exit(1);
    return;
  }

  const checkResult = check(envelope.dag);
  if (!checkResult.done) {
    json({ error: 'Candidate DAG failed check()', orphans: checkResult.orphans, fix: 'Reject candidate and fix source' });
    process.exit(1);
    return;
  }

  // Compute diff for receipt
  const liveDag = loadDAG();
  const liveIds = new Set(Object.keys(liveDag.nodes));
  const candidateIds = new Set(Object.keys(envelope.dag.nodes));
  const nodesAdded = [...candidateIds].filter(id => !liveIds.has(id)).length;
  const nodesRemoved = [...liveIds].filter(id => !candidateIds.has(id)).length;

  // Promote: overwrite head.json
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  writeFileSync(headPath, JSON.stringify(envelope.dag, null, 2) + '\n');

  // Delete candidate
  const candidatePath = join(repoRoot, '.roadmap', 'head.candidate.json');
  unlinkSync(candidatePath);

  // Write acceptance receipt
  const acceptedAt = new Date().toISOString();
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  const receiptPath = join(receiptsDir, `dag-accept-${acceptedAt.replace(/[:.]/g, '-')}.json`);
  const receipt = { accepted: true, baseSha: envelope.baseSha, source: envelope.source, acceptedAt, nodesAdded, nodesRemoved, note };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  recordTrail({
    ts: acceptedAt, cmd: 'dag.accept', note,
    repo: basename(repoRoot),
    detail: { baseSha: envelope.baseSha, source: envelope.source, nodesAdded, nodesRemoved, receiptPath },
  });

  json({ accepted: true, baseSha: envelope.baseSha, source: envelope.source, nodesAdded, nodesRemoved, receiptPath });
}

function cmdDagReject(note: string) {
  const envelope = loadCandidate(repoRoot);
  if (!envelope) {
    json({ error: 'No candidate to reject' });
    process.exit(1);
    return;
  }

  // Delete candidate
  const candidatePath = join(repoRoot, '.roadmap', 'head.candidate.json');
  unlinkSync(candidatePath);

  // Write rejection receipt
  const rejectedAt = new Date().toISOString();
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  const receiptPath = join(receiptsDir, `dag-reject-${rejectedAt.replace(/[:.]/g, '-')}.json`);
  const receipt = { rejected: true, baseSha: envelope.baseSha, source: envelope.source, rejectedAt, note };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  recordTrail({
    ts: rejectedAt, cmd: 'dag.reject', note,
    repo: basename(repoRoot),
    detail: { baseSha: envelope.baseSha, source: envelope.source, receiptPath },
  });

  json({ rejected: true, baseSha: envelope.baseSha, source: envelope.source, receiptPath, headJsonUnchanged: true });
}

// --- token: issue, list, inspect, revoke, gc ---

async function cmdToken(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'issue':   return cmdTokenIssue(note);
    case 'list':    return cmdTokenList();
    case 'inspect': return cmdTokenInspect();
    case 'revoke':  return cmdTokenRevoke(note);
    case 'gc':      return cmdTokenGc();
    default:
      json({ error: `Unknown token subcommand: ${sub}`, fix: 'token issue|list|inspect|revoke|gc' });
      process.exit(1);
  }
}

function cmdTokenIssue(note: string) {
  const typeIdx = args.indexOf('--type');
  const type = (typeIdx !== -1 ? args[typeIdx + 1] : undefined) as TokenType | undefined;
  if (!type || !['claim', 'strategy', 'breakglass', 'run'].includes(type)) {
    json({ error: 'Missing or invalid --type', fix: 'roadmap token issue --type claim|strategy|breakglass|run --subject <s> --note "..."' });
    process.exit(1);
    return;
  }

  const subjectIdx = args.indexOf('--subject');
  const subject = subjectIdx !== -1 ? args[subjectIdx + 1] : undefined;
  if (!subject) {
    json({ error: 'Missing --subject', fix: 'roadmap token issue --type <type> --subject <subject> --note "..."' });
    process.exit(1);
    return;
  }

  const ownerIdx = args.indexOf('--owner');
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1] : (process.env['AGENT_ID'] ?? process.env['USER'] ?? 'unknown');

  const expiresIdx = args.indexOf('--expires');
  const expiresAt = expiresIdx !== -1 ? args[expiresIdx + 1] : undefined;

  const scopeIdx = args.indexOf('--scope');
  const scope = scopeIdx !== -1 && args[scopeIdx + 1] ? args[scopeIdx + 1].split(',') : undefined;

  const issuedAt = new Date().toISOString();
  const id = deriveTokenId(type, subject, issuedAt);

  let headSha = 'unknown';
  try { headSha = computeHeadSha(repoRoot) ?? 'unknown'; } catch {}

  const token: BoundToken = {
    schema_version: 1,
    tokenId: id,
    type,
    subject,
    owner,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
    boundTo: { headSha },
    ...(scope ? { scope } : {}),
    reason: note,
    payload: {},
    ok: true,
  };

  const path = writeToken(repoRoot, token);

  recordTrail({
    ts: issuedAt, cmd: 'token.issue', note,
    repo: basename(repoRoot),
    detail: { tokenId: id, type, subject, owner, path },
  });

  json({ issued: true, tokenId: id, type, subject, owner, path });
}

function cmdTokenList() {
  const typeIdx = args.indexOf('--type');
  const type = typeIdx !== -1 ? args[typeIdx + 1] as TokenType : undefined;

  const entries = readIndex(repoRoot);
  const filtered = type ? entries.filter(e => e.type === type) : entries;
  json({ tokens: filtered, count: filtered.length });
}

function cmdTokenInspect() {
  const id = args[2];
  if (!id) {
    json({ error: 'Missing token ID', fix: 'roadmap token inspect <tokenId>' });
    process.exit(1);
    return;
  }

  // Search across all types
  for (const t of ['claim', 'strategy', 'breakglass', 'run'] as TokenType[]) {
    const token = readToken(repoRoot, t, id);
    if (token) {
      json(token);
      return;
    }
  }

  json({ error: `Token not found: ${id}`, fix: 'roadmap token list to see available tokens' });
  process.exit(1);
}

function cmdTokenRevoke(note: string) {
  const id = args[2];
  const typeIdx = args.indexOf('--type');
  const type = typeIdx !== -1 ? args[typeIdx + 1] as TokenType : undefined;

  if (!id) {
    json({ error: 'Missing token ID', fix: 'roadmap token revoke <tokenId> --type <type> --note "..."' });
    process.exit(1);
    return;
  }

  // If type given, try that; otherwise search
  const types: TokenType[] = type ? [type] : ['claim', 'strategy', 'breakglass', 'run'];
  for (const t of types) {
    const token = readToken(repoRoot, t, id);
    if (token) {
      token.ok = false;
      const path = join(repoRoot, TOKEN_DIR, t, id + '.json');
      writeFileSync(path, JSON.stringify(token, null, 2) + '\n');

      recordTrail({
        ts: new Date().toISOString(), cmd: 'token.revoke', note,
        repo: basename(repoRoot),
        detail: { tokenId: id, type: t },
      });

      json({ revoked: true, tokenId: id, type: t });
      return;
    }
  }

  json({ error: `Token not found: ${id}`, fix: 'roadmap token list to see available tokens' });
  process.exit(1);
}

function cmdTokenGc() {
  const result = gcTokens(repoRoot);
  json({ pruned: result.deleted, remaining: result.kept, deletedIds: result.deletedIds });
}

// --- dispatch: plan, apply, status for cluster-based work distribution ---
async function cmdDispatch(note: string) {
  // Strategy gate: block dispatch when latched without active strategy
  const { checkStrategyGate } = await import('../src/lib/strategy/exec-gate.ts');
  const gate = checkStrategyGate(repoRoot);
  if (gate.blocked) {
    process.stderr.write(JSON.stringify({ error: 'Strategy required', code: gate.code, fix: gate.fix }) + '\n');
    process.exit(4);
  }
  const sub = args[1];
  switch (sub) {
    case 'plan': {
      const overlay = loadPlanOverlay(repoRoot);
      if (!overlay) {
        json({ error: 'No plan overlay found', fix: 'roadmap plan overlay --select <id> --note "..." first' });
        process.exit(1);
      }
      if (!isOverlayValid(repoRoot, overlay)) {
        json({ error: 'Plan overlay is stale', fix: 'Rebuild: roadmap plan overlay --select <id> --note "..."' });
        process.exit(1);
      }
      const workersIdx = args.indexOf('--workers');
      const workers = workersIdx !== -1 ? parseInt(args[workersIdx + 1] ?? '0', 10) : undefined;
      const plan = createDispatchPlan(repoRoot, overlay, workers ? { workers } : undefined);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'dispatch plan', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { planHash: plan.planHash.slice(0, 12), worktrees: plan.worktrees.length, workers: plan.workers },
      });
      json({ planned: true, planHash: plan.planHash.slice(0, 12), worktrees: plan.worktrees.length, workers: plan.workers, assignments: plan.worktrees.map(w => ({ id: w.id, cluster: w.clusterId, owner: w.owner, nodes: w.nodes.length })) });
      return;
    }
    case 'apply': {
      const plan = loadDispatchPlan(repoRoot);
      if (!plan) {
        json({ error: 'No dispatch plan found', fix: 'roadmap dispatch plan --note "..." first' });
        process.exit(1);
      }
      const result = applyDispatchPlan(repoRoot, plan);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'dispatch apply', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { planHash: result.planHash.slice(0, 12), worktrees: result.worktrees.length, receipt: result.receiptPath },
      });
      json({ applied: result.applied, planHash: result.planHash.slice(0, 12), worktrees: result.worktrees.length, receipt: result.receiptPath });
      return;
    }
    case 'status': {
      const status = dispatchStatus(repoRoot);
      json(status);
      return;
    }
    default:
      json({ error: `Unknown dispatch subcommand: ${sub}`, fix: 'roadmap dispatch plan|apply|status --note "..."' });
      process.exit(1);
  }
}

// --- intake: scan, import, certify from git diffs ---
function cmdIntake(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'scan': {
      const baseIdx = args.indexOf('--base');
      const baseSha = baseIdx !== -1 ? args[baseIdx + 1] : undefined;
      const result = scanIntake(repoRoot, baseSha ? { baseSha } : undefined);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'intake scan', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { baseSha: result.baseSha, headSha: result.headSha, candidates: result.candidates.length, changed: result.changedFiles.length, skipped: result.skipped.length },
      });
      json(result);
      return;
    }
    case 'import': {
      const baseIdx = args.indexOf('--base');
      const baseSha = baseIdx !== -1 ? args[baseIdx + 1] : undefined;
      const idIdx = args.indexOf('--id');
      const dagId = idIdx !== -1 ? args[idIdx + 1] : undefined;
      const scanResult = scanIntake(repoRoot, baseSha ? { baseSha } : undefined);
      if (scanResult.candidates.length === 0) {
        json({ imported: false, reason: 'No intake candidates found', baseSha: scanResult.baseSha, headSha: scanResult.headSha });
        return;
      }
      const result = importIntake(repoRoot, scanResult.candidates, dagId ? { dagId } : undefined);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'intake import', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { imported: result.imported.length, dagPath: result.dagPath, receipt: result.receipt },
      });
      json({ imported: true, count: result.imported.length, nodes: result.imported.map(c => c.id), dagPath: result.dagPath, receipt: result.receipt });
      return;
    }
    case 'certify': {
      const nodeIds = args.slice(2).filter(a => !a.startsWith('--'));
      if (nodeIds.length === 0) {
        json({ error: 'No node IDs provided', fix: 'roadmap intake certify <node-id> [<node-id>...] --note "..."' });
        process.exit(1);
      }
      const result = certifyIntake(repoRoot, nodeIds);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'intake certify', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { certified: result.certified.length, skipped: result.skipped.length },
      });
      json(result);
      return;
    }
    case 'absorb': {
      const fromIdx = args.indexOf('--from');
      if (fromIdx === -1 || !args[fromIdx + 1]) {
        json({ error: 'Missing --from <sha>', fix: 'roadmap intake absorb --from <sha> [--to <sha>] --note "..."' });
        process.exit(1);
      }
      const fromSha = args[fromIdx + 1];
      const toIdx = args.indexOf('--to');
      const toSha = toIdx !== -1 ? args[toIdx + 1] : undefined;
      const sinceIdx = args.indexOf('--since');
      const since = sinceIdx !== -1 ? args[sinceIdx + 1] : undefined;
      const result = runIntakeAbsorb({ fromSha, toSha, since, repoRoot });
      recordTrail({
        ts: new Date().toISOString(), cmd: 'intake absorb', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { intakeId: result.intakeId, commits: result.commits.length, clusters: result.detectedClusters.length, proposedNodes: result.proposedNodes.length },
      });
      json(result);
      return;
    }
    case 'auto-certify': {
      try {
        certifyAutoIntake(repoRoot);
      } catch (e) {
        json({ error: (e as Error).message, fix: 'Nothing to certify — run auto-intake first' });
        process.exit(1);
      }
      recordTrail({
        ts: new Date().toISOString(), cmd: 'intake auto-certify', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { cleared: 'pending-certify.json' },
      });
      json({ ok: true, cleared: '.roadmap/pending-certify.json' });
      return;
    }
    default:
      json({ error: `Unknown intake subcommand: ${sub}`, fix: 'roadmap intake scan|import|certify|absorb|auto-certify --note "..."' });
      process.exit(1);
  }
}

// --- federation: multi-repo DAG management ---
function cmdFederation(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'add': {
      const pathIdx = args.indexOf('--path');
      const peerPath = pathIdx !== -1 ? args[pathIdx + 1] : undefined;
      const idIdx = args.indexOf('--id');
      const peerId = idIdx !== -1 ? args[idIdx + 1] : undefined;
      if (!peerPath) {
        json({ error: 'Missing --path', fix: 'roadmap federation add --path <repo> --id <peer-id> --note "..."' });
        process.exit(1);
      }
      if (!peerId) {
        json({ error: 'Missing --id', fix: 'roadmap federation add --path <repo> --id <peer-id> --note "..."' });
        process.exit(1);
      }
      const peer = addPeer(repoRoot, peerId, peerPath);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'federation add', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { peerId, peerPath },
      });
      json({ added: true, peer });
      return;
    }
    case 'remove': {
      const idIdx = args.indexOf('--id');
      const peerId = idIdx !== -1 ? args[idIdx + 1] : undefined;
      if (!peerId) {
        json({ error: 'Missing --id', fix: 'roadmap federation remove --id <peer-id> --note "..."' });
        process.exit(1);
      }
      const removed = removePeer(repoRoot, peerId);
      json({ removed, peerId });
      return;
    }
    case 'build': {
      const view = buildFederationView(repoRoot);
      recordTrail({
        ts: new Date().toISOString(), cmd: 'federation build', note,
        repo: basename(repoRoot), position: [], level: 0,
        detail: { peers: view.peers.length, nodes: view.nodes.length, viewHash: view.viewHash.slice(0, 12) },
      });
      json({ built: true, peers: view.peers.length, nodes: view.nodes.length, viewHash: view.viewHash.slice(0, 12) });
      return;
    }
    case 'status': {
      const status = federationStatus(repoRoot);
      json(status);
      return;
    }
    default:
      json({ error: `Unknown federation subcommand: ${sub}`, fix: 'roadmap federation add|remove|build|status --note "..."' });
      process.exit(1);
  }
}

// --- import: parse spec-kit tasks.md into candidate roadmap DAG ---
// roadmap import --from speckit <file.md> --id <dag-id> [--desc "..."] [--allow-drift]
// FR-GOV-001: receipted import with input hashing, hard validation, drift detection.
function cmdImport(note: string) {
  // FR-SPEC-001: engine-agnostic import from spec-compiled IR
  const compiledIdx = args.indexOf('--spec-compiled');
  if (compiledIdx !== -1) return cmdImportCompiled(note, args[compiledIdx + 1]);

  const fromIdx = args.indexOf('--from');
  if (fromIdx === -1 || args[fromIdx + 1] !== 'speckit') {
    json({ error: 'Missing --from speckit or --spec-compiled <path>', fix: 'roadmap import --from speckit tasks.md --id my-project --note "..." OR roadmap import --spec-compiled spec-compiled.json --note "..."' });
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
  const allowDrift = args.includes('--allow-drift');

  // --- FR-GOV-001: hash inputs ---
  const resolvedPath = resolve(filePath);
  const content = readFileSync(resolvedPath, 'utf-8');
  const inputHash = createHash('sha256').update(content).digest('hex');
  const specInputs = [{ path: filePath, sha256: inputHash }];

  const tasks = parseTasksMd(content);
  if (tasks.length === 0) {
    json({ error: 'No tasks found in file', fix: 'Use format: - [P0] task-id: description' });
    process.exit(1);
  }

  let dag = tasksToDAG(tasks, { dagId, dagDesc });
  dag = enrichIntentGate(dag, repoRoot);

  // --- FR-GOV-001: hard validation before write ---
  const warnings: string[] = [];

  try {
    define(dag);
  } catch (e: any) {
    json({ error: 'define() failed — DAG has structural errors', detail: e.message, fix: 'Fix the spec input and re-import' });
    process.exit(1);
  }

  const verifyErrors = verify(dag);
  if (verifyErrors.length > 0) {
    warnings.push(`verify: ${verifyErrors.length} contract warning(s): ${verifyErrors.slice(0, 3).join('; ')}`);
  }

  const checkResult = check(dag);
  if (!checkResult.done && checkResult.orphans.length > 0) {
    warnings.push(`check: ${checkResult.orphans.length} unreachable node(s)`);
  }

  // Intent gate warnings (non-blocking on import, since enrichment adds gates)
  const terminalError = validateTerminalIntentGate(dag);
  const initError = validateInitIntentGate(dag);
  if (terminalError) warnings.push(`terminal-intent: ${terminalError.message}`);
  if (initError) warnings.push(`init-intent: ${initError.message}`);

  // Audit tail gate — hard gate unless --skip-audit-tail
  const skipAuditTail = args.includes('--skip-audit-tail');
  try {
    const auditContract = loadRequired(repoRoot);
    const auditTailResult = validateAuditTail(dag, auditContract);
    if (!auditTailResult.passed) {
      if (skipAuditTail) {
        warnings.push(`audit-tail: ${auditTailResult.code} (skipped)`);
        writeAuditReceipt(`import-skip-audit-tail-${Date.now()}`, 'unknown', [], {
          schema_version: 1, runId: '', treeSha: '', sessionIds: [], computedAt: new Date().toISOString(),
          passed: false, detectorResults: [{ code: auditTailResult.code, passed: false, evidence: auditTailResult.evidence, fix: auditTailResult.fix }],
        }, repoRoot);
      } else {
        process.stderr.write(JSON.stringify({ error: auditTailResult.code, evidence: auditTailResult.evidence, fix: auditTailResult.fix }) + '\n');
        process.exit(3);
      }
    }
  } catch {
    // REQUIRED.json may not exist yet — non-blocking
  }

  // FR-SPEC-003: Embed spec provenance in head.json before writing
  dag = {
    ...dag,
    spec: {
      compiled_sha256: inputHash,
      engine: { name: 'speckit', version: '0.1.0' },
      inputs: specInputs,
    },
  };

  // --- FR-GOV-001: compute DAG hash ---
  const dagJson = JSON.stringify(dag, null, 2) + '\n';
  const dagHash = createHash('sha256').update(dagJson).digest('hex');

  // --- FR-GOV-001: drift detection ---
  const outDir = join(repoRoot, '.roadmap');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const receiptsDir = join(outDir, 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  // Check for existing receipt with same input hashes
  let driftDetected = false;
  let priorReceipt: Record<string, unknown> | null = null;
  if (existsSync(receiptsDir)) {
    for (const f of readdirSync(receiptsDir).filter(f => f.startsWith('import-') && f.endsWith('.json'))) {
      try {
        const r = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8'));
        const sameInputs = Array.isArray(r.spec_inputs) && r.spec_inputs.length === specInputs.length
          && r.spec_inputs.every((s: any, i: number) => s.sha256 === specInputs[i].sha256);
        if (sameInputs && r.dag_hash !== dagHash) {
          driftDetected = true;
          priorReceipt = r;
          break;
        }
      } catch { /* skip corrupt receipts */ }
    }
  }

  if (driftDetected && !allowDrift) {
    json({
      error: 'Drift detected: same inputs produce different DAG hash',
      prior_dag_hash: (priorReceipt as any)?.dag_hash,
      new_dag_hash: dagHash,
      fix: 'Use --allow-drift to acknowledge and overwrite, or investigate why the transform changed',
    });
    process.exit(1);
  }

  // --- Write candidate (non-destructive) ---
  if (candidateExists(repoRoot)) {
    json({ error: 'Candidate already exists at head.candidate.json', fix: 'roadmap dag accept or roadmap dag reject first' });
    process.exit(1);
    return;
  }
  const outPath = join(repoRoot, '.roadmap', 'head.candidate.json');
  writeCandidateDAG(repoRoot, dag, 'import', filePath);

  // --- FR-GOV-001: write receipt ---
  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(); } catch {}

  let commitTimestamp: string;
  try {
    commitTimestamp = execSync(`git show -s --format=%cI ${gitSha}`, { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    commitTimestamp = new Date().toISOString();
  }

  // spec-kit version (best effort)
  let specKitVersion: string | null = null;
  try {
    specKitVersion = execSync('npx spec-kit --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim().split('\n')[0];
  } catch {
    // Try reading from a known path
    const skPkg = resolve(homedir(), 'src/spec-kit/package.json');
    if (existsSync(skPkg)) {
      try { specKitVersion = JSON.parse(readFileSync(skPkg, 'utf-8')).version ?? null; } catch {}
    }
  }

  const receipt = {
    schema_version: 1,
    git_sha: gitSha,
    timestamp: commitTimestamp,
    spec_inputs: specInputs,
    spec_kit_version: specKitVersion,
    dag_id: dagId,
    dag_hash: dagHash,
    nodes: Object.keys(dag.nodes).length,
    validation: {
      define_passed: true,
      verify_warnings: verifyErrors.length,
      check_orphans: checkResult.orphans.length,
    },
    warnings,
    ...(driftDetected ? { drift: { acknowledged: true, prior_dag_hash: (priorReceipt as any)?.dag_hash } } : {}),
  };

  const receiptPath = join(receiptsDir, `import-${gitSha.slice(0, 8)}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'import', note,
    repo: basename(repoRoot), position: ['init'], level: 0, dagId,
    detail: { source: filePath, tasks: tasks.length, nodes: Object.keys(dag.nodes).length, receiptPath, dagHash: dagHash.slice(0, 12) },
  });

  const spawnPlan = buildSpawnPlan(dag);

  const result: Record<string, unknown> = {
    imported: true,
    candidate: true,
    dagId,
    source: filePath,
    tasks: tasks.length,
    nodes: Object.keys(dag.nodes).length,
    init: dag.init,
    term: dag.term,
    path: outPath,
    receipt: receiptPath,
    dag_hash: dagHash.slice(0, 12),
    input_hash: inputHash.slice(0, 12),
    spawnPlan,
    fix: 'Review with: roadmap dag diff, then: roadmap dag accept --note "..."',
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

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  json(result);
}

// --- import --spec-compiled: engine-agnostic import from roadmap IR ---
function cmdImportCompiled(note: string, irPath: string | undefined) {
  if (!irPath || !existsSync(irPath)) {
    json({ error: `spec-compiled file not found: ${irPath}`, fix: 'roadmap import --spec-compiled <path> --note "..."' });
    process.exit(1);
  }

  const allowDrift = args.includes('--allow-drift');
  const resolvedPath = resolve(irPath);
  const irContent = readFileSync(resolvedPath, 'utf-8');
  const inputHash = createHash('sha256').update(irContent).digest('hex');

  let ir: SpecIR;
  try {
    ir = parseIRFile(irContent);
  } catch (e: any) {
    json({ error: `Invalid spec-compiled: ${e.message}`, fix: 'Ensure the file was generated by roadmap spec compile' });
    process.exit(1);
  }

  let dag = compileIR(ir);
  dag = enrichIntentGate(dag, repoRoot);

  // Hard validation before write
  const warnings: string[] = [];
  try { define(dag); } catch (e: any) {
    json({ error: 'define() failed — compiled DAG has structural errors', detail: e.message });
    process.exit(1);
  }

  const verifyErrors = verify(dag);
  if (verifyErrors.length > 0) warnings.push(`verify: ${verifyErrors.length} contract warning(s)`);

  const checkResult = check(dag);
  if (!checkResult.done && checkResult.orphans.length > 0) warnings.push(`check: ${checkResult.orphans.length} unreachable node(s)`);

  const terminalError = validateTerminalIntentGate(dag);
  const initError = validateInitIntentGate(dag);
  if (terminalError) warnings.push(`terminal-intent: ${terminalError.message}`);
  if (initError) warnings.push(`init-intent: ${initError.message}`);

  const dagJson = JSON.stringify(dag, null, 2) + '\n';
  const dagHash = createHash('sha256').update(dagJson).digest('hex');

  // Drift detection (same as speckit import)
  const outDir = join(repoRoot, '.roadmap');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const receiptsDir = join(outDir, 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  let driftDetected = false;
  let priorReceipt: Record<string, unknown> | null = null;
  for (const f of readdirSync(receiptsDir).filter(f => f.startsWith('import-') && f.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8'));
      const sameInputs = Array.isArray(r.spec_inputs) && r.spec_inputs.length === 1
        && r.spec_inputs[0].sha256 === inputHash;
      if (sameInputs && r.dag_hash !== dagHash) { driftDetected = true; priorReceipt = r; break; }
    } catch {}
  }

  if (driftDetected && !allowDrift) {
    json({ error: 'Drift detected: same IR produces different DAG hash', prior_dag_hash: (priorReceipt as any)?.dag_hash, new_dag_hash: dagHash, fix: 'Use --allow-drift to override' });
    process.exit(1);
  }

  // Write candidate (non-destructive)
  if (candidateExists(repoRoot)) {
    json({ error: 'Candidate already exists at head.candidate.json', fix: 'roadmap dag accept or roadmap dag reject first' });
    process.exit(1);
    return;
  }
  const outPath = join(repoRoot, '.roadmap', 'head.candidate.json');
  writeCandidateDAG(repoRoot, dag, 'import', irPath);

  // Write spec-origin.json — provenance for this spec-compiled import
  const specOrigin: SpecOrigin = {
    schemaVersion: 1,
    engine: ir.engine.name,
    version: ir.engine.version ?? '0.0.0',
    compile_hash: ir.metadata.compile_hash,
    spec_sha: inputHash,
    importedAt: new Date().toISOString(),
    dagId: ir.dag_id,
  };
  const specOriginPath = writeSpecOrigin(repoRoot, specOrigin);

  // Write spec-import receipt
  const specImportReceipt: SpecImportReceipt = {
    schemaVersion: 1,
    type: 'spec-import',
    specOrigin,
    dagHash,
    inputHash,
    timestamp: new Date().toISOString(),
  };
  const specImportReceiptPath = writeSpecImportReceipt(repoRoot, specImportReceipt);

  // Write receipt
  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(); } catch {}

  let commitTimestamp: string;
  try { commitTimestamp = execSync(`git show -s --format=%cI ${gitSha}`, { cwd: repoRoot, encoding: 'utf-8' }).trim(); }
  catch { commitTimestamp = new Date().toISOString(); }

  const receipt = {
    schema_version: 1,
    type: 'import-compiled',
    git_sha: gitSha,
    timestamp: commitTimestamp,
    spec_inputs: [{ path: irPath, sha256: inputHash }],
    ir_inputs: ir.inputs,
    engine: ir.engine,
    dag_id: ir.dag_id,
    dag_hash: dagHash,
    compile_hash: ir.metadata.compile_hash,
    nodes: Object.keys(dag.nodes).length,
    validation: { define_passed: true, verify_warnings: verifyErrors.length, check_orphans: checkResult.orphans.length },
    warnings,
    ...(driftDetected ? { drift: { acknowledged: true, prior_dag_hash: (priorReceipt as any)?.dag_hash } } : {}),
  };

  const receiptPath = join(receiptsDir, `import-${gitSha.slice(0, 8)}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  // FR-SPEC-003: Write spec-compile receipt chain entry
  const specCompileReceipt = {
    schema_version: 1,
    type: 'spec-compile',
    dag_id: ir.dag_id,
    compiled_sha256: inputHash,
    dag_hash: dagHash,
    git_sha: gitSha,
    timestamp: commitTimestamp,
    engine: ir.engine,
    inputs: ir.inputs.map((i: any) => ({ path: i.path, sha256: i.sha256, role: i.role })),
    compile_hash: ir.metadata.compile_hash,
  };
  writeFileSync(join(receiptsDir, `spec-compile-${inputHash.slice(0, 12)}.json`), JSON.stringify(specCompileReceipt, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'import', note,
    repo: basename(repoRoot), position: ['init'], level: 0, dagId: ir.dag_id,
    detail: { source: irPath, type: 'spec-compiled', engine: ir.engine.name, nodes: Object.keys(dag.nodes).length, receiptPath, dagHash: dagHash.slice(0, 12), compiled_sha256: inputHash.slice(0, 12) },
  });

  const spawnPlan = buildSpawnPlan(dag);

  json({
    imported: true,
    candidate: true,
    type: 'spec-compiled',
    dagId: ir.dag_id,
    engine: ir.engine,
    source: irPath,
    nodes: Object.keys(dag.nodes).length,
    init: dag.init,
    term: dag.term,
    path: outPath,
    receipt: receiptPath,
    specOrigin: specOriginPath,
    specImportReceipt: specImportReceiptPath,
    dag_hash: dagHash.slice(0, 12),
    input_hash: inputHash.slice(0, 12),
    spawnPlan,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

// --- spec-kit: workspace init + agent brief generation ---
function cmdSpecKit(note: string) {
  const sub = args[1];
  if (sub === '--help' || sub === '-h' || args.includes('--help')) {
    console.log(SPEC_KIT_INIT_HELP);
    return;
  }
  switch (sub) {
    case 'init': return cmdSpecKitInit(note);
    default:
      json({ error: `Unknown spec-kit subcommand: ${sub}`, fix: 'roadmap spec-kit init <dag-id> --intent "..." --note "..."' });
      process.exit(1);
  }
}

function cmdSpecKitInit(note: string) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(SPEC_KIT_INIT_HELP);
    return;
  }

  // dag-id is positional: args = ['spec-kit', 'init', '<dag-id>']
  const dagId = args[2];
  if (!dagId || dagId.startsWith('--')) {
    json({ error: 'Missing <dag-id>', fix: 'roadmap spec-kit init <dag-id> --intent "..." --note "..."' });
    process.exit(1);
  }

  const intentIdx = args.indexOf('--intent');
  const intent = intentIdx !== -1 ? args[intentIdx + 1] : undefined;
  if (!intent) {
    json({ error: 'Missing --intent', fix: 'roadmap spec-kit init <dag-id> --intent "..." --note "..."' });
    process.exit(1);
  }

  // Get orientation if DAG exists
  let orientation: Orientation | undefined;
  if (hasLocalDAG) {
    try {
      orientation = orient(loadDAG(), loadStore(), retiredSet()) as Orientation;
    } catch { /* untracked — use default */ }
  }

  const result = specKitInit({ dagId, intent, repoRoot, orientation });

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec-kit.init', note,
    repo: basename(repoRoot), position: orientation?.position ?? ['untracked'], level: orientation?.level ?? 0, dagId,
  });

  console.log(result.brief.markdown);

  json({
    initialized: true,
    dagId,
    specFile: result.specFile,
    briefFile: result.briefFile,
    nextSteps: [
      `Edit ${result.specFile} — fill in domain concepts, scenarios, constraints`,
      `Run: roadmap spec generate --note "generate spec from pre-spec"`,
      `Run: roadmap spec compile --note "compile IR"`,
    ],
  });
}

// --- spec: front-end for spec generation pipeline ---
// FR-SPEC-001: roadmap owns the spec interface; spec-kit is a pluggable backend.
function cmdSpec(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'init':     return cmdSpecInit(note);
    case 'generate': return cmdSpecGenerate(note);
    case 'compile':  return cmdSpecCompile(note);
    default:
      json({ error: `Unknown spec subcommand: ${sub}`, fix: 'roadmap spec init|generate|compile --note "..."' });
      process.exit(1);
  }
}

function cmdSpecInit(note: string) {
  const idIdx = args.indexOf('--id');
  const dagId = idIdx !== -1 ? args[idIdx + 1] : undefined;
  if (!dagId) {
    json({ error: 'Missing --id', fix: 'roadmap spec init --id <dag-id> --note "..."' });
    process.exit(1);
  }

  const specDir = join(repoRoot, '.roadmap', 'spec');
  if (!existsSync(specDir)) mkdirSync(specDir, { recursive: true });

  const configPath = join(specDir, 'spec.config.json');
  const config = defaultConfig(dagId);

  // Allow --engine override
  const engineIdx = args.indexOf('--engine');
  if (engineIdx !== -1) config.engine = args[engineIdx + 1];

  const engineCmdIdx = args.indexOf('--engine-command');
  if (engineCmdIdx !== -1) config.engine_command = args[engineCmdIdx + 1];

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec-init', note,
    repo: basename(repoRoot), position: ['untracked'], level: 0, dagId,
  });

  json({
    initialized: true,
    dagId,
    config: configPath,
    engine: config.engine,
    inputPaths: config.inputs,
  });
}

function cmdSpecGenerate(note: string) {
  const specDir = join(repoRoot, '.roadmap', 'spec');
  const configPath = join(specDir, 'spec.config.json');

  if (!existsSync(configPath)) {
    json({ error: 'No spec config found', fix: 'Run roadmap spec init --id <dag-id> first' });
    process.exit(1);
  }

  const config: SpecConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Determine engine command
  const engineCmd = config.engine_command || `npx ${config.engine}`;

  // Check if engine is available
  let engineVersion: string | null = null;
  try {
    engineVersion = execSync(`${engineCmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim().split('\n')[0];
  } catch {
    // Try local path resolution
    const localPath = resolve(homedir(), `src/${config.engine}/package.json`);
    if (existsSync(localPath)) {
      try { engineVersion = JSON.parse(readFileSync(localPath, 'utf-8')).version; } catch {}
    }
  }

  // Collect input files and hash them
  const inputs: SpecInput[] = [];
  const inputEntries: [string, string | undefined][] = [
    ['pre_spec', config.inputs.pre_spec],
    ['spec', config.inputs.spec],
    ['plan', config.inputs.plan],
    ['tasks', config.inputs.tasks],
    ['data_model', config.inputs.data_model],
  ];

  for (const [role, path] of inputEntries) {
    if (!path) continue;
    const resolved = resolve(repoRoot, path);
    if (existsSync(resolved)) {
      const hash = createHash('sha256').update(readFileSync(resolved)).digest('hex');
      inputs.push({ path, sha256: hash, role: role.replace('_', '-') as SpecInput['role'] });
    }
  }

  for (const extra of config.inputs.extra ?? []) {
    const resolved = resolve(repoRoot, extra);
    if (existsSync(resolved)) {
      const hash = createHash('sha256').update(readFileSync(resolved)).digest('hex');
      inputs.push({ path: extra, sha256: hash, role: 'other' });
    }
  }

  if (inputs.length === 0) {
    json({
      error: 'No spec input files found',
      searched: Object.values(config.inputs).filter(Boolean),
      fix: 'Create spec inputs or update paths in .roadmap/spec/spec.config.json',
    });
    process.exit(1);
  }

  // Write receipt
  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(); } catch {}

  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  const receipt = {
    schema_version: 1,
    type: 'spec-generate',
    git_sha: gitSha,
    timestamp: new Date().toISOString(),
    engine: config.engine,
    engine_version: engineVersion,
    dag_id: config.dag_id,
    inputs,
    artifacts_found: inputs.map(i => i.path),
  };

  const receiptPath = join(receiptsDir, `spec-generate-${gitSha.slice(0, 8)}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec-generate', note,
    repo: basename(repoRoot), position: ['untracked'], level: 0, dagId: config.dag_id,
    detail: { engine: config.engine, inputs: inputs.length },
  });

  json({
    generated: true,
    engine: config.engine,
    engine_version: engineVersion,
    dagId: config.dag_id,
    inputs,
    receipt: receiptPath,
  });
}

function cmdSpecCompile(note: string) {
  const specDir = join(repoRoot, '.roadmap', 'spec');
  const configPath = join(specDir, 'spec.config.json');

  if (!existsSync(configPath)) {
    json({ error: 'No spec config found', fix: 'Run roadmap spec init --id <dag-id> first' });
    process.exit(1);
  }

  const config: SpecConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Find tasks file (primary input for compilation)
  const tasksPath = config.inputs.tasks ? resolve(repoRoot, config.inputs.tasks) : null;
  if (!tasksPath || !existsSync(tasksPath)) {
    json({ error: `Tasks file not found: ${config.inputs.tasks}`, fix: 'Run roadmap spec generate or create tasks file manually' });
    process.exit(1);
  }

  // Hash all inputs
  const inputs: SpecInput[] = [];
  const inputEntries: [string, string | undefined][] = [
    ['pre_spec', config.inputs.pre_spec],
    ['spec', config.inputs.spec],
    ['plan', config.inputs.plan],
    ['tasks', config.inputs.tasks],
    ['data_model', config.inputs.data_model],
  ];

  for (const [role, path] of inputEntries) {
    if (!path) continue;
    const resolved = resolve(repoRoot, path);
    if (existsSync(resolved)) {
      const hash = createHash('sha256').update(readFileSync(resolved)).digest('hex');
      inputs.push({ path, sha256: hash, role: role.replace('_', '-') as SpecInput['role'] });
    }
  }

  // Parse tasks
  const tasksContent = readFileSync(tasksPath, 'utf-8');
  const tasks = parseTasksMd(tasksContent);
  if (tasks.length === 0) {
    json({ error: 'No tasks found in tasks file', fix: 'Ensure tasks file uses format: - [P0] task-id: description' });
    process.exit(1);
  }

  // Engine version
  let engineVersion: string | null = null;
  const engineCmd = config.engine_command || `npx ${config.engine}`;
  try {
    engineVersion = execSync(`${engineCmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim().split('\n')[0];
  } catch {
    const localPath = resolve(homedir(), `src/${config.engine}/package.json`);
    if (existsSync(localPath)) {
      try { engineVersion = JSON.parse(readFileSync(localPath, 'utf-8')).version; } catch {}
    }
  }

  const configHash = createHash('sha256').update(readFileSync(configPath)).digest('hex');

  // Build IR tasks
  const irTasks: SpecIRTask[] = tasks.map(t => ({
    id: t.id,
    desc: t.desc,
    priority: t.priority,
    depends: t.depends,
    produces: t.produces,
    consumes: t.consumes,
    mode: t.mode,
    validate: t.validate,
  }));

  const compileContent = JSON.stringify(irTasks, null, 0);
  const compileHash = createHash('sha256').update(compileContent).digest('hex');

  const ir: SpecIR = {
    schema_version: 1,
    engine: { name: config.engine, version: engineVersion, config_hash: configHash },
    dag_id: config.dag_id,
    dag_desc: config.dag_desc,
    inputs,
    tasks: irTasks,
    metadata: {
      generated: new Date().toISOString(),
      compile_hash: compileHash,
    },
  };

  // Write spec-compiled.json
  const compiledPath = join(specDir, 'spec-compiled.json');
  writeFileSync(compiledPath, JSON.stringify(ir, null, 2) + '\n');

  // Write receipt
  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(); } catch {}

  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  const receipt = {
    schema_version: 1,
    type: 'spec-compile',
    git_sha: gitSha,
    timestamp: new Date().toISOString(),
    engine: ir.engine,
    dag_id: config.dag_id,
    inputs,
    tasks: tasks.length,
    compile_hash: compileHash,
    compiled_path: compiledPath,
  };

  const receiptPath = join(receiptsDir, `spec-compile-${gitSha.slice(0, 8)}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  const compiledSha256 = createHash('sha256').update(readFileSync(compiledPath)).digest('hex');

  recordTrail({
    ts: new Date().toISOString(), cmd: 'spec-compile', note,
    repo: basename(repoRoot), position: ['untracked'], level: 0, dagId: config.dag_id,
    detail: { tasks: tasks.length, compileHash: compileHash.slice(0, 12), compiled_sha256: compiledSha256.slice(0, 12) },
  });

  json({
    compiled: true,
    dagId: config.dag_id,
    engine: ir.engine,
    tasks: tasks.length,
    inputs: inputs.length,
    compile_hash: compileHash.slice(0, 12),
    path: compiledPath,
    receipt: receiptPath,
    next: `roadmap import --spec-compiled ${compiledPath} --note "..."`,
  });
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
      const pos = orientWithState(dag);
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
    const pos = orientWithState(dag);
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

async function cmdMf(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'init': {
      // Parse --run <id> (optional)
      const runIdx = args.indexOf('--run');
      let headSha = '';
      try {
        headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        headSha = '000000000000';
      }
      const runId: RunId = runIdx !== -1 && args[runIdx + 1]
        ? args[runIdx + 1] as RunId
        : generateRunId(headSha);

      ensureRunDir(runId, repoRoot);

      // Read strictReceipts from config (default true)
      const configPath = join(repoRoot, '.roadmap', 'metaflow', 'config.json');
      let strictReceipts = true;
      if (existsSync(configPath)) {
        try {
          const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
          if (typeof cfg.strictReceipts === 'boolean') strictReceipts = cfg.strictReceipts;
        } catch { /* use default */ }
      }

      const meta: RunMeta = {
        schema_version: 1,
        runId,
        repoRoot: process.cwd(),
        headSha,
        createdAt: new Date().toISOString(),
        strictReceipts,
      };
      writeMeta(runId, meta, repoRoot);

      json({ cmd: 'mf.init', runId, repoRoot: process.cwd(), headSha, strictReceipts });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.init', note, repo: basename(repoRoot), position: ['mf-init'], level: 0 });
      break;
    }
    case 'dispatch': {
      const runIdx = args.indexOf('--run');
      if (runIdx === -1 || !args[runIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf dispatch --run <runId> --worker-id <id> --note "..."' });
        process.exit(1);
      }
      const dRunId = args[runIdx + 1] as RunId;
      const workerIdx = args.indexOf('--worker-id');
      const dWorkerId = workerIdx !== -1 ? args[workerIdx + 1] : `worker-${Date.now()}`;
      const agentSessionIdx = args.indexOf('--agent-session');
      const dAgentSessionId = agentSessionIdx !== -1 ? args[agentSessionIdx + 1] : '';
      const gitIndexIdx = args.indexOf('--git-index');
      const dGitIndexFile = gitIndexIdx !== -1 ? args[gitIndexIdx + 1] : '';
      const hookProfileIdx = args.indexOf('--hook-profile');
      const dHookProfile = hookProfileIdx !== -1 ? args[hookProfileIdx + 1] : '';
      const capIdx = args.indexOf('--capabilities');
      const dCapabilities = capIdx !== -1 && args[capIdx + 1] ? args[capIdx + 1].split(',') : [];

      let dHeadSha = '';
      try {
        dHeadSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        dHeadSha = '000000000000';
      }

      const dStore = new SessionStore(dRunId, { base: repoRoot });
      const reusable = dStore.findReusable(dCapabilities);
      if (reusable) {
        dStore.markTeamReuseMissed();
      }
      dStore.register({ workerId: dWorkerId, agentSessionId: dAgentSessionId, headSha: dHeadSha, gitIndexFile: dGitIndexFile, hookProfile: dHookProfile, capabilities: dCapabilities });

      json({ cmd: 'mf.dispatch', runId: dRunId, workerId: dWorkerId, status: 'registered' });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.dispatch', note, repo: basename(repoRoot), position: ['mf-session-binding'], level: 2 });
      break;
    }
    case 'retire-team': {
      const rtRunIdx = args.indexOf('--run');
      if (rtRunIdx === -1 || !args[rtRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf retire-team --run <runId> --note "..."' });
        process.exit(1);
      }
      const rtRunId = args[rtRunIdx + 1] as RunId;
      const rtStore = new SessionStore(rtRunId, { base: repoRoot });
      const retiredCount = rtStore.retireAll();
      json({ cmd: 'mf.retire-team', runId: rtRunId, retiredCount });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.retire-team', note, repo: basename(repoRoot), position: ['mf-session-binding'], level: 2 });
      break;
    }
    case 'ask': {
      const aRunIdx = args.indexOf('--run');
      if (aRunIdx === -1 || !args[aRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf ask --run <runId> --step <stepId> --question-id <id> --text "..." --type choice|text --note "..."' });
        process.exit(1);
      }
      const aRunId = args[aRunIdx + 1] as RunId;
      const aStepIdx = args.indexOf('--step');
      const aStepId = (aStepIdx !== -1 ? args[aStepIdx + 1] : `ask-${Date.now()}`) as import('../src/lib/metaflow/types.ts').StepId;
      const aQidIdx = args.indexOf('--question-id');
      const aQid = aQidIdx !== -1 ? args[aQidIdx + 1] : `q-${Date.now()}`;
      const aTextIdx = args.indexOf('--text');
      const aText = aTextIdx !== -1 ? args[aTextIdx + 1] : '';
      const aTypeIdx = args.indexOf('--type');
      const aType = (aTypeIdx !== -1 ? args[aTypeIdx + 1] : 'text') as 'choice' | 'text';
      const aChoicesIdx = args.indexOf('--choices');
      const aChoices = aChoicesIdx !== -1 && args[aChoicesIdx + 1] ? args[aChoicesIdx + 1].split(',') : undefined;

      const question = buildQuestionBlock({ id: aQid, text: aText, type: aType, choices: aChoices });
      const aMeta = readMeta(aRunId, repoRoot);
      aMeta.questions = [...(aMeta.questions ?? []), question];
      writeMeta(aRunId, aMeta, repoRoot);

      // Receipt
      let aHeadSha = '';
      try {
        aHeadSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch { aHeadSha = '000000000000'; }
      const aWriter = new InteractionReceiptWriter(aRunId, { base: repoRoot, headSha: aHeadSha });
      aWriter.begin(aStepId, 'mf.ask', note, 'agent');
      aWriter.writeSnapshot(aStepId, JSON.stringify({ cmd: 'mf.ask', runId: aRunId, stepId: aStepId, question }, null, 2));
      aWriter.commit(aStepId, 'mf.ask', note, 'agent', { toolCalls: 0 });

      json({ cmd: 'mf.ask', runId: aRunId, stepId: aStepId, question });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.ask', note, repo: basename(repoRoot), position: ['mf-guided-ask-answer'], level: 3 });
      break;
    }
    case 'answer': {
      const nRunIdx = args.indexOf('--run');
      if (nRunIdx === -1 || !args[nRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf answer --run <runId> --question-id <id> --value "..." --note "..."' });
        process.exit(1);
      }
      const nRunId = args[nRunIdx + 1] as RunId;
      const nQidIdx = args.indexOf('--question-id');
      if (nQidIdx === -1 || !args[nQidIdx + 1]) {
        json({ error: 'Missing --question-id <id>', fix: 'roadmap mf answer --run <runId> --question-id <id> --value "..."' });
        process.exit(1);
      }
      const nQid = args[nQidIdx + 1];
      const nValIdx = args.indexOf('--value');
      const nValue = nValIdx !== -1 ? args[nValIdx + 1] : '';

      const answer = recordAnswer(nRunId, nQid, nValue, repoRoot);
      json({ cmd: 'mf.answer', runId: nRunId, questionId: nQid, value: nValue, answer });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.answer', note, repo: basename(repoRoot), position: ['mf-guided-ask-answer'], level: 3 });
      break;
    }
    case 'wrap': {
      const wRunIdx = args.indexOf('--run');
      if (wRunIdx === -1 || !args[wRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf wrap --run <runId> --cmd "..." --step <stepId> --note "..."' });
        process.exit(1);
      }
      const wRunId = args[wRunIdx + 1] as RunId;
      const wCmdIdx = args.indexOf('--cmd');
      if (wCmdIdx === -1 || !args[wCmdIdx + 1]) {
        json({ error: 'Missing --cmd "..."', fix: 'roadmap mf wrap --run <runId> --cmd "..." --note "..."' });
        process.exit(1);
      }
      const wCmd = args[wCmdIdx + 1];
      const wStepIdx = args.indexOf('--step');
      const wStepId = (wStepIdx !== -1 ? args[wStepIdx + 1] : `wrap-${Date.now()}`) as import('../src/lib/metaflow/types.ts').StepId;

      let wHeadSha = '';
      try {
        wHeadSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        wHeadSha = '000000000000';
      }

      try {
        const wResult = wrapSubcommand({ runId: wRunId, stepId: wStepId, cmd: wCmd, base: repoRoot, headSha: wHeadSha });
        if (wResult.stdout) process.stdout.write(wResult.stdout);
        if (wResult.stderr) process.stderr.write(wResult.stderr);
        json({ cmd: 'mf.wrap', runId: wRunId, stepId: wStepId, exitCode: wResult.exitCode, receiptCommitted: wResult.receiptCommitted });
        recordTrail({ ts: new Date().toISOString(), cmd: 'mf.wrap', note, repo: basename(repoRoot), position: ['mf-wrap-subcommand'], level: 3 });
        if (wResult.exitCode !== 0) process.exit(wResult.exitCode);
      } catch (e: any) {
        if (e.code === 'SESSION_BINDING_MISSING' || e.code === 'INTERACTION_RECEIPT_MISSING') {
          process.stderr.write(JSON.stringify({ schema_version: 1, ok: false, error: { code: e.code, message: e.message } }) + '\n');
          process.exit(3);
        }
        throw e;
      }
      break;
    }
    case 'mine': {
      const mRunIdx = args.indexOf('--run');
      if (mRunIdx === -1 || !args[mRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf mine --run <runId> --note "..."' });
        process.exit(1);
      }
      const mRunId = args[mRunIdx + 1] as RunId;
      const mResult = mineRun(mRunId, repoRoot);

      // Build RenderModel
      const mNodes: import('../src/lib/render/types.ts').RenderNode[] = [];
      mNodes.push({ t: 'h2', s: `mf mine — ${mRunId}` });
      mNodes.push({ t: 'table', headers: ['Metric', 'Value'], rows: [
        ['p50 latency', `${mResult.latencyP50Ms}ms`],
        ['p95 latency', `${mResult.latencyP95Ms}ms`],
        ['Total tool calls', String(mResult.toolCallTotal)],
      ]});
      if (mResult.hotspots.length > 0) {
        mNodes.push({ t: 'h2', s: 'Hotspots' });
        mNodes.push({ t: 'table', headers: ['Tool', 'Count', 'Agents'], rows:
          mResult.hotspots.slice(0, 5).map(h => [h.tool, String(h.count), h.agentIds.join(', ')])
        });
      }
      if (mResult.friction.length > 0) {
        mNodes.push({ t: 'h2', s: 'Friction' });
        mNodes.push({ t: 'list', items: mResult.friction.map(f => `[${f.category}] ${f.detail}`) });
      }
      if (mResult.teamReuseMissed) {
        mNodes.push({ t: 'text', s: 'WARNING: Team reuse opportunity was missed' });
      }

      json({ cmd: 'mf.mine', runId: mRunId, mining: mResult }, {
        kind: 'generic', title: `mf mine — ${mRunId}`, nodes: mNodes,
      });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.mine', note, repo: basename(repoRoot), position: ['mf-mine-run'], level: 4 });
      break;
    }
    case 'complete': {
      const cRunIdx = args.indexOf('--run');
      if (cRunIdx === -1 || !args[cRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf complete --run <runId> --note "..."' });
        process.exit(1);
      }
      const cRunId = args[cRunIdx + 1] as RunId;
      if (!miningExists(cRunId, repoRoot)) {
        process.stderr.write(JSON.stringify({
          schema_version: 1, ok: false, cmd: 'mf.complete',
          error: { code: 'MINING_REQUIRED', message: 'Run must be mined before completion: roadmap mf mine --run <runId>' }
        }) + '\n');
        process.exit(3);
      }
      const miningPath = join(runDir(cRunId, repoRoot), 'mining.json');
      json({ cmd: 'mf.complete', runId: cRunId, status: 'complete', miningPath });
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.complete', note, repo: basename(repoRoot), position: ['mf-mine-run'], level: 4 });
      break;
    }
    case 'opt': {
      const oRunIdx = args.indexOf('--run');
      if (oRunIdx === -1 || !args[oRunIdx + 1]) {
        json({ error: 'Missing --run <runId>', fix: 'roadmap mf opt --run <runId> [--emit] --note "..."' });
        process.exit(1);
      }
      const oRunId = args[oRunIdx + 1] as RunId;
      const oEmit = args.includes('--emit');

      const mining = readMining(oRunId, repoRoot);
      const optNodes = buildOptimizationNodes(mining);

      if (oEmit && optNodes.length > 0) {
        const expansionPath = emitOptExpansion(oRunId, optNodes, repoRoot);
        json({ cmd: 'mf.opt', runId: oRunId, nodes: optNodes, expansionPath, emitted: true });
      } else {
        json({ cmd: 'mf.opt', runId: oRunId, nodes: optNodes, emitted: false });
      }

      if (optNodes.length === 0) {
        process.stderr.write('(no optimizations — run is clean)\n');
      } else {
        process.stderr.write(`Optimization nodes (${optNodes.length}):\n`);
        for (const n of optNodes) {
          process.stderr.write(`  ${n.id}: ${n.desc}\n    rationale: ${n.rationale}\n`);
        }
      }

      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.opt', note, repo: basename(repoRoot), position: ['mf-opt-dag-generator'], level: 5 });
      break;
    }
    case 'audit': {
      const aRunIdx = args.indexOf('--run');
      const aRunId = aRunIdx !== -1 ? args[aRunIdx + 1] ?? 'audit-run' : 'audit-run';
      const aRequired = args.includes('--required');
      const { cmdMfAudit } = await import('../src/lib/metaflow/audit/cli.ts');
      const auditResult = cmdMfAudit(aRunId, { required: aRequired, base: repoRoot });
      process.stderr.write(auditResult.render + '\n');
      json(auditResult.data);
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.audit', note, repo: basename(repoRoot), position: ['mf-audit'], level: 5 });
      break;
    }
    case 'audit-tail': {
      const atSub = args[2];
      if (atSub !== 'emit') {
        json({ error: 'Usage: roadmap mf audit-tail emit --note "..."' });
        process.exit(1);
      }
      const dagId = loadDAG?.()?.id ?? 'unknown';
      const { cmdAuditTailEmit } = await import('../src/lib/metaflow/audit/cli.ts');
      const tailResult = cmdAuditTailEmit(dagId, repoRoot);
      process.stderr.write(tailResult.render + '\n');
      json(tailResult.data);
      recordTrail({ ts: new Date().toISOString(), cmd: 'mf.audit-tail', note, repo: basename(repoRoot), position: ['mf-audit-tail'], level: 5 });
      break;
    }
    default:
      json({ error: `Unknown mf subcommand: ${sub}`, fix: 'roadmap mf init --note "..."' });
      process.exit(1);
  }

  // Receipt enforcement — when --mf-run is active and command requires a receipt
  enforceReceipt();
}

// --- internal: flow execution and step handlers ---

async function cmdInternal(note: string) {
  const sub = args[1];
  switch (sub) {
    case 'execute-flow': {
      return await cmdInternalExecuteFlow(note);
    }
    case 'write-targets': {
      return await cmdInternalWriteTargets(note);
    }
    case 'measure-iteration': {
      return await cmdInternalMeasureIteration(note);
    }
    case 'check-targets': {
      return await cmdInternalCheckTargets(note);
    }
    case 'implement-proposal': {
      return await cmdInternalImplementProposal(note);
    }
    default:
      json({ error: `Unknown internal subcommand: ${sub}`, fix: 'roadmap internal <write-targets|measure-iteration|check-targets|implement-proposal|execute-flow>' });
      process.exit(1);
  }
}

async function cmdInternalExecuteFlow(note: string) {
  const flowIdIdx = args.indexOf('--flow-id');
  const flowId = flowIdIdx !== -1 ? args[flowIdIdx + 1] : undefined;
  if (!flowId) {
    json({ error: 'Missing --flow-id <id>' });
    process.exit(1);
  }

  const { executeFlow } = await import('../src/lib/metaflow/phases/execute-flow.ts');
  try {
    const report = await executeFlow(repoRoot, flowId);
    json(report);
    recordTrail({
      ts: new Date().toISOString(), cmd: 'internal.execute-flow', note, repo: basename(repoRoot),
      detail: { flowId, passed: report.passed, stepsRun: report.steps.length },
    });
    if (!report.passed) process.exit(1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json({ error: `execute-flow failed: ${msg}` });
    process.exit(1);
  }
}

async function cmdInternalWriteTargets(note: string) {
  const { writeTargets } = await import('../src/lib/metaflow/optimizer/targets.ts');
  const targetsPath = join(repoRoot, '.roadmap/metaflow-optimizer/targets.json');
  try {
    writeTargets(targetsPath);
    json({ ok: true, msg: 'Targets written', path: targetsPath });
    recordTrail({
      ts: new Date().toISOString(), cmd: 'internal.write-targets', note, repo: basename(repoRoot),
      detail: { targetsPath },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json({ error: `write-targets failed: ${msg}` });
    process.exit(1);
  }
}

async function cmdInternalMeasureIteration(note: string) {
  const iterIdx = args.indexOf('--iter');
  const iterN = iterIdx !== -1 ? parseInt(args[iterIdx + 1], 10) : undefined;
  if (!iterN || isNaN(iterN)) {
    json({ error: 'Missing --iter <N>' });
    process.exit(1);
  }

  const { measureIteration } = await import('../src/lib/metaflow/optimizer/measure.ts');
  const { writeMetrics, writeTargetsAchieved } = await import('../src/lib/metaflow/optimizer/measure.ts');
  const { checkTargets } = await import('../src/lib/metaflow/optimizer/targets.ts');

  try {
    const metrics = await measureIteration(iterN, repoRoot);
    const metricsPath = join(repoRoot, `.roadmap/metaflow-optimizer/iter-${iterN}/metrics.json`);
    writeMetrics(metricsPath, metrics);

    const { met } = checkTargets(metrics);
    if (met) {
      const sentinelPath = join(repoRoot, '.roadmap/metaflow-optimizer/targets-achieved.json');
      writeTargetsAchieved(sentinelPath);
    }

    json({ ok: true, metrics, targetsAchieved: met });
    recordTrail({
      ts: new Date().toISOString(), cmd: 'internal.measure-iteration', note, repo: basename(repoRoot),
      detail: { iterN, targetsAchieved: met },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json({ error: `measure-iteration failed: ${msg}` });
    process.exit(1);
  }
}

async function cmdInternalCheckTargets(note: string) {
  const metricsPath = join(repoRoot, '.roadmap/metaflow-optimizer/iter-8/metrics.json');
  const { checkTargets } = await import('../src/lib/metaflow/optimizer/targets.ts');

  try {
    const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
    const result = checkTargets(metrics);
    const gateResultPath = join(repoRoot, '.roadmap/metaflow-optimizer/optimizer-gate.json');
    mkdirSync(dirname(gateResultPath), { recursive: true });
    writeFileSync(gateResultPath, JSON.stringify(result, null, 2));

    json({ ok: true, ...result });
    recordTrail({
      ts: new Date().toISOString(), cmd: 'internal.check-targets', note, repo: basename(repoRoot),
      detail: { targetsMet: result.met, gapCount: result.gaps.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json({ error: `check-targets failed: ${msg}` });
    process.exit(1);
  }
}

async function cmdInternalImplementProposal(note: string) {
  const iterIdx = args.indexOf('--iter');
  const iterN = iterIdx !== -1 ? parseInt(args[iterIdx + 1], 10) : undefined;
  if (!iterN || isNaN(iterN)) {
    json({ error: 'Missing --iter <N>' });
    process.exit(1);
  }

  const { implement } = await import('../src/lib/metaflow/optimizer/implement.ts');
  const { writeImplementation } = await import('../src/lib/metaflow/optimizer/implement.ts');

  try {
    const result = await implement(iterN, repoRoot);
    const implPath = join(repoRoot, `.roadmap/metaflow-optimizer/iter-${iterN}/impl.json`);
    writeImplementation(implPath, result);

    json({ ok: true, impl: result });
    recordTrail({
      ts: new Date().toISOString(), cmd: 'internal.implement-proposal', note, repo: basename(repoRoot),
      detail: { iterN, strategy: result.strategy, filesModified: result.filesModified.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json({ error: `implement-proposal failed: ${msg}` });
    process.exit(1);
  }
}

function enforceReceipt(): void {
  const mfRunIdx = process.argv.indexOf('--mf-run');
  const activeMfRun = mfRunIdx !== -1 ? process.argv[mfRunIdx + 1] : null;
  if (!activeMfRun || !isReceiptRequired(process.argv)) return;

  try {
    const meta = readMeta(activeMfRun as RunId, repoRoot);
    if (!meta.strictReceipts) return;

    const ndjsonPath = join(repoRoot, '.roadmap', 'metaflow', 'runs', activeMfRun, 'interactions.ndjson');
    const recentlyWritten = existsSync(ndjsonPath) &&
      (Date.now() - statSync(ndjsonPath).mtimeMs) < 2000;
    if (!recentlyWritten) {
      process.stderr.write(JSON.stringify({
        schema_version: 1, ok: false, cmd: 'error',
        error: { code: 'INTERACTION_RECEIPT_MISSING', message: 'Command requires an InteractionReceipt but none was written for this invocation' }
      }) + '\n');
      process.exit(3);
    }
  } catch {
    // If run meta can't be read, don't enforce (run may not be initialized)
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
  orient --json       Machine-canonical v1 envelope (schema_version, workspace, exit code)
  orient --json --dag Full DAG structure: nodes, edges, toposort, blocked, executable
  orient --assign     Round-robin assign batchRemaining to --owners (JSON)
  advance             Advance to next batch — runs validate[] on all nodes (JSON)
  advance --structural-only  Skip quality gates, advance on artifact existence only
  advance --allow-conflicts  Override batch conflict enforcement (receipted)
  commit --node <id>  Stage node's produces, commit with [node: X] trailer, update git-state
  complete <node-id>  Atomic: claim → checkpoint → reorient → auto-advance if last in batch (--no-advance to suppress)
  checkpoint --label <name>  Save checkpoint (--note optional when --label given)
  checkpoint --list   List all checkpoints
  checkpoint --restore  Restore from latest valid checkpoint
  describe            Full API surface + project state (JSON)
  validate [node]     Run validation rules (all nodes or specific)
  expand <script.ts>  Run expansion script, validate DAG, commit
  expand <script> --type structural|iteration  Structural (idempotent) vs iteration (one-shot)
  expand <script> --allow-conflicts  Override batch conflict enforcement (receipted)
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
  import --from speckit <file.md> --id <dag-id>  Parse tasks.md → roadmap DAG (receipted: input hash + DAG hash)
  import --spec-compiled <path>  Import from spec-compiled IR (engine-agnostic, receipted)
  import ... --allow-drift  Acknowledge and overwrite when same inputs produce different DAG
  spec init --id <dag-id>  Create spec workspace + config (.roadmap/spec/)
  spec init --engine <name>  Use alternate backend engine (default: spec-kit)
  spec generate             Hash + receipt spec inputs via configured engine
  spec compile              Parse tasks → spec-compiled.json (roadmap IR) + receipt
  intake absorb --from <sha> [--to <sha>]  Absorb git range → .roadmap/intake/<id>.json
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
  explore --api         Show explore API surface (observation + interaction helpers)
  explore --api --json  Machine-readable API surface for agent context injection
  explore --run <script> [--launch <cmd>] [--port N] [--keep-alive]  Run explore script with managed lifecycle
  compile-brief --node <id> [--env path]  Generate agent-ready work brief from node spec + environment + spec-kit context
  compile-prompts --node <id> [--env path] Generate agent prompts from DAG nodes
  plan overlay --from-intake <id>  Write candidate nodes to .roadmap/overlays/ (no head.json mutation)
  gate merge [--target <branch>]  Local merge gate: verify required receipts before merge
  env-audit           Fail if deprecated bypass env vars (SKIP_PLAN_GATE etc.) are set at runtime
  profile [--node <id>] [--last-n <n>]  Aggregate audit sessions → profile-report.json
  audit ingest <path>  Parse transcript → .roadmap/audit/<sessionId>.json
  dig [path]          Browse archived files in git history
  patch stack --nodes <ids> --base <sha>  Create branch stack per node from baseSha
  dig <path> --restore  Recover archived file to working tree
  help                This message

Global flags (FR-CLI-001):
  --human             Human-readable formatted output instead of JSON
  --json              Force JSON output (overrides --human)
  --quiet             Suppress non-fatal output

All commands (except help/trail/chart/install/dig/claim/diff/show/orient/explore) require --note "reason".
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

    const posAfter = orient(result.dag, loadStore(), retiredSet());
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

// --- explore: API surface dump + managed script execution ---

async function cmdExplore() {
  const isApi = args.includes('--api');
  const isJson = args.includes('--json');
  const runIdx = args.indexOf('--run');
  const evalIdx = args.indexOf('--eval');

  if (isApi) {
    const surface = {
      import: 'roadmap/explore',
      observations: [
        { fn: 'checkVisible', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Element present and visible in viewport' },
        { fn: 'checkText', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Extract and verify rendered text content' },
        { fn: 'checkStyle', sig: '(page: Page, selector: string, property: string, label: string) → ObservationResult', desc: 'Read computed CSS property value' },
        { fn: 'checkSize', sig: '(page: Page, selector: string, minW: number, minH: number, label: string) → ObservationResult', desc: 'Bounding box exceeds minimum dimensions' },
        { fn: 'checkCount', sig: '(page: Page, selector: string, expected: number, label: string) → ObservationResult', desc: 'Count matching elements against expected' },
        { fn: 'checkAttribute', sig: '(page: Page, selector: string, attr: string, expected: string, label: string) → ObservationResult', desc: 'Element attribute matches expected value' },
        { fn: 'checkClass', sig: '(page: Page, selector: string, className: string, label: string) → ObservationResult', desc: 'Element has specific CSS class' },
        { fn: 'checkContrast', sig: '(page: Page, textSel: string, bgSel: string, minRatio: number, label: string) → ObservationResult', desc: 'WCAG 2.1 contrast ratio between text and background' },
        { fn: 'checkOverflow', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Detect scrollable overflow (clipped content)' },
        { fn: 'checkDisabled', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Element is disabled (form control)' },
        { fn: 'checkChecked', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Checkbox or radio is checked' },
        { fn: 'checkContainsText', sig: '(page: Page, selector: string, expectedText: string, label: string) → ObservationResult', desc: 'Element text contains substring' },
        { fn: 'checkInputValue', sig: '(page: Page, selector: string, expectedValue: string, label: string) → ObservationResult', desc: 'Form field value matches expected' },
        { fn: 'checkUrl', sig: '(page: Page, pattern: string | RegExp, label: string) → ObservationResult', desc: 'Current URL matches pattern' },
        { fn: 'checkTitle', sig: '(page: Page, expectedTitle: string, label: string) → ObservationResult', desc: 'Page title contains substring' },
        { fn: 'checkComputedStyle', sig: '(page: Page, selector: string, property: string, expectedValue: string, label: string) → ObservationResult', desc: 'Computed CSS property equals expected value' },
        { fn: 'checkInViewport', sig: '(page: Page, selector: string, label: string) → ObservationResult', desc: 'Element is visible in viewport' },
      ],
      interactions: [
        { fn: 'safeClick', sig: '(page: Page, selector: string) → void', desc: 'Click with visibility + enabled guard' },
        { fn: 'typeAndSubmit', sig: '(page: Page, selector: string, text: string, key?: string) → void', desc: 'Fill input and press key (default: Enter)' },
        { fn: 'drag', sig: '(page: Page, sourceSelector: string, targetSelector: string, opts?: { steps?: number }) → void', desc: 'Smooth mouse drag between elements' },
        { fn: 'waitFor', sig: '(page: Page, selector: string, timeout?: number) → Locator', desc: 'Wait for element visible + enabled (default 5000ms)' },
        { fn: 'waitForTransition', sig: '(page: Page, ms?: number) → void', desc: 'Wait for CSS transitions to settle (default 300ms)' },
        { fn: 'connectAndFindPage', sig: '(cdpUrl: string) → { page: Page, browser: Browser }', desc: 'Connect via CDP, filter devtools pages, return app page' },
        { fn: 'resetState', sig: '(page: Page) → void', desc: 'Call window.__DEMO_RESET__() if available' },
        { fn: 'fillForm', sig: '(page: Page, fields: Record<string, string>) → void', desc: 'Fill multiple form fields at once' },
        { fn: 'selectFromDropdown', sig: '(page: Page, selectSelector: string, optionText: string) → void', desc: 'Select option from native or custom dropdown' },
        { fn: 'toggleCheckbox', sig: '(page: Page, selector: string, shouldBeChecked: boolean) → void', desc: 'Check or uncheck, idempotent' },
        { fn: 'getListItems', sig: '(page: Page, itemSelector: string) → string[]', desc: 'Extract text from all matching list items' },
        { fn: 'findItemBy', sig: '(page: Page, itemSelector: string, partialText: string) → Locator | null', desc: 'Find list item by partial text match' },
        { fn: 'getTableData', sig: '(page: Page, tableSelector: string) → Record<string, string>[]', desc: 'Extract table rows as array of objects' },
        { fn: 'waitForNetwork', sig: '(page: Page, timeout?: number) → void', desc: 'Wait for networkidle state (default 5000ms)' },
        { fn: 'waitForTextChange', sig: '(page: Page, selector: string, timeout?: number) → string', desc: 'Wait for element text to change' },
        { fn: 'capturePageState', sig: '(page: Page) → { url, title, domSize, consoleMessages, consoleErrors }', desc: 'Snapshot page state: URL, title, DOM, console' },
        { fn: 'getConsoleMessages', sig: '(page: Page, fn: () => Promise<void>) → Array<{ type, text }>', desc: 'Collect console output during action' },
        { fn: 'getNetworkCalls', sig: '(page: Page, fn: () => Promise<void>) → Array<{ url, method, status, resourceType }>', desc: 'Capture HTTP requests/responses during action' },
        { fn: 'screenshot', sig: '(page: Page, path: string, opts?: { clip?: {...} }) → void', desc: 'Take page or clipped screenshot' },
      ],
      runtime: [
        { fn: 'launchApp', sig: '(opts: { command: string, port?: number, timeout?: number, buildCommand?: string }) → LaunchHandle', desc: 'Build + launch + poll CDP readiness' },
        { fn: 'runExploreScript', sig: '(opts: { script: string, cdpUrl: string, port: number, timeout?: number }) → ExploreScriptResult', desc: 'Execute explore script, parse JSON output' },
        { fn: 'teardown', sig: '(proc: ChildProcess) → void', desc: 'SIGTERM + force kill after 3s' },
      ],
      types: {
        ObservationResult: '{ id: string, pass: boolean, evidence: string, value?: string | number | boolean }',
        ExploreResult: '{ observations: ObservationResult[] }',
        LaunchHandle: '{ process: ChildProcess, cdpUrl: string, port: number }',
      },
    };

    if (isJson) {
      json(surface);
      return;
    }

    // Human-readable output
    console.log('Explore API — import from "roadmap/explore"\n');
    console.log(`Observation helpers (${surface.observations.length}):`);
    for (const o of surface.observations) {
      console.log(`  ${o.fn}${o.sig.slice(o.sig.indexOf('('))}`);
      console.log(`    ${o.desc}\n`);
    }
    console.log(`Interaction helpers (${surface.interactions.length})`);
    for (const i of surface.interactions) {
      console.log(`  ${i.fn}${i.sig.slice(i.sig.indexOf('('))}`);
      console.log(`    ${i.desc}\n`);
    }
    console.log('Runtime (3):');
    for (const r of surface.runtime) {
      console.log(`  ${r.fn}${r.sig.slice(r.sig.indexOf('('))}`);
      console.log(`    ${r.desc}\n`);
    }
    console.log('Types:');
    for (const [name, shape] of Object.entries(surface.types)) {
      console.log(`  ${name} = ${shape}`);
    }
    return;
  }

  if (runIdx !== -1) {
    const script = args[runIdx + 1];
    if (!script) {
      json({ error: 'Missing script path', fix: 'roadmap explore --run <script.ts>' });
      process.exit(1);
    }

    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 9222;
    const launchIdx = args.indexOf('--launch');
    const launchCommand = launchIdx !== -1 ? args[launchIdx + 1] : undefined;
    const buildIdx = args.indexOf('--build');
    const buildCommand = buildIdx !== -1 ? args[buildIdx + 1] : undefined;
    const keepAlive = args.includes('--keep-alive');

    const { launchApp, runExploreScript, teardown: teardownApp } = await import('../src/lib/exploration/runtime.ts');

    let handle: import('../src/lib/exploration/runtime.ts').LaunchHandle | undefined;

    try {
      // Launch app if command provided
      if (launchCommand) {
        console.error(`🚀 Launching: ${launchCommand} (port ${port})`);
        handle = await launchApp({ command: launchCommand, port, buildCommand });
        console.error(`✅ CDP ready at ${handle.cdpUrl}`);
      }

      // Run script
      console.error(`🔬 Running: ${script}`);
      const result = await runExploreScript({
        script,
        cdpUrl: `http://localhost:${port}`,
        port,
      });

      if (!result.success) {
        console.error(`❌ Script failed: ${result.error}`);
        json({ success: false, error: result.error });
        process.exit(1);
      }

      // Present observations
      const obs = result.result?.observations ?? [];
      const passed = obs.filter(o => o.pass).length;
      const failed = obs.filter(o => !o.pass).length;

      console.log(`\n🔬 Explore: ${script}\n`);
      for (const o of obs) {
        console.log(`${o.pass ? '✅' : '❌'} ${o.id.padEnd(28)} ${o.evidence}`);
      }
      console.log(`\n${passed}/${obs.length} passing · ${failed} failure(s)`);

      if (isJson) {
        json({ success: true, observations: obs, passed, failed, total: obs.length });
      }
    } finally {
      if (handle && !keepAlive) {
        teardownApp(handle.process);
        console.error('🛑 App terminated');
      } else if (handle && keepAlive) {
        console.error(`♻️  App still running (port ${port}) — use --keep-alive to iterate`);
      }
    }
    return;
  }

  // Default: show help
  console.log(`roadmap explore — CDP-based behavioral observation

Modes:
  --api                 Show full API surface (functions, signatures, types)
  --api --json          Machine-readable API surface
  --run <script.ts>     Run explore script with managed lifecycle
    --launch <cmd>      Launch command (e.g., "npx electron .")
    --build <cmd>       Build command before launch
    --port <N>          CDP port (default: 9222)
    --keep-alive        Don't teardown after run

Examples:
  roadmap explore --api
  roadmap explore --run scripts/explore/validate-app.ts --launch "npx electron dist/main/index.js" --port 9222
  roadmap explore --run scripts/explore/validate-app.ts --keep-alive`);
}

// --- plan select / plan status: plan selection receipt + validation ---

async function cmdPlanSelect(note: string) {
  const candidateId = args[2];
  if (!candidateId) {
    json({ error: 'Missing candidate ID', fix: 'roadmap plan select <candidateId> --note "reason"' });
    process.exit(1);
  }
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const { writePlanSelectReceipt } = await import('../src/lib/plan-selection.ts');

  const galleryJsonIdx = args.indexOf('--gallery-json');
  let galleryHash: string | undefined;
  if (galleryJsonIdx !== -1 && args[galleryJsonIdx + 1]) {
    try {
      const galleryBytes = readFileSync(resolve(repoRoot, args[galleryJsonIdx + 1]));
      galleryHash = createHash('sha256').update(galleryBytes).digest('hex');
    } catch { /* gallery hash is optional */ }
  }

  const selector = process.env['AGENT_ID'] ?? process.env['USER'] ?? 'unknown';
  const receipt = writePlanSelectReceipt(repoRoot, candidateId, selector, { galleryHash, note });

  const dag = loadDAG();
  const pos = orientWithState(dag);
  recordTrail({
    ts: new Date().toISOString(), cmd: 'plan select', note,
    repo: basename(repoRoot),
    position: pos.position, level: pos.level, dagId: dag.id,
    detail: { candidateId, headSha: receipt.headSha, selector, galleryHash },
  });

  json({
    selected: candidateId,
    headSha: receipt.headSha,
    selector: receipt.selector,
    selectedAt: receipt.selectedAt,
    receipt: receipt,
  });
}

async function cmdPlanStatus() {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  const { requirePlanGate } = await import('../src/lib/recipes/plan/plan-gate.ts');
  const { readPointer, computeHeadSha } = await import('../src/lib/plan-selection.ts');
  const { loadPlanSelectReceipt } = await import('../src/lib/plan-selection.ts');
  const gate = requirePlanGate(repoRoot);
  const pointer = readPointer(repoRoot);

  if (gate.ok) {
    const full = loadPlanSelectReceipt(repoRoot);
    json({
      status: 'valid',
      candidateId: gate.pointer.candidateId,
      headSha: gate.pointer.headSha,
      headShaMatch: true,
      receipt: gate.pointer.receipt,
      selectedAt: full?.selectedAt,
      selector: full?.selector,
    });
  } else {
    let headShaMatch: boolean | undefined;
    if (pointer) {
      try {
        headShaMatch = pointer.headSha === computeHeadSha(repoRoot);
      } catch {
        headShaMatch = false;
      }
    }

    json({
      status: 'invalid',
      reason: gate.reason,
      ...(headShaMatch !== undefined ? { headShaMatch } : {}),
      ...(pointer ? { staleReceipt: { candidateId: pointer.candidateId, headSha: pointer.headSha, receipt: pointer.receipt } } : {}),
      fix: gate.fix,
    });
    process.exit(1);
  }
}

// --- plan overlay + schedule ---

function cmdPlanOverlay(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }

  // --from-intake <intakeId>: build overlay from intake record (no DAG cluster/schedule)
  const fromIntakeIdx = args.indexOf('--from-intake');
  if (fromIntakeIdx !== -1) {
    const intakeId = args[fromIntakeIdx + 1];
    if (!intakeId) {
      json({ error: 'Missing intake ID', fix: 'roadmap plan overlay --from-intake <intakeId> --note "..."' });
      process.exit(1);
    }
    const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const treeSha = execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const record = runOverlayFromIntake({ intakeId, repoRoot, headSha, treeSha });
    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan overlay --from-intake', note,
      repo: basename(repoRoot), position: [], level: 0,
      detail: { intakeId, overlayId: record.overlayId.slice(0, 12), candidateNodes: record.candidateNodes.length },
    });
    json({
      overlay: true,
      fromIntake: intakeId,
      overlayId: record.overlayId.slice(0, 12),
      candidateNodes: record.candidateNodes.length,
      applied: false,
    });
    return;
  }

  const selectIdx = args.indexOf('--select');
  const candidateId = selectIdx !== -1 ? args[selectIdx + 1] : undefined;
  if (!candidateId) {
    json({ error: 'Missing --select <candidateId> or --from-intake <intakeId>', fix: 'roadmap plan overlay --select <id> --note "..." | --from-intake <intakeId> --note "..."' });
    process.exit(1);
  }

  const dag = loadDAG();
  const clusterResult = buildClusters(dag);
  const scheduleResult = buildSchedule(dag, clusterResult);

  const clusters = clusterResult.clusters.map(c => ({
    id: c.id,
    nodes: c.nodes,
    produces: c.produces,
    consumes: c.consumes,
  }));

  const overlay = buildPlanOverlay(repoRoot, candidateId, clusters, scheduleResult.waves);
  const overlayPath = writePlanOverlay(repoRoot, overlay);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'plan overlay', note,
    repo: basename(repoRoot), position: [], level: 0,
    detail: { candidateId, clusters: overlay.clusters.length, scheduleEntries: overlay.schedule.length, overlayHash: overlay.overlayHash.slice(0, 12) },
  });

  json({
    overlay: true,
    candidateId,
    clusters: overlay.clusters.length,
    schedule: overlay.schedule.length,
    overlayHash: overlay.overlayHash.slice(0, 12),
    path: overlayPath,
  });
}

function cmdPlanScheduleFromOverlay(note: string) {
  const overlay = loadPlanOverlay(repoRoot);
  if (!overlay) {
    json({ error: 'No plan overlay found', fix: 'roadmap plan overlay --select <id> --note "..." first' });
    process.exit(1);
  }

  if (!isOverlayValid(repoRoot, overlay)) {
    json({ error: 'Plan overlay is stale — DAG has changed since overlay was built', fix: 'Rebuild: roadmap plan overlay --select <id> --note "..."' });
    process.exit(1);
  }

  json({
    candidateId: overlay.candidateId,
    valid: true,
    schedule: overlay.schedule,
    clusters: overlay.clusters.length,
    overlayHash: overlay.overlayHash.slice(0, 12),
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

  // --evaluate: record LLM judgments and store selected strategy (metadata, not DAG replacement)
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
    // Recovery: use `roadmap dig .roadmap/head.json --restore` or `git revert`
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
      // The head.json is written either way
    }

    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan --gallery --evaluate', note,
      repo: basename(repoRoot),
      detail: { selectedId: selected.id, runId, specSource, confidence: Math.min(...judgments.map(j => j.confidence)) },
    });

    json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json', recovery: 'roadmap dig .roadmap/head.json --restore' });
    return;
  }

  // --select: manual strategy selection (stores metadata, preserves current DAG)
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
    // Recovery: use `roadmap dig .roadmap/head.json --restore` or `git revert`
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
      // The head.json is written either way
    }

    recordTrail({
      ts: new Date().toISOString(), cmd: 'plan --gallery --select', note,
      repo: basename(repoRoot),
      detail: { selectedId: selected.id, runId, specSource, manualOverride: true },
    });

    json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json', recovery: 'roadmap dig .roadmap/head.json --restore' });
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

// FR-GOV-004: write receipt when --allow-conflicts overrides batch conflict enforcement
function writeConflictOverrideReceipt(conflicts: { level: number; file: string; writers: string[]; type: string }[], level: number, command: string) {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(); } catch {}

  const receipt = {
    schema_version: 1,
    type: 'conflict-override',
    command,
    git_sha: gitSha,
    timestamp: new Date().toISOString(),
    level,
    conflicts: conflicts.map(c => ({ type: c.type, file: c.file, nodes: c.writers })),
  };

  const receiptPath = join(receiptsDir, `conflict-override-${gitSha}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
}

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

// --- gate: local merge gate enforcement ---

function cmdGate(note: string) {
  const sub = args[1];
  if (sub !== 'merge') {
    json({ error: `Unknown gate subcommand: ${sub}`, fix: 'roadmap gate merge [--target <branch>] --note "..."' });
    process.exit(1);
    return;
  }

  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : undefined;

  const { runMergeGate } = require('../src/lib/recipes/merge/merge-gate-cmd.ts') as typeof import('../src/lib/recipes/merge/merge-gate-cmd.ts');
  const result = runMergeGate({ repoRoot, target });

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'gate.merge',
    note,
    repo: basename(repoRoot),
    detail: { pass: result.pass, target: result.target, checks: result.checks.length, errors: result.errors.length },
  });

  json(result);
  if (!result.pass) process.exit(1);
}

function json(obj: unknown, renderModel?: RenderModel) {
  const hasError = typeof obj === 'object' && obj !== null && 'error' in obj;

  // Build render output + RenderV1 envelope field
  let renderV1: RenderV1 | undefined;
  if (renderModel && !_outputOpts.quiet) {
    const renderOutput = render(renderModel, _renderOpts);
    renderV1 = {
      format: _renderOpts.tty ? 'ansi' : 'plain',
      mime: 'text/x-roadmap-ui',
      title: renderModel.title,
      body: renderOutput.plain,
    };
    process.stderr.write((renderOutput.ansi ?? renderOutput.plain) + '\n');
  } else if (!_outputOpts.quiet) {
    // Minimal stderr render for commands without a RenderModel
    process.stderr.write(`\u2501\u2501 ${_outputOpts.cmd} \u2501\u2501\n${JSON.stringify(obj, null, 2).slice(0, 500)}\n`);
  }

  const emitOpts = { ..._outputOpts, render: renderV1 };

  if (hasError) {
    const e = obj as Record<string, unknown>;
    emit({
      ok: false,
      cmd: _outputOpts.cmd,
      error: {
        code: typeof e.code === 'string' ? e.code : 'UNKNOWN',
        message: typeof e.error === 'string' ? e.error : String(e.error),
        fix: Array.isArray(e.fix) ? e.fix : typeof e.fix === 'string' ? [e.fix] : undefined,
      },
    }, emitOpts);
  } else {
    emit({ ok: true, cmd: _outputOpts.cmd, data: obj }, emitOpts);
  }
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

// --- compile-brief: generate agent-ready work briefs from node specs + environment ---
function cmdCompileBrief(note: string) {
  if (args.includes('--help')) {
    console.log('compile-brief --node <id> [--env path] [--json]  Generate agent-ready work brief from node spec + environment + spec-kit context');
    console.log('');
    console.log('When .roadmap/spec/<dag-id>-spec.md exists, spec-kit agent brief is appended automatically.');
    process.exit(0);
  }
  if (!hasLocalDAG) {
    json({ error: 'No roadmap in this repo.' });
    process.exit(1);
  }
  const dag = loadDAG();

  const nodeIdx = args.indexOf('--node');
  const nodeId = nodeIdx !== -1 ? args[nodeIdx + 1] : undefined;

  if (!nodeId) {
    json({ error: 'Missing --node <id>', fix: 'roadmap compile-brief --node T012 [--env environment.md] --note "reason"' });
    process.exit(1);
  }

  const envIdx = args.indexOf('--env');
  const envPath = envIdx !== -1 ? resolve(repoRoot, args[envIdx + 1] ?? '') : resolve(repoRoot, 'environment.md');

  let envSource: string | undefined;
  if (existsSync(envPath)) {
    envSource = readFileSync(envPath, 'utf-8');
  }

  let brief;
  try {
    brief = compileBrief(dag, nodeId, envSource);
  } catch (e) {
    json({ error: e instanceof Error ? e.message : String(e), fix: `Valid nodes: ${Object.keys((dag.nodes as Record<string, any>)).slice(0, 10).join(', ')}` });
    process.exit(1);
  }

  // Check for spec-kit context
  const specFile = join(repoRoot, '.roadmap', 'spec', `${dag.id}-spec.md`);
  const hasSpecKit = existsSync(specFile);
  let outputMarkdown = brief.markdown;
  let specKitResult: ReturnType<typeof compileBriefWithSpecKit> | undefined;

  if (hasSpecKit) {
    const orientation = orientWithState(dag);
    specKitResult = compileBriefWithSpecKit(brief, dag.id, repoRoot, orientation);
    outputMarkdown = specKitResult.merged;
  }

  recordTrail({
    ts: new Date().toISOString(), cmd: 'compile-brief', note,
    repo: basename(repoRoot), position: [nodeId], level: -1, dagId: dag.id,
    detail: { nodeId, produces: brief.whatYouProduce.length, consumes: brief.whatYouConsume.length, specKit: hasSpecKit },
  });

  // Output markdown by default
  const asJson = args.includes('--json');
  if (asJson) {
    json(specKitResult ? { ...brief, specKit: specKitResult.specKit, markdown: outputMarkdown } : brief);
  } else {
    console.log(outputMarkdown);
  }
}

await main();
