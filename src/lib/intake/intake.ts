// @module intake
// @exports IntakeCandidate, IntakeScanResult, IntakeImportResult, IntakeCertifyResult, scanIntake, importIntake, certifyIntake, IntakeCommit, DetectedCluster, ProposedNodeSpec, IntakeRecord, IntakeReceipt, INTAKE_DIR, INTAKE_RECEIPT_PREFIX, isIntakeRecord, isIntakeReceipt, assertNotSpecKitMarkdown
// @types IntakeCandidate, IntakeScanResult, IntakeImportResult, IntakeCertifyResult, IntakeCommit, DetectedCluster, ProposedNodeSpec, IntakeRecord, IntakeReceipt
// @entry roadmap

// Intake compiler: scan git diffs against last attested commit,
// group changed paths into candidate NodeSpecs, import with intakeFrom
// provenance, certify via CompletionStore.
//
// NOTE: spec-kit markdown intake (tasks.md → DAG) is no longer supported.
// The canonical spec path is SpecIR JSON (schema_version: 2) — see
// src/lib/intake/spec-ir.ts. Callers loading specs should run
// assertNotSpecKitMarkdown() to fail fast with a migration pointer when
// presented with a legacy markdown payload. See docs/MIGRATION.md.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';

export interface IntakeCandidate {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  changedPaths: string[];
  intakeFrom: string;  // git sha of scan base
}

export interface IntakeScanResult {
  baseSha: string;
  headSha: string;
  candidates: IntakeCandidate[];
  changedFiles: string[];
  skipped: string[];   // files not groupable
}

export interface IntakeImportResult {
  imported: IntakeCandidate[];
  dagPath: string;
  receipt: string;
}

export interface IntakeCertifyResult {
  certified: string[];
  skipped: string[];
  reason?: string;
}

/** Get the last attested commit from .roadmap/intake-state.json, or null. */
function lastAttestedSha(repoRoot: string): string | null {
  const statePath = join(repoRoot, '.roadmap', 'intake-state.json');
  if (!existsSync(statePath)) return null;
  try {
    const data = JSON.parse(readFileSync(statePath, 'utf-8'));
    return typeof data.lastSha === 'string' ? data.lastSha : null;
  } catch {
    return null;
  }
}

/** Save intake state. */
function saveIntakeState(repoRoot: string, sha: string): void {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'intake-state.json'), JSON.stringify({ lastSha: sha, updatedAt: new Date().toISOString() }, null, 2) + '\n');
}

/** Group changed files by directory prefix into candidate nodes. */
function groupByDirectory(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const dir = dirname(f);
    const group = groups.get(dir) ?? [];
    group.push(f);
    groups.set(dir, group);
  }
  return groups;
}

/** Generate a node id from a directory path. */
function dirToId(dir: string): string {
  return 'intake-' + dir.replace(/[\/\\]/g, '-').replace(/^-+|-+$/g, '').replace(/\./g, '');
}

/** Skip patterns for intake scan. */
const SKIP_PATTERNS = [
  /^\.roadmap\//,
  /^node_modules\//,
  /^\.git\//,
  /^\.claude\//,
  /\.lock$/,
  /^package-lock\.json$/,
];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(path));
}

/**
 * Scan git diff from last attested commit to HEAD, group changed
 * paths into candidate NodeSpecs.
 */
export function scanIntake(repoRoot: string, opts?: { baseSha?: string }): IntakeScanResult {
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  const baseSha = opts?.baseSha ?? lastAttestedSha(repoRoot) ?? getFirstCommit(repoRoot);

  const diffOutput = execSync(
    `git diff --name-only ${baseSha}..${headSha}`,
    { cwd: repoRoot, encoding: 'utf-8' },
  ).trim();

  const changedFiles = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
  const skipped: string[] = [];
  const eligible: string[] = [];

  for (const f of changedFiles) {
    if (shouldSkip(f)) {
      skipped.push(f);
    } else {
      eligible.push(f);
    }
  }

  const groups = groupByDirectory(eligible);
  const candidates: IntakeCandidate[] = [];

  for (const [dir, paths] of groups) {
    const id = dirToId(dir);
    candidates.push({
      id,
      desc: `Intake from ${dir}: ${paths.length} file(s)`,
      produces: paths,
      consumes: [],
      changedPaths: paths,
      intakeFrom: baseSha,
    });
  }

  return { baseSha, headSha, candidates, changedFiles, skipped };
}

