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
import type { SpecConfig, SpecIR, SpecIRTask, SpecInput } from '../src/lib/intake/spec-ir.ts';
import { enrichIntentGate } from '../src/lib/intent/intent-gate-enrichment.ts';
import { loadCompletions, getCompletedNodeIds } from '../src/lib/completion/completion-tracker.ts';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';
import { saveCompletionWithEvidence, loadCompletionsWithEvidence, hasPassingReceipt } from '../src/lib/evidence/completion-evidence.ts';
import type { EvidenceRecord } from '../src/lib/evidence/completion-evidence.ts';
import { buildScaffold } from '../src/lib/scaffold.ts';
import { buildGallery } from '../src/lib/gallery-templates/index.ts';
import { validateTerminalIntentGate, validateInitIntentGate, findInitBoundary } from '../src/lib/validate-dag.ts';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import { writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit } from '../src/lib/intake/spec-origin.ts';
import { requireValidOrigin, checkSpecDrift } from '../src/lib/intake/runtime-gate.ts';
import type { SpecOrigin, SpecImportReceipt } from '../src/lib/intake/spec-origin.ts';
import { insertNode, removeNode, modifyNode, commitMutation, loadMutationLog, MutationError } from '../src/lib/dag-mutator.ts';
import { listNodeReceipts, completionDoctor, completionCompact } from '../src/lib/receipts-ux.ts';
import { readPackageVersion } from '../src/lib/install-skills.ts';
import { loadDAGWithAutoMerge, ensureIndexExists } from '../src/lib/roadmap/cli-auto-merge.ts';
import { ensureConsolidated } from '../src/lib/roadmap/cli-consolidation-init.ts';
import { saveDagHead, migrateSingleHead } from '../src/lib/multi-dag.ts';
import { getBrief } from '../src/lib/brief.ts';
import { writeNodeCache } from '../src/lib/brief-cache.ts';
import { validateTerminalAudit, type AuditResponse, type TerminalAuditResult } from '../src/lib/terminal-audit/validator.ts';
import type { FinalHandoff, InterimHandoff } from '../src/lib/brief.ts';
import { saveFinal, saveInterim } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { Graph, Orientation } from '../src/protocol.ts';
import type { SiblingStatus } from '../src/lib/cross-orient.ts';
import type { OrientV1, OrientDag, OrientDagNode, OrientDagEdge, OrientBlockedNode } from '../src/lib/core/orient-schema.ts';
import { emit, emitError, parseOutputOpts, ErrorCode, type OutputFormat, type RenderV1 } from '../src/lib/cli-envelope.ts';
import { render, renderDagLayers, type RenderOpts, type RenderModel, type RenderOutput, type DagLayer, type DagNode } from '../src/lib/render/index.ts';
import { resolveWidth } from '../src/lib/render/layout.ts';
import { renderOrient, renderPlanGallery, renderPlanSelect, renderPlanStatus } from '../src/lib/cli-human.ts';
import type { OrientData, GalleryData, PlanSelectData, PlanStatusData } from '../src/lib/cli-human.ts';
import { lookupSchema, listCommands, schemaToJsonSchema } from '../src/lib/schemas.ts';
import { getMakeInvariants } from '../src/lib/api-invariants.ts';

const rawArgs = process.argv.slice(2);
const repoRoot = process.cwd();

// --- GitSafe enforcement ---
const gitsafe = createGitSafeLoader(repoRoot);

/** Read the `goal` block from whichever *-spec.json has a matching dag_id. Returns null if not found. */
function loadSpecGoal(dagId: string): { statement: string; satisfied_when?: string; known_remaining?: string[] } | null {
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) return null;
  try {
    for (const file of readdirSync(roadmapDir)) {
      if (!file.endsWith('-spec.json') || file === 'spec-origin.json') continue;
      try {
        const spec = JSON.parse(readFileSync(join(roadmapDir, file), 'utf-8'));
        if (spec?.dag_id === dagId && spec?.goal && typeof spec.goal.statement === 'string') {
          return spec.goal;
        }
      } catch { /* skip */ }
    }
  } catch { /* roadmap dir unreadable */ }
  return null;
}

function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function isWorktree(): boolean {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
    return gitDir.includes('worktrees');
  } catch {
    return false;
  }
}

function enforceMainBranch(): void {
  // Worktrees are isolated execution contexts — exempt from main-branch requirement
  if (isWorktree()) {
    return;
  }

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

// Known commands — reject unknown before checking --note
const KNOWN_COMMANDS = new Set(['orient', 'advance', 'make', 'status', 'spec', 'dag', 'api', 'help', '--help', '-h']);
if (!KNOWN_COMMANDS.has(cmd)) {
  const available = listCommands().map(c => c.command);
  emit({ ok: false, cmd: _outputOpts.cmd, error: {
    code: 'UNKNOWN_COMMAND',
    message: `Unknown command: ${cmd}`,
    fix: [`Mainline: {make, orient, advance, status}. Group: {spec, dag}. Discovery: {api, help}.`],
    hint: `Run 'roadmap api --all' to see full command registry with schemas.`,
    available,
  }}, _outputOpts);
  recordTrailError(cmd, 'UNKNOWN_COMMAND', `Unknown command: ${cmd}`);
  process.exit(1);
}

// Handle --help for any known command before the --note gate
if (args.slice(1).some(a => a === '--help' || a === '-h')) {
  showCommandHelp();
  process.exit(0);
}

// Commands that don't require a note
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'spec', 'dag', 'api']);
const isOrientCheck = (cmd === 'orient') && args.includes('--check');
if (isOrientCheck) {
  NOTE_EXEMPT.add('orient');
}

if (!NOTE_EXEMPT.has(cmd) && !isOrientCheck && !_note) {
  json({ error: 'Missing --note "reason"', fix: `roadmap ${cmd} --note "why you are running this"` });
  recordTrailError(cmd, 'MISSING_NOTE', 'Missing --note argument');
  process.exit(1);
}

// Detect if this repo has a DAG
let hasLocalDAG = false;
try {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const headsDir = join(repoRoot, '.roadmap', 'heads');
  hasLocalDAG = existsSync(headPath) || (existsSync(headsDir) && readdirSync(headsDir).some(f => f.endsWith('.json')));
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
let _roadmapSha: string | undefined;
function getRoadmapSha(): string | undefined {
  if (_roadmapSha !== undefined) return _roadmapSha || undefined;
  try {
    const binDir = dirname(new URL(import.meta.url).pathname);
    const pkgDir = resolve(binDir, '..');
    _roadmapSha = execSync('git rev-parse --short HEAD', { cwd: pkgDir, encoding: 'utf-8' }).trim();
  } catch { _roadmapSha = ''; }
  return _roadmapSha || undefined;
}

function stampEntry(entry: any): any {
  const sha = getRoadmapSha();
  return sha ? { ...entry, roadmapSha: sha } : entry;
}

function appendToTrailFiles(stamped: any) {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  appendFileSync(trailPath, JSON.stringify(stamped) + '\n', 'utf-8');

  const globalTrailPath = join(homedir(), '.roadmap', 'trail.jsonl');
  const globalDir = join(homedir(), '.roadmap');
  if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
  appendFileSync(globalTrailPath, JSON.stringify(stamped) + '\n', 'utf-8');
}

function recordTrail(entry: any) {
  appendToTrailFiles(stampEntry(entry));
}

function recordTrailError(cmd: string, code: string, message: string, note?: string) {
  try {
    appendToTrailFiles(stampEntry({
      ts: new Date().toISOString(),
      type: 'error',
      cmd,
      code,
      message,
      note: note ?? '',
      repo: basename(repoRoot),
    }));
  } catch { /* trail write must never crash the CLI */ }
}

// --- Schema key derivation (maps cmd + subcmd to schemas registry key) ---
function deriveSchemaKey(): string {
  if (cmd === 'dag' && args[1]) return `dag.${args[1]}`;
  if (cmd === 'spec' && args[1]) return `spec.${args[1]}`;
  return cmd;
}

/** Build schema + example fields for a given schema key. Returns empty object if no schema registered. */
function schemaFields(key: string): { schema?: object; example?: object } {
  const s = lookupSchema(key);
  if (!s?.input) return {};
  const result: { schema?: object; example?: object } = { schema: schemaToJsonSchema(s.input) };
  if (s.examples?.[0]?.input) result.example = s.examples[0].input;
  return result;
}

// --- Async section ---
async function crossOrientWithState(dag: Graph<string>) {
  const completion = CompletionStore.loadOrEmpty(repoRoot);
  const retired = retiredSet();

  // Filter completion records by current DAG ID to avoid cross-DAG leakage
  const dagFiltered = completion.filterByDagId(dag.id);

  const pos = orient(dag, dagFiltered, retired);

  // Recompute remaining based on filtered completion store (DAG-scoped)
  const allNodeIds = Object.keys(dag.nodes);
  const remainingIds = allNodeIds.filter(nid => !retired.has(nid) && !dagFiltered.hasPassing(nid));

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
  const BRANCH_EXEMPT = new Set(['help', '--help', '-h', 'api', 'orient', 'advance', 'status', 'spec']);
  // --dry-run flag exempts make from branch enforcement
  if (!BRANCH_EXEMPT.has(cmd) && !(cmd === 'make' && args.includes('--dry-run'))) {
    enforceMainBranch();
  }

  try {
    // Route to core commands or group handlers
    await routeCommand(cmd, note);
  } catch (e) {
    if (e instanceof RoadmapError) {
      const rej = e.toJSON();
      const code = rej.code ?? ErrorCode.INTERNAL_ERROR;
      const message = rej.message ?? String(e);
      recordTrailError(cmd, code, message, note);

      // Centralized schema attachment: enrich VALIDATION_FAILED errors with schema + example
      // Forward all context fields to CLI output (no silent drops)
      const { fix: ctxFix, ...restContext } = rej.context ?? {};
      const errorPayload: import('../src/lib/cli-envelope.ts').CliError = {
        code, message,
        fix: ctxFix ? [ctxFix] : undefined,
        ...restContext,
      };
      if (code === 'VALIDATION_FAILED') {
        Object.assign(errorPayload, schemaFields(deriveSchemaKey()));
        const apiTarget = deriveSchemaKey();
        (errorPayload as any).hint = `Run 'roadmap api ${apiTarget}' to see full schema, invariants, and skip flags.`;
      }

      emit({ ok: false, cmd: _outputOpts.cmd, error: errorPayload }, _outputOpts);
      process.exit(1);
    } else {
      const message = e instanceof Error ? e.message : String(e);
      recordTrailError(cmd, ErrorCode.INTERNAL_ERROR, message, note);
      emit({ ok: false, cmd: _outputOpts.cmd, error: { code: ErrorCode.INTERNAL_ERROR, message } }, _outputOpts);
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
    case 'status':    return await cmdStatus(note);
    // Spec pipeline
    case 'spec':      return await cmdSpecGroup(note);

    // DAG mutation group
    case 'dag':       return await cmdDagGroup(note);

    // Schema discovery
    case 'api':       return cmdApi();

    // Help & unknown
    case 'help':
    case '--help':
    case '-h':        return cmdHelp();
    default:
      // Unreachable — KNOWN_COMMANDS gate above catches unknown commands
      json({ error: `Unknown command: ${cmd}`, fix: `Mainline: {make, orient, advance, status}. Group: {spec, dag}. Discovery: {api, help}.` });
      process.exit(1);
  }
}

// --- Commands ---

async function cmdOrient(note: string | undefined) {
  // Migrate single head.json to heads/ if needed
  migrateSingleHead(repoRoot);

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

  // Runtime origin gate: reject DAGs without valid spec origin
  const origin = requireValidOrigin(repoRoot);
  const drift = checkSpecDrift(repoRoot);

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

  // Build per-node briefs for batch position
  const briefs: Record<string, any> = {};
  for (const nodeId of nextPosition) {
    try {
      briefs[nodeId] = await getBrief(dag, nodeId, repoRoot);
    } catch {
      // Brief generation is best-effort
    }
    // Surface intent gate requirements so agents know what advance will need
    const node = (dag.nodes as any)[nodeId];
    if (node) {
      const intentRules = (node.validate ?? []).filter((r: any) => r.type === 'intent');
      if (intentRules.length > 0) {
        const templates = intentRules.map((r: any) => {
          const t: any = {
            statement: r.statement,
            confidence: r.confidence,
            reasoning: '<one paragraph: does the completed work satisfy this intent?>',
          };
          if (r.prompt && r.prompt.length > 0) {
            t.promptAnswers = r.prompt.map((p: string) => `<YOUR ANSWER TO: ${p.split('\n')[0]}>`);
          }
          return t;
        });
        if (!briefs[nodeId]) briefs[nodeId] = {};
        briefs[nodeId].intentGate = {
          hint: 'This node has an intent gate. When you advance, pass --evaluate-file <path> with a JSON file containing:',
          template: templates,
          prompts: intentRules.flatMap((r: any) => r.prompt ?? []),
        };
      }
    }
  }

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
    branch: getCurrentBranch(),
    worktree: isWorktree(),
    briefs,
  };

  // When DAG is complete, surface unloaded specs as next action
  if (result.complete) {
    const { scanPendingSpecs } = await import('../src/lib/orient-forward.ts');
    const dagId = dag.id ?? '';
    const pending = scanPendingSpecs(repoRoot, dagId);
    if (pending.length > 0) {
      result.pendingSpecs = pending;
      result.nextAction = `Load next spec: roadmap make ${pending[0].path} --note "..."`;
    }
  }

  // Include spec drift warning if detected
  if (drift.drifted) {
    result.specDrift = { drifted: true, message: drift.message };
  }

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

// --- advance: complete node(s) + move to next batch ---
// `advance <node-id>` — run validators, record evidence, advance if batch done
// `advance` (no arg) — check batch complete, move to next batch
async function cmdAdvance(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap spec plan --gallery --note "..."' });
    process.exit(1);
    return;
  }

  requireValidOrigin(repoRoot);

  const dag = await loadDAGAsync();
  const nodeId = args[1]; // optional: advance <node-id>

  if (nodeId) {
    return await advanceNode(dag, nodeId, note);
  }
  return await advanceBatchCmd(dag, note);
}

// Complete a single node: run validators, record evidence
async function advanceNode(dag: Graph<string>, nodeId: string, note: string) {
  const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
  if (!node) {
    json({ error: `Node not found: ${nodeId}`, fix: `Check node IDs with: roadmap orient --note "..."` });
    process.exit(1);
    return;
  }

  // Check node is in current batch or remaining
  const pos = await crossOrientWithState(dag);
  if (!pos.batchRemaining.includes(nodeId) && !pos.position.includes(nodeId)) {
    json({
      error: `Node ${nodeId} is not in current batch`,
      currentBatch: pos.position,
      remaining: pos.batchRemaining,
      fix: 'Can only advance nodes in the current batch',
    });
    process.exit(1);
    return;
  }

  // Parse --evaluate or --evaluate-file for intent judgments
  const evalIdx = args.indexOf('--evaluate');
  const evalFileIdx = args.indexOf('--evaluate-file');
  let intentJudgments: import('../src/protocol.ts').IntentJudgment[] | undefined;
  if (evalFileIdx !== -1 && args[evalFileIdx + 1]) {
    const evalPath = resolve(repoRoot, args[evalFileIdx + 1]);
    if (!existsSync(evalPath)) {
      json({ error: `--evaluate-file not found: ${evalPath}`, fix: 'Provide path to a JSON file containing intent judgments array' });
      process.exit(1);
      return;
    }
    try {
      intentJudgments = JSON.parse(readFileSync(evalPath, 'utf-8'));
    } catch {
      json({ error: `Invalid JSON in --evaluate-file: ${evalPath}`, fix: 'File must contain a valid JSON array of IntentJudgment objects' });
      process.exit(1);
      return;
    }
  } else if (evalIdx !== -1 && args[evalIdx + 1]) {
    try {
      intentJudgments = JSON.parse(args[evalIdx + 1]);
    } catch {
      json({ error: 'Invalid --evaluate JSON', fix: 'Pass valid JSON array: --evaluate \'[...]\' or use --evaluate-file <path>' });
      process.exit(1);
      return;
    }
  }

  // Run validators via unified validation function
  const existsPredicate = (artifact: string) => existsSync(join(repoRoot, artifact));
  const validationResult = await validateNode(dag, nodeId, existsPredicate, {
    repoRoot,
    branch: getCurrentBranch(),
    intentJudgments,
  });

  // Map ValidationCheck to EvidenceRecord format
  // Intent validators get enriched evidence (not rubber-stamped "unevaluated")
  const checks: EvidenceRecord[] = validationResult.checks.map(c => {
    const ruleKey = c.rule.type === 'artifact-exists'
      ? `artifact-exists:${(c.rule.target ?? c.rule.path) || 'produces'}`
      : c.rule.type === 'shell'
      ? `shell:${((c.rule as any).command ?? (c.rule as any).argv?.join(' ') ?? 'unknown')}`
      : c.rule.type === 'intent'
      ? `intent:${c.rule.statement?.slice(0, 60) || 'ok'}`
      : `${c.rule.type}:${(c.rule as any).target || (c.rule as any).command || 'unknown'}`;

    // For unevaluated intents, validation.ts already emits a template with --evaluate-file instructions.
    // Pass it through as-is so agents see the concrete JSON template.
    let evidence = c.evidence ?? (c.passed ? 'passed' : 'failed');

    return { rule: ruleKey, passed: c.passed, evidence };
  });

  // Also check produces artifacts (separate from validate rules)
  const produces = node.produces ?? [];
  for (const artifact of produces) {
    const fullPath = join(repoRoot, artifact);
    const artifactExists = existsSync(fullPath);
    checks.push({
      rule: `artifact-exists:${artifact}`,
      passed: artifactExists,
      evidence: artifactExists ? 'file exists' : 'file missing',
    });
  }

  const allPassed = validationResult.passed && checks.every(c => c.passed);

  if (!allPassed) {
    // Write interim handoff on failure
    const failedChecks = checks.filter(c => !c.passed);
    const interim: InterimHandoff = {
      timestamp: new Date().toISOString(),
      progress: 0.5,
      discovered: [],
      blockers: failedChecks.map(c => c.rule),
      currentFile: '',
    };
    try {
      await saveInterim(repoRoot, nodeId, interim);
    } catch (e) {
      // Log but don't block on handoff write failure
    }

    json({
      error: `Validation failed for ${nodeId}`,
      checks,
      fix: 'Fix failing validators and retry',
    });
    recordTrailError('advance', 'VALIDATION_FAILED', `Node ${nodeId}: ${checks.filter(c => !c.passed).map(c => c.rule).join(', ')}`, note);
    process.exit(1);
    return;
  }

  // Terminal audit gate: for terminal nodes, run computed+detected audit
  let terminalAuditResult: TerminalAuditResult | undefined;
  if (nodeId === dag.term) {
    const auditRecords = loadCompletionsWithEvidence(repoRoot);
    const changedFiles = getBranchChangedFiles(repoRoot);
    const existsPredicate = (artifact: string) => existsSync(join(repoRoot, artifact));

    // Parse --evaluate-file as AuditResponse[] if it looks like audit responses
    let auditResponses: AuditResponse[] | undefined;
    if (intentJudgments && Array.isArray(intentJudgments) && intentJudgments.length > 0) {
      const first = intentJudgments[0] as any;
      if (first.promptId && typeof first.answer === 'string') {
        auditResponses = intentJudgments as unknown as AuditResponse[];
        intentJudgments = undefined; // consumed as audit responses, not intent judgments
      }
    }

    terminalAuditResult = validateTerminalAudit(dag, auditRecords, existsPredicate, changedFiles, auditResponses);

    if (!terminalAuditResult.passed) {
      // Return context packet so agent knows what to address
      const contextPacket: any = {
        error: `Terminal audit: ${terminalAuditResult.reason}`,
        terminalAudit: {
          computed: terminalAuditResult.computed,
          detected: terminalAuditResult.detected.summary,
          prompts: terminalAuditResult.prompts,
        },
        fix: terminalAuditResult.prompts.length > 0
          ? 'Write a JSON file with audit responses and pass via --evaluate-file <path>. Format: [{"promptId":"gap-0-...","answer":"..."},...]'
          : 'Fix detected gaps and retry',
        checks,
      };
      emit({ ok: false, cmd: _outputOpts.cmd, error: contextPacket }, _outputOpts);
      recordTrailError('advance', 'TERMINAL_AUDIT_FAILED', `Node ${nodeId}: ${terminalAuditResult.reason}`, note);
      process.exit(1);
      return;
    }
  }

  // Attribution safety: warn if branch has changes outside this node's produces
  const attributionWarning = checkAttribution(repoRoot, produces);

  // Parallel-edit guard: warn if another agent advanced on same branch within 60s
  let parallelEditWarning: string | undefined;
  try {
    const completion = CompletionStore.loadOrEmpty(repoRoot);
    const currentBranch = getCurrentBranch();
    const now = Date.now();
    const sixtySecsAgo = now - (60 * 1000);

    // Check for other agents' recent advances on same branch
    for (const [id, record] of completion.allIds().entries()) {
      if (id === nodeId) continue; // skip self
      const rec = completion.record(id);
      if (!rec || !rec.branch || rec.branch !== currentBranch) continue;

      const completedTime = new Date(rec.completedAt).getTime();
      if (completedTime > sixtySecsAgo) {
        parallelEditWarning = `Concurrent edits detected: ${id} completed ${Math.round((now - completedTime) / 1000)}s ago on same branch. Recommend using worktree isolation for parallel agents.`;
        break;
      }
    }
  } catch {
    // If completion check fails, continue silently
  }

  // Record completion with evidence
  saveCompletionWithEvidence(repoRoot, nodeId, checks);

  // Write final handoff on success
  const final: FinalHandoff = {
    timestamp: new Date().toISOString(),
    progress: 1.0,
    discovered: [],
    blockers: [],
    currentFile: '',
    summary: note ? note.slice(0, 100) : 'Node completed',
    keyDecisions: [],
    gotchas: [],
    nextNodeEntry: {
      consumes: node.produces ?? [],
      ready: true,
    },
  };
  try {
    await saveFinal(repoRoot, nodeId, final);
  } catch (e) {
    // Log but don't block on handoff write failure
  }

  // Re-orient to check if batch is now complete
  const newPos = await crossOrientWithState(dag);

  // Extract intent gates as structured prompts (not rubber stamps)
  const intentGates: Array<{
    statement: string;
    nodeDescription: string;
    produces: string[];
    shellEvidence: Array<{ command: string; passed: boolean; evidence: string }>;
    artifactEvidence: Array<{ artifact: string; exists: boolean }>;
    assessmentPrompt: string;
  }> = [];
  for (const c of validationResult.checks) {
    if (c.rule.type === 'intent') {
      const statement = (c.rule as any).statement ?? '';
      const shellEvidence = validationResult.checks
        .filter(sc => sc.rule.type === 'shell')
        .map(sc => ({
          command: (sc.rule as any).command ?? (sc.rule as any).argv?.join(' ') ?? 'unknown',
          passed: sc.passed,
          evidence: sc.evidence ?? (sc.passed ? 'exit 0' : 'failed'),
        }));
      const artifactEvidence = (node.produces ?? []).map((a: string) => ({
        artifact: a,
        exists: existsSync(join(repoRoot, a)),
      }));
      const passCount = shellEvidence.filter(s => s.passed).length;
      const artifactCount = artifactEvidence.filter((a: { artifact: string; exists: boolean }) => a.exists).length;
      intentGates.push({
        statement,
        nodeDescription: node.desc ?? '',
        produces: node.produces ?? [],
        shellEvidence,
        artifactEvidence,
        assessmentPrompt: [
          `INTENT: "${statement}"`,
          `Node ${nodeId}: ${node.desc ?? ''}`,
          `Shell validators: ${passCount}/${shellEvidence.length} passing`,
          `Artifacts: ${artifactCount}/${artifactEvidence.length} present`,
          shellEvidence.length > 0
            ? `Commands run: ${shellEvidence.map(s => `${s.command} → ${s.passed ? 'PASS' : 'FAIL'}`).join('; ')}`
            : 'No shell validators configured',
          `Does the completed work satisfy this intent?`,
        ].join('\n'),
      });
    }
  }

  const result: any = {
    completed: nodeId,
    checks,
    batchComplete: newPos.batchComplete,
    remaining: newPos.batchRemaining,
    ...(intentGates.length > 0 ? { intentGates } : {}),
    ...(terminalAuditResult ? { terminalAudit: { computed: terminalAuditResult.computed, detected: terminalAuditResult.detected.summary, passed: true } } : {}),
    ...(attributionWarning ? { attributionWarning } : {}),
    ...(parallelEditWarning ? { parallelEditWarning } : {}),
  };

  // Cache convention fingerprint for backward cone assembly.
  // Non-blocking: failure is a warning, not an error.
  try {
    writeNodeCache(nodeId, dag, repoRoot);
  } catch {
    // Cache write is best-effort
  }

  // Include next node's brief if batch has remaining work
  if (newPos.batchRemaining.length > 0) {
    try {
      result.nextBrief = await getBrief(dag, newPos.batchRemaining[0], repoRoot);
    } catch {
      // Brief generation is best-effort
    }
  }

  // If batch is now complete, auto-advance
  if (newPos.batchComplete) {
    const completion = CompletionStore.loadOrEmpty(repoRoot);
    const next = advanceBatch(dag, completion, retiredSet());
    if (!next || next.position.length === 0) {
      result.advanced = true;
      result.done = true;
      result.message = 'All work complete';
      const goal = loadSpecGoal(dag.id ?? '');
      if (goal) {
        result.goalAssessment = {
          goal: goal.statement,
          ...(goal.satisfied_when ? { satisfiedWhen: goal.satisfied_when } : {}),
          ...(goal.known_remaining?.length ? { knownRemaining: goal.known_remaining } : {}),
          requiredAction: 'Assess whether the goal is satisfied before closing session. Surface any known_remaining items to the user.',
        };
      }
    } else {
      result.advanced = true;
      result.nextPosition = next.position;
      result.nextLevel = next.level;
      result.nextProduces = next.produces;
      result.nextConsumes = next.consumes;
      // Include brief for first node of next batch
      try {
        result.nextBrief = await getBrief(dag, next.position[0], repoRoot);
      } catch {
        // Brief generation is best-effort
      }
    }
  }

  emit({ ok: true, cmd: _outputOpts.cmd, data: result }, _outputOpts);

  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'advance',
    note,
    repo: basename(repoRoot),
    position: newPos.position,
    level: newPos.level,
    detail: { completed: nodeId, checks: checks.length, passed: allPassed },
  });
}