/**
 * Import intake candidates into the DAG. Appends nodes to head.json
 * with intakeFrom provenance. Non-destructive: merges with existing nodes.
 */
export function importIntake(
  repoRoot: string,
  candidates: IntakeCandidate[],
  opts?: { dagId?: string },
): IntakeImportResult {
  const dagDir = join(repoRoot, '.roadmap');
  if (!existsSync(dagDir)) mkdirSync(dagDir, { recursive: true });

  const dagPath = join(dagDir, 'head.json');
  let dag: Record<string, unknown>;

  if (existsSync(dagPath)) {
    dag = JSON.parse(readFileSync(dagPath, 'utf-8'));
  } else {
    dag = {
      id: opts?.dagId ?? 'intake-dag',
      desc: 'DAG created from intake scan',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true },
      },
    };
  }

  const nodes = (dag.nodes ?? {}) as Record<string, unknown>;
  const termNode = nodes[dag.term as string] as { deps: string[] } | undefined;
  const imported: IntakeCandidate[] = [];

  for (const c of candidates) {
    if (nodes[c.id]) continue; // skip duplicates

    nodes[c.id] = {
      id: c.id,
      desc: c.desc,
      produces: c.produces,
      consumes: c.consumes,
      deps: [dag.init as string],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
      intakeFrom: c.intakeFrom,
    };

    // Wire into term
    if (termNode && !termNode.deps.includes(c.id)) {
      termNode.deps.push(c.id);
    }

    imported.push(c);
  }

  dag.nodes = nodes;
  const dagJson = JSON.stringify(dag, null, 2) + '\n';
  writeFileSync(dagPath, dagJson);

  // Write receipt
  const receiptsDir = join(dagDir, 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  const receiptHash = createHash('sha256').update(dagJson).digest('hex').slice(0, 12);
  const receiptPath = join(receiptsDir, `intake-${receiptHash}.json`);
  writeFileSync(receiptPath, JSON.stringify({
    type: 'intake-import',
    timestamp: new Date().toISOString(),
    candidates: imported.map(c => c.id),
    baseSha: imported[0]?.intakeFrom ?? 'unknown',
  }, null, 2) + '\n');

  return { imported, dagPath, receipt: receiptPath };
}

/**
 * Certify intake nodes as complete — records completion for nodes
 * whose produced artifacts already exist on disk.
 */
export function certifyIntake(
  repoRoot: string,
  nodeIds: string[],
): IntakeCertifyResult {
  const dagPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(dagPath)) {
    return { certified: [], skipped: nodeIds, reason: 'No DAG found' };
  }

  const dag = JSON.parse(readFileSync(dagPath, 'utf-8'));
  const nodes = (dag.nodes ?? {}) as Record<string, { produces?: string[] }>;
  const certified: string[] = [];
  const skipped: string[] = [];

  for (const id of nodeIds) {
    const node = nodes[id];
    if (!node) { skipped.push(id); continue; }

    const produces = node.produces ?? [];
    const allExist = produces.every(p => existsSync(join(repoRoot, p)));
    if (!allExist) { skipped.push(id); continue; }

    certified.push(id);
  }

  // Save attestation state
  if (certified.length > 0) {
    const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
    saveIntakeState(repoRoot, headSha);
  }

  return { certified, skipped };
}