// Move to next batch (requires all nodes in current batch completed)
async function advanceBatchCmd(dag: Graph<string>, note: string) {
  const pos = await crossOrientWithState(dag);

  if (!pos.batchComplete) {
    json({
      error: 'Batch not complete',
      remaining: pos.batchRemaining.length,
      nodes: pos.batchRemaining,
      fix: `Complete nodes: ${pos.batchRemaining.map(n => `roadmap advance ${n} --note "..."`).join(', ')}`,
    });
    process.exit(1);
    return;
  }

  const completion = CompletionStore.loadOrEmpty(repoRoot);

  // Verify all completion records exist
  for (const nodeId of pos.position) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;
    const produces = node.produces ?? [];
    if (!completion.hasPassing(nodeId) && produces.length > 0) {
      json({
        error: `Missing completion evidence for ${nodeId}`,
        produces,
        fix: `Record completion: roadmap advance ${nodeId} --note "..."`,
      });
      process.exit(1);
      return;
    }
  }

  const next = advanceBatch(dag, completion, retiredSet());

  if (!next || next.position.length === 0) {
    const goal = loadSpecGoal(dag.id ?? '');
    const goalAssessment = goal ? {
      goal: goal.statement,
      ...(goal.satisfied_when ? { satisfiedWhen: goal.satisfied_when } : {}),
      ...(goal.known_remaining?.length ? { knownRemaining: goal.known_remaining } : {}),
      requiredAction: 'Assess whether the goal is satisfied before closing session. Surface any known_remaining items to the user.',
    } : undefined;
    emit({ ok: true, cmd: _outputOpts.cmd, data: {
      advanced: true, level: pos.level + 1, position: [], message: 'All work complete', done: true,
      ...(goalAssessment ? { goalAssessment } : {}),
    }}, _outputOpts);

    recordTrail({
      ts: new Date().toISOString(), cmd: 'advance', note, repo: basename(repoRoot),
      position: [], level: pos.level + 1, detail: { done: true },
    });
    return;
  }

  emit({ ok: true, cmd: _outputOpts.cmd, data: {
    advanced: true, previousLevel: pos.level, level: next.level,
    position: next.position, batchRemaining: next.batchRemaining,
    produces: next.produces, consumes: next.consumes,
  }}, _outputOpts);

  recordTrail({
    ts: new Date().toISOString(), cmd: 'advance', note, repo: basename(repoRoot),
    position: next.position, level: next.level,
  });
}

// Check if branch has uncommitted/untracked changes outside node's produces
function checkAttribution(root: string, produces: string[]): string | undefined {
  try {
    // Get all modified/untracked files
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (!status) return undefined;

    const changedFiles = status.split('\n')
      .map(line => line.slice(3).trim())  // strip status prefix
      .filter(f => f.length > 0);

    const producesSet = new Set(produces.map(p => (p.startsWith('/') ? p.slice(1) : p)));
    const outsideFiles = changedFiles.filter(f => !producesSet.has(f) && !f.startsWith('.roadmap/'));

    if (outsideFiles.length > 0) {
      return `Branch has ${outsideFiles.length} changed file(s) outside this node's produces: ${outsideFiles.slice(0, 5).join(', ')}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// Get all files changed on the current branch relative to main/master
function getBranchChangedFiles(root: string): string[] {
  try {
    // Try main, then master as base
    let base = 'main';
    try { execSync(`git rev-parse --verify ${base}`, { cwd: root, stdio: 'pipe' }); }
    catch { base = 'master'; }
    const diff = execSync(`git diff --name-only ${base}...HEAD`, { cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return diff ? diff.split('\n').filter(f => f.length > 0) : [];
  } catch {
    // Fallback: uncommitted changes only
    try {
      const status = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return status ? status.split('\n').filter(f => f.length > 0) : [];
    } catch { return []; }
  }
}

// Normalize compile_hash to sha256 hex format
function normalizeHash(input: string): string {
  if (/^[a-f0-9]{64}$/.test(input)) return input;
  return createHash('sha256').update(input).digest('hex');
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

  // Validate required spec fields — collect all errors before throwing
  const specErrors: Array<{ gate: string; message: string; fix: string }> = [];
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "tasks" array', fix: 'Spec must have a "tasks" array. Use: roadmap spec plan --from <requirements.md>' });
  }
  if (!parsed.metadata || typeof parsed.metadata !== 'object') {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "metadata" object', fix: 'Spec must have a "metadata" object with "generated" and "compile_hash". Use the spec pipeline.' });
  }
  if (!parsed.schema_version) {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "schema_version"', fix: 'Spec must have "schema_version". Use the spec pipeline to generate a valid spec.' });
  }
  if (specErrors.length > 0) {
    throw new RoadmapError('VALIDATION_FAILED', {
      errors: specErrors,
      fix: specErrors.map(e => `[${e.gate}] ${e.fix}`).join('\n'),
    }, `${specErrors.length} spec structure error(s) found`);
  }

  // Input artifact verification (skip with --skip-input-verification)
  if (!args.includes('--skip-input-verification')) {
    if (!Array.isArray(parsed.inputs) || parsed.inputs.length === 0) {
      throw new RoadmapError('VALIDATION_FAILED', {
        fix: [
          'Spec must have a non-empty "inputs" array listing source files.',
          'Each entry: { path: "<file>", sha256: "<hash>", role: "spec"|"tasks"|"plan"|... }',
          'At least one input must have role "spec", "tasks", or "plan".',
        ].join('\n'),
      }, 'Invalid spec: missing or empty "inputs" array');
    }

    // Validate structure of each input
    for (const inp of parsed.inputs) {
      if (!inp || typeof inp !== 'object' || !inp.path || !inp.sha256 || !inp.role) {
        throw new RoadmapError('VALIDATION_FAILED', {
          fix: 'Each input must have: { path: string, sha256: string, role: string }',
          entry: JSON.stringify(inp),
        }, 'Invalid spec: malformed input entry');
      }
    }

    // At least one input must have a spec-like role
    const specRoles = new Set(['spec', 'tasks', 'plan']);
    const hasSpecRole = parsed.inputs.some((inp: any) => specRoles.has(inp.role));
    if (!hasSpecRole) {
      throw new RoadmapError('VALIDATION_FAILED', {
        fix: 'At least one input must have role "spec", "tasks", or "plan".',
        roles: parsed.inputs.map((inp: any) => inp.role),
      }, 'Invalid spec: no input with spec/tasks/plan role');
    }

    // Verify sha256 for inputs that exist on disk
    const warnings: string[] = [];
    const rehashes: string[] = [];
    for (const inp of parsed.inputs) {
      const inputPath = resolve(repoRoot, inp.path);
      if (!existsSync(inputPath)) {
        warnings.push(`input not found (skipped): ${inp.path}`);
        continue;
      }
      const content = readFileSync(inputPath, 'utf-8');
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== inp.sha256) {
        if (args.includes('--rehash')) {
          inp.sha256 = actual;
          rehashes.push(`${inp.path}: updated hash to ${actual}`);
        } else {
          throw new RoadmapError('VALIDATION_FAILED', {
            fix: `Input "${inp.path}" hash mismatch. Expected ${inp.sha256}, got ${actual}. Use --rehash to auto-update.`,
          }, `Input hash mismatch for ${inp.path}`);
        }
      }
    }

    if (warnings.length > 0) {
      // Attach warnings to output (non-fatal)
      (parsed as any)._inputWarnings = warnings;
    }

    if (rehashes.length > 0) {
      // Write updated spec back to the original file
      writeFileSync(resolved, JSON.stringify(parsed, null, 2) + '\n');
      (parsed as any)._rehashed = rehashes;
    }
  }

  // Normalize spec tasks → ParsedTask shape before conversion.
  // Spec JSON may use `deps` (short form) vs `depends` (ParsedTask field),
  // and may omit `priority` and `mode` which tasksToDAG requires.
  // Also propagate spec-level inputs[] as ambient references so spec source
  // documents are discoverable at orient time via the brief slice.
  const specAmbient = Array.isArray(parsed.inputs)
    ? parsed.inputs.map((inp: any) => inp.path).filter(Boolean)
    : [];
  const normalizedTasks = (parsed.tasks as any[]).map((t: any, i: number) => ({
    ...t,
    depends: t.depends ?? t.deps ?? [],
    priority: t.priority ?? i,
    mode: t.mode ?? 'execute',
    desc: t.desc ?? t.description ?? '',
    ambient: [...(t.ambient ?? []), ...specAmbient],
  }));

  // Convert spec to DAG
  let dag: any;
  try {
    dag = tasksToDAG(normalizedTasks, { dagId: parsed.dag_id ?? parsed.id ?? 'ideal-dag', dagDesc: parsed.dag_desc });
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec conforms to SpecIR format',
    }, `Failed to convert spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Validate the DAG — collect all errors before reporting
  const isDryRun = args.includes('--dry-run');
  const allErrors = collectMakeErrors(dag, { skipTerminalIntent: args.includes('--skip-terminal-intent') });
  const errors = allErrors.filter((e: any) => e.severity !== 'warning');
  const warnings = allErrors.filter((e: any) => e.severity === 'warning');
  if (errors.length > 0) {
    if (isDryRun) {
      json({
        ok: false,
        dryRun: true,
        errors,
        warnings,
        message: `${errors.length} validation error(s) found`,
      });
      return;
    }
    throw new RoadmapError('VALIDATION_FAILED', {
      errors,
      warnings,
      fix: errors.map(e => `[${e.gate}] ${e.fix}`).join('\n'),
    }, `${errors.length} validation error(s) found`);
  }

  // Dry run: return validation result without side effects
  if (isDryRun) {
    const pos = await crossOrientWithState(dag);
    json({
      ok: true,
      dryRun: true,
      dag: dag,
      position: pos.position,
      level: pos.level,
      errors: [],
      message: 'Dry run: spec validates successfully (no files written)',
    });
    return;
  }

  // Write to head.json
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');

  // Also write to heads/ for multi-dag support
  const dagId = dag.id ?? parsed.dag_id ?? parsed.id ?? 'ideal-dag';
  saveDagHead(repoRoot, dagId, dag);

  // Write spec-origin receipt for provenance tracking
  const dagJson = JSON.stringify(dag);
  const dagHash = createHash('sha256').update(dagJson).digest('hex');
  const specHash = createHash('sha256').update(specContent).digest('hex');

  // Auto-compute compile_hash from tasks if missing or set to 'auto'
  let compileHash = parsed.metadata?.compile_hash;
  if (!compileHash || compileHash === 'auto') {
    const tasksJson = JSON.stringify(parsed.tasks || []);
    compileHash = createHash('sha256').update(tasksJson).digest('hex');
  }

  const origin: SpecOrigin = {
    schemaVersion: 1,
    engine: parsed.engine?.name ?? 'spec-kit',
    version: parsed.engine?.version ?? '0.0.0',
    compile_hash: compileHash,
    spec_sha: specHash,
    importedAt: new Date().toISOString(),
    dagId,
  };
  writeSpecOrigin(repoRoot, origin);

  // Commit
  let commitWarning: string | undefined;
  try {
    execSync('git add .roadmap/head.json .roadmap/heads/ .roadmap/spec-origin.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "make: ideal DAG from ${specPath}"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch (e: any) {
    const stderr = e.stderr?.toString().trim() || e.message || 'unknown error';
    commitWarning = `Git commit failed (head.json written but uncommitted): ${stderr.slice(0, 200)}`;
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
    ...(commitWarning ? { commitWarning } : {}),
  });
}

async function cmdStatus(note: string | undefined) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Run `roadmap make <spec.json>`' });
    return;
  }

  const dag = await loadDAGAsync();
  const completion = CompletionStore.loadOrEmpty(repoRoot);
  const pos = await crossOrientWithState(dag);

  // Current batch is in pos.position
  const batchNodeIds = pos.position || [];
  const nodeMap = new Map(
    Object.entries(dag.nodes).map(([id, node]) => [
      id,
      node as any,
    ])
  );

  // Build status for each node in current batch
  const status = batchNodeIds
    .map(nodeId => {
      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const produces = (node.produces as string[]) || [];
      const producesExist = produces.map(p => ({
        file: p,
        exists: existsSync(join(repoRoot, p)),
      }));

      const hasReceipt = completion.hasPassing(nodeId);
      const validators = ((node.validate as any) || []).length;

      return {
        nodeId,
        produces,
        producesExist,
        hasReceipt,
        validators,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  json({
    batch: batchNodeIds,
    nodes: status,
    batchComplete: pos.batchComplete,
    level: pos.level,
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
    case 'migrate':  return await cmdSpecMigrate(note!);
    default:
      json({ error: `Unknown spec subcommand: ${sub}`, fix: 'roadmap spec [plan | migrate] ...', hint: "Run 'roadmap api --all' to see full command registry." });
      process.exit(1);
  }
}

function cmdSpecHelp() {
  json({
    command: 'spec',
    description: 'Spec planning pipeline',
    subcommands: [
      { name: 'plan', args: '[--gallery|select <id>|status]', description: 'Spec planning: gallery, selection, status' },
      { name: 'migrate', args: '<path>', description: 'Auto-fix legacy spec files with missing required fields' },
    ],
    examples: [
      'roadmap spec plan --gallery --note "show gallery"',
      'roadmap spec plan select auth-spec --note "select spec"',
      'roadmap spec plan status',
      'roadmap spec migrate legacy-spec.json --note "fix legacy spec"',
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

// Auto-fix legacy spec files by adding missing required fields
async function cmdSpecMigrate(note: string) {
  const specPath = args[2];

  if (!specPath) {
    json({ error: 'Missing spec path', fix: 'roadmap spec migrate <path> --note "reason"' });
    process.exit(1);
  }

  if (!existsSync(specPath)) {
    json({ error: `Spec file not found: ${specPath}` });
    process.exit(1);
  }

  try {
    const content = readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(content) as any;

    const fixed: string[] = [];

    // Fix: inputs[] — if missing/empty, add with computed sha256
    if (!spec.inputs || !Array.isArray(spec.inputs) || spec.inputs.length === 0) {
      const sha256 = createHash('sha256').update(content).digest('hex');
      spec.inputs = [{ path: specPath, sha256, role: 'spec' }];
      fixed.push('inputs');
    }

    // Fix: metadata.compile_hash — if missing, set to "auto"
    if (!spec.metadata) spec.metadata = {};
    if (!spec.metadata.compile_hash) {
      spec.metadata.compile_hash = 'auto';
      fixed.push('metadata.compile_hash');
    }

    // Fix: metadata.generated — if missing, set to current ISO timestamp
    if (!spec.metadata.generated) {
      spec.metadata.generated = new Date().toISOString();
      fixed.push('metadata.generated');
    }

    // Fix: engine — if missing, add spec-kit v1.0.0
    if (!spec.engine) {
      spec.engine = { name: 'spec-kit', version: '1.0.0', config_hash: null };
      fixed.push('engine');
    }

    // Fix: dag_desc — if missing, copy from first task's desc
    if (!spec.dag_desc && spec.tasks && spec.tasks.length > 0) {
      spec.dag_desc = spec.tasks[0].desc;
      fixed.push('dag_desc');
    }

    // Fix: schema_version — if missing, set to 1
    if (!spec.schema_version) {
      spec.schema_version = 1;
      fixed.push('schema_version');
    }

    // Write fixed spec back to file
    writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'spec.migrate',
      note,
      repo: basename(repoRoot),
      detail: { path: specPath, fixed },
    });

    json({ ok: true, fixed, path: specPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json({ error: `Failed to migrate spec: ${message}`, path: specPath });
    process.exit(1);
  }
}

// --- Spec import/intake/compile/init stubs ---


// --- DAG group ---
async function cmdDagGroup(note: string | undefined) {
  const sub = args[1];
  if (!sub || sub === 'help') {
    console.log(`roadmap dag — DAG mutation commands

  insert   Insert a new node into the DAG
  remove   Remove a node (--cascade to remove dependents)
  modify   Modify an existing node's fields
  log      Show mutation history

All mutations validate the DAG (define/verify/check) before committing.
Provenance receipts are appended to .roadmap/mutations.jsonl.

Examples:
  roadmap dag insert --node '{"id":"x","desc":"...","produces":[],"consumes":[],"deps":["init"]}' --note "why"
  roadmap dag remove my-node --note "why" --cascade
  roadmap dag modify my-node --set '{"desc":"new desc"}' --note "why"
  roadmap dag log
`);
    return;
  }

  if (!note && sub !== 'log') {
    json({ error: 'Missing --note "reason"', fix: `roadmap dag ${sub} --note "why"` });
    process.exit(1);
    return;
  }

  switch (sub) {
    case 'insert': return await cmdDagInsert(note!);
    case 'remove': return await cmdDagRemove(note!);
    case 'modify': return await cmdDagModify(note!);
    case 'log':    return cmdDagLog();
    default:
      json({ error: `Unknown dag subcommand: ${sub}`, fix: 'roadmap dag help', hint: "Run 'roadmap api --all' to see full command registry." });
      process.exit(1);
  }
}

async function cmdDagInsert(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' });
    process.exit(1);
    return;
  }

  // Runtime origin gate
  requireValidOrigin(repoRoot);

  const nodeIdx = args.indexOf('--node');
  if (nodeIdx === -1 || !args[nodeIdx + 1]) {
    json({ error: 'Missing --node', fix: 'roadmap dag insert --node \'{"id":"x","desc":"...","produces":[],"consumes":[],"deps":["y"]}\' --note "why"' });
    process.exit(1);
    return;
  }

  let nodeSpec: any;
  try {
    nodeSpec = JSON.parse(args[nodeIdx + 1]);
  } catch (e) {
    json({ error: 'Invalid JSON for --node', fix: 'Ensure --node value is valid JSON' });
    process.exit(1);
    return;
  }

  if (!nodeSpec.id || !nodeSpec.desc) {
    json({ error: 'Node spec requires at least "id" and "desc"', fix: 'Include id and desc in the node JSON' });
    process.exit(1);
    return;
  }

  const dag = await loadDAGAsync();

  try {
    const { dag: mutated, receipt } = insertNode(dag, nodeSpec, note);
    commitMutation(repoRoot, mutated, receipt);

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'dag.insert',
      note,
      repo: basename(repoRoot),
      detail: { nodeId: nodeSpec.id },
    });

    json({ ok: true, op: 'insert', nodeId: nodeSpec.id, receipt });
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: _outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.insert'),
      }}, _outputOpts);
      process.exit(1);
    }
    throw e;
  }
}

async function cmdDagRemove(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' });
    process.exit(1);
    return;
  }

  // Runtime origin gate
  requireValidOrigin(repoRoot);

  const nodeId = args[2];
  if (!nodeId || nodeId.startsWith('--')) {
    json({ error: 'Missing node-id', fix: 'roadmap dag remove <node-id> --note "why"' });
    process.exit(1);
    return;
  }

  const cascade = args.includes('--cascade');
  const dag = await loadDAGAsync();

  try {
    const { dag: mutated, receipt } = removeNode(dag, nodeId, note, { cascade });
    commitMutation(repoRoot, mutated, receipt);

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'dag.remove',
      note,
      repo: basename(repoRoot),
      detail: { nodeId, cascade },
    });

    json({ ok: true, op: 'remove', nodeId, cascade, receipt });
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: _outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.remove'),
      }}, _outputOpts);
      process.exit(1);
    }
    if (e instanceof Error) {
      json({ error: e.message });
      process.exit(1);
    }
    throw e;
  }
}