function getFirstCommit(repoRoot: string): string {
  return execSync('git rev-list --max-parents=0 HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim().split('\n')[0];
}

/**
 * Guard: refuse legacy spec-kit markdown specs. The canonical spec format is
 * SpecIR JSON. Specs that declare engine "spec-kit" alongside a markdown
 * tasks input are rejected with a migration pointer.
 */
export function assertNotSpecKitMarkdown(spec: unknown): void {
  if (!isObject(spec)) return;
  const engine = (spec as { engine?: unknown }).engine;
  const engineName = isObject(engine) ? (engine as { name?: unknown }).name : engine;
  const inputs = (spec as { inputs?: unknown }).inputs;
  const tasksInput = isObject(inputs) ? (inputs as { tasks?: unknown }).tasks : undefined;

  const isSpecKit = engineName === 'spec-kit';
  const isMarkdown = typeof tasksInput === 'string' && tasksInput.endsWith('.md');
  const hasIRTasks = Array.isArray((spec as { tasks?: unknown }).tasks);

  if (isSpecKit && isMarkdown && !hasIRTasks) {
    throw new Error(
      'spec-kit markdown format is no longer supported. ' +
      'Migrate to SpecIR JSON (schema_version: 2). See docs/MIGRATION.md.',
    );
  }
}

// --- rkg7 intake schema types ---

/** A single git commit captured during intake scan. */
export interface IntakeCommit {
  sha: string;
  parentSha: string;
  treeSha: string;
  touchedPaths: string[];
  author: string;
  msg: string;
  timestamp: string;
}

/** A cluster of commits grouped by path overlap (Jaccard similarity). */
export interface DetectedCluster {
  clusterId: string;
  commitShas: string[];
  paths: string[];
  jaccardScore: number;
}

/** A DAG node proposed from intake analysis. */
export interface ProposedNodeSpec {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
}

/** Full intake scan record: commits, clusters, and proposed nodes. */
export interface IntakeRecord {
  intakeId: string;
  fromSha: string;
  toSha: string;
  repoRoot: string;
  timestamp: string;
  commits: IntakeCommit[];
  treeShaSet: string[];
  detectedClusters: DetectedCluster[];
  proposedNodes: ProposedNodeSpec[];
  inputHash: string;
}

/** Receipt emitted after an intake-absorb operation. */
export interface IntakeReceipt {
  schemaVersion: 1;
  receiptType: 'intake-absorb';
  intakeId: string;
  fromSha: string;
  toSha: string;
  treeShaSet: string[];
  clusterCount: number;
  proposedNodeCount: number;
  inputHash: string;
  timestamp: string;
}

export const INTAKE_DIR = '.roadmap/intake' as const;
export const INTAKE_RECEIPT_PREFIX = 'intake-absorb' as const;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

/** Type guard for IntakeRecord. */
export function isIntakeRecord(x: unknown): x is IntakeRecord {
  if (!isObject(x)) return false;
  return (
    typeof x.intakeId === 'string' &&
    typeof x.fromSha === 'string' &&
    typeof x.toSha === 'string' &&
    typeof x.repoRoot === 'string' &&
    typeof x.timestamp === 'string' &&
    typeof x.inputHash === 'string' &&
    Array.isArray(x.commits) &&
    isStringArray(x.treeShaSet) &&
    Array.isArray(x.detectedClusters) &&
    Array.isArray(x.proposedNodes)
  );
}

/** Type guard for IntakeReceipt. */
export function isIntakeReceipt(x: unknown): x is IntakeReceipt {
  if (!isObject(x)) return false;
  return (
    x.schemaVersion === 1 &&
    x.receiptType === 'intake-absorb' &&
    typeof x.intakeId === 'string' &&
    typeof x.fromSha === 'string' &&
    typeof x.toSha === 'string' &&
    isStringArray(x.treeShaSet) &&
    typeof x.clusterCount === 'number' &&
    typeof x.proposedNodeCount === 'number' &&
    typeof x.inputHash === 'string' &&
    typeof x.timestamp === 'string'
  );
}