async function cmdDagModify(note: string) {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' });
    process.exit(1);
    return;
  }

  // Runtime origin gate
  requireValidOrigin(repoRoot);

  const nodeId = args[2];
  if (!nodeId || nodeId.startsWith('--')) {
    json({ error: 'Missing node-id', fix: 'roadmap dag modify <node-id> --set \'{"desc":"..."}\' --note "why"' });
    process.exit(1);
    return;
  }

  const setIdx = args.indexOf('--set');
  if (setIdx === -1 || !args[setIdx + 1]) {
    json({ error: 'Missing --set', fix: 'roadmap dag modify <node-id> --set \'{"desc":"new desc"}\' --note "why"' });
    process.exit(1);
    return;
  }

  let changes: any;
  try {
    changes = JSON.parse(args[setIdx + 1]);
  } catch {
    json({ error: 'Invalid JSON for --set', fix: 'Ensure --set value is valid JSON' });
    process.exit(1);
    return;
  }

  const dag = await loadDAGAsync();

  try {
    const { dag: mutated, receipt } = modifyNode(dag, nodeId, changes, note);
    commitMutation(repoRoot, mutated, receipt);

    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'dag.modify',
      note,
      repo: basename(repoRoot),
      detail: { nodeId, changes },
    });

    json({ ok: true, op: 'modify', nodeId, receipt });
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: _outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.modify'),
      }}, _outputOpts);
      process.exit(1);
    }
    if (e instanceof Error) {
      json({ error: e.message });
      process.exit(1);
    }
    throw e;
  }
}

function cmdDagLog() {
  const log = loadMutationLog(repoRoot);
  const lastN = args.includes('--last') ? parseInt(args[args.indexOf('--last') + 1] || '10', 10) : undefined;
  const mutations = lastN ? log.mutations.slice(-lastN) : log.mutations;
  json({ ok: true, count: mutations.length, total: log.mutations.length, mutations });
}

// --- API schema discovery ---
function cmdApi() {
  const target = args[1]; // command name or --all
  const all = args.includes('--all');

  if (all || !target) {
    // List all commands or dump full registry
    const commands = listCommands();
    if (all) {
      const registry: Record<string, unknown> = {};
      for (const { command } of commands) {
        const s = lookupSchema(command);
        if (!s) continue;
        registry[command] = {
          description: s.description,
          input: s.input ? schemaToJsonSchema(s.input) : null,
          output: s.output ? schemaToJsonSchema(s.output) : null,
          examples: s.examples,
        };
      }
      emit({ ok: true, cmd: 'api', data: { commands: registry } }, _outputOpts);
    } else {
      emit({ ok: true, cmd: 'api', data: { commands } }, _outputOpts);
    }
    return;
  }

  const schema = lookupSchema(target);
  if (!schema) {
    const available = listCommands().map(c => c.command);
    emit({ ok: false, cmd: 'api', error: {
      code: ErrorCode.NODE_NOT_FOUND,
      message: `No schema registered for command: ${target}`,
      fix: [`Available commands: ${available.join(', ')}`],
    }}, _outputOpts);
    process.exit(1);
    return;
  }

  const data: any = {
    command: target,
    description: schema.description,
    input: schema.input ? schemaToJsonSchema(schema.input) : null,
    output: schema.output ? schemaToJsonSchema(schema.output) : null,
    examples: schema.examples,
  };

  if (target === 'make') {
    data.invariants = getMakeInvariants();
  }

  emit({ ok: true, cmd: 'api', data }, _outputOpts);
}

// --- Command help (--help on any command) ---
function showCommandHelp() {
  const key = deriveSchemaKey();
  const schema = lookupSchema(key);
  const out: any = {
    command: key,
    hint: `roadmap api ${key}  — full schema + examples`,
  };
  if (schema) {
    out.description = schema.description;
    out.input = schema.input ? schemaToJsonSchema(schema.input) : null;
    out.examples = schema.examples ?? [];
  }
  if (cmd === 'make') {
    const invariants = getMakeInvariants();
    out.skipFlags = invariants
      .filter(i => i.skipFlag)
      .map(i => ({ flag: i.skipFlag, skips: i.requirement }));
    out.invariants = invariants;
  }
  emit({ ok: true, cmd: 'api', data: out }, _outputOpts);
}

// --- Help ---
function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Core commands (mainline execution loop):
  make <spec>        Create ideal DAG from spec
  orient             Current batch position + produces/consumes
  advance [node-id]  Complete node (run validators, record evidence) or advance batch

Command groups (use 'roadmap <group> help' for details):
  spec <sub>         Spec planning: plan (gallery, select, status)
  dag <sub>          DAG mutations: insert, remove, modify, log

Discovery:
  api [<command>]    Schema discovery (input/output JSON Schema + examples + invariants)
  api --all          Full registry dump
  help               This message

All commands require --note "reason" (except help/orient/api).
Output is JSON. Add --help to any command for its full schema:
  roadmap make --help
  roadmap advance --help
  roadmap dag insert --help

Examples:
  roadmap orient --note "check position"
  roadmap make spec.json --note "create ideal DAG"
  roadmap advance my-node --note "validators pass"
  roadmap advance --note "move to next batch"
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

  if (hasError) {
    emit({ ok: false, cmd: _outputOpts.cmd, error: obj } as any, _outputOpts);
  } else {
    emit({ ok: true, cmd: _outputOpts.cmd, data: obj }, _outputOpts);
  }
}

// Entry point
main();
