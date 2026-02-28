// @module verify
// @exports Violation, VerifyResult, runVerify
// @types Violation, VerifyResult
// @entry roadmap

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { define, check, verify } from '../protocol.ts';
import type { Graph } from '../protocol.ts';
import { loadCompletions, getCompletedNodeIds } from './completion-tracker.ts';
import { validatePlanSelection } from './plan-selection.ts';
import { isSpecOrigin, SPEC_ORIGIN_PATH } from './spec-origin.ts';

export interface Violation {
  code: string;
  message: string;
  paths?: string[];
  nodeIds?: string[];
  fix: string[];
}

export interface VerifyResult {
  violations: Violation[];
  warnings: Violation[];
  fix: string[];
}

// Structural validity: define() + check()
function checkStructure(dag: Graph<string>): Violation[] {
  const violations: Violation[] = [];
  try {
    define(dag);
  } catch (err) {
    violations.push({
      code: 'STRUCTURAL_INVALID',
      message: `DAG structural error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json structure — cycles, missing init/term, or id/key mismatches'],
    });
  }

  try {
    const result = check(dag);
    if (result.orphans.length > 0) {
      violations.push({
        code: 'ORPHAN_NODES',
        message: `${result.orphans.length} node(s) unreachable from init or cannot reach term`,
        nodeIds: result.orphans,
        fix: ['Add dependency edges to connect orphan nodes to the DAG'],
      });
    }
  } catch (err) {
    violations.push({
      code: 'CHECK_FAILED',
      message: `Termination check error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json DAG structure'],
    });
  }

  return violations;
}

// Contract validity: verify()
function checkContracts(dag: Graph<string>): Violation[] {
  try {
    const unsatisfied = verify(dag);
    if (unsatisfied.length === 0) return [];
    return [{
      code: 'UNSATISFIED_CONTRACTS',
      message: `${unsatisfied.length} unsatisfied consume contract(s)`,
      paths: unsatisfied,
      fix: ['Ensure every consumed artifact is produced by a predecessor node'],
    }];
  } catch (err) {
    return [{
      code: 'CONTRACT_CHECK_FAILED',
      message: `Contract verification error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json node consumes/produces declarations'],
    }];
  }
}

// CompletionStore consistency: completed nodes must exist in DAG
function checkCompletions(repoRoot: string, dag: Graph<string>): Violation[] {
  const warnings: Violation[] = [];
  const completions = loadCompletions(repoRoot);
  const completedIds = getCompletedNodeIds(completions);
  const dagNodeIds = new Set(Object.keys(dag.nodes));

  const orphanCompletions = [...completedIds].filter(id => !dagNodeIds.has(id));
  if (orphanCompletions.length > 0) {
    warnings.push({
      code: 'ORPHAN_COMPLETIONS',
      message: `${orphanCompletions.length} completion record(s) reference nodes not in the DAG`,
      nodeIds: orphanCompletions,
      fix: ['Remove stale entries from .roadmap/completed.json or re-add missing nodes'],
    });
  }

  return warnings;
}

// Plan-selection receipt validity
function checkPlanSelection(repoRoot: string): Violation[] {
  const result = validatePlanSelection(repoRoot);
  if (result.valid) return [];
  return [{
    code: 'PLAN_SELECTION_INVALID',
    message: result.reason ?? 'Plan selection receipt invalid or missing',
    fix: ['roadmap plan select <candidateId> --note "reason"'],
  }];
}

// Spec-origin integrity: if spec-origin.json exists, it must parse as valid SpecOrigin
function checkSpecOrigin(repoRoot: string): Violation[] {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  if (!existsSync(p)) return []; // no spec origin = OK (not all DAGs are spec-compiled)

  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    if (!isSpecOrigin(raw)) {
      return [{
        code: 'SPEC_ORIGIN_MALFORMED',
        message: 'spec-origin.json exists but does not conform to SpecOrigin schema',
        paths: [p],
        fix: ['Re-import: roadmap import --spec-compiled <path> --note "..."'],
      }];
    }
  } catch (err) {
    return [{
      code: 'SPEC_ORIGIN_PARSE_ERROR',
      message: `Failed to parse spec-origin.json: ${String(err instanceof Error ? err.message : err)}`,
      paths: [p],
      fix: ['Fix or regenerate .roadmap/spec-origin.json'],
    }];
  }

  return [];
}

// Orphan receipt detection: receipts in .roadmap/receipts/ that don't match any DAG node or known receipt type
function checkOrphanReceipts(repoRoot: string, dag: Graph<string>): Violation[] {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) return [];

  const files = readdirSync(receiptsDir).filter(f => f.endsWith('.json'));
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const knownPrefixes = ['plan-select-', 'spec-import-', 'PLAN_SELECTED', 'certify-', 'advance-', 'complete-'];

  const orphans: string[] = [];
  for (const f of files) {
    // Skip known receipt types
    if (knownPrefixes.some(p => f.startsWith(p))) continue;

    // Check if receipt filename contains a node ID
    const matchesNode = [...dagNodeIds].some(id => f.includes(id));
    if (!matchesNode) orphans.push(f);
  }

  if (orphans.length === 0) return [];
  return [{
    code: 'ORPHAN_RECEIPTS',
    message: `${orphans.length} receipt file(s) in .roadmap/receipts/ do not match any known pattern or DAG node`,
    paths: orphans.map(f => join(receiptsDir, f)),
    fix: ['Remove stale receipt files or investigate their origin'],
  }];
}

// Env-var bypass scan: find process.env references in src/ that could bypass governance
function checkEnvBypasses(repoRoot: string): Violation[] {
  const srcDir = join(repoRoot, 'src');
  if (!existsSync(srcDir)) return [];

  const bypassPatterns = ['SKIP_BATCH_COMMIT', 'SKIP_TEST_CHECK', 'SKIP_VALIDATE', 'ROADMAP_SKIP'];
  const found: string[] = [];

  try {
    const result = execSync(
      `grep -rn "process\\.env\\[" "${srcDir}" --include="*.ts" 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 5000 },
    );

    for (const line of result.split('\n')) {
      if (!line.trim()) continue;
      for (const pat of bypassPatterns) {
        if (line.includes(pat)) {
          found.push(line.trim());
        }
      }
    }
  } catch {
    // grep failure is non-fatal
  }

  if (found.length === 0) return [];
  return [{
    code: 'ENV_BYPASS_DETECTED',
    message: `${found.length} governance bypass env-var reference(s) found in src/`,
    paths: found,
    fix: ['Review and remove unnecessary bypass env-vars from source code'],
  }];
}

// No artifact-only completion: completed nodes should have validation evidence, not just artifact existence
function checkArtifactOnlyCompletions(repoRoot: string, dag: Graph<string>): Violation[] {
  const completions = loadCompletions(repoRoot);
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const suspect: string[] = [];

  for (const [nodeId, record] of completions) {
    if (!dagNodeIds.has(nodeId)) continue; // orphan, handled elsewhere
    const node = (dag.nodes as Record<string, unknown>)[nodeId] as { validate?: ReadonlyArray<{ type: string }> } | undefined;
    if (!node) continue;

    // If node has shell/build-produces validators but completion has no checkpoint, flag it
    const hasRealValidators = node.validate?.some(
      v => v.type === 'shell' || v.type === 'build-produces' || v.type === 'launch-check',
    );
    if (hasRealValidators && !record.checkpointId) {
      suspect.push(nodeId);
    }
  }

  if (suspect.length === 0) return [];
  return [{
    code: 'ARTIFACT_ONLY_COMPLETION',
    message: `${suspect.length} node(s) with validators completed without checkpoint evidence`,
    nodeIds: suspect,
    fix: ['Re-complete these nodes via `roadmap complete <node> --note "..."`'],
  }];
}

export function runVerify(repoRoot: string): VerifyResult {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    return {
      violations: [{
        code: 'NO_DAG',
        message: 'No .roadmap/head.json found',
        paths: [headPath],
        fix: ['Run `roadmap init <dag-id>` or create head.json'],
      }],
      warnings: [],
      fix: ['roadmap init <dag-id>'],
    };
  }

  let dag: Graph<string>;
  try {
    dag = JSON.parse(readFileSync(headPath, 'utf-8'));
  } catch (err) {
    return {
      violations: [{
        code: 'DAG_PARSE_ERROR',
        message: `Failed to parse head.json: ${String(err instanceof Error ? err.message : err)}`,
        paths: [headPath],
        fix: ['Fix JSON syntax in .roadmap/head.json'],
      }],
      warnings: [],
      fix: ['Fix .roadmap/head.json'],
    };
  }

  const violations = [
    ...checkStructure(dag),
    ...checkContracts(dag),
    ...checkSpecOrigin(repoRoot),
  ];

  const warnings = [
    ...checkCompletions(repoRoot, dag),
    ...checkPlanSelection(repoRoot),
    ...checkOrphanReceipts(repoRoot, dag),
    ...checkEnvBypasses(repoRoot),
    ...checkArtifactOnlyCompletions(repoRoot, dag),
  ];

  const fix = violations.flatMap(v => v.fix);

  return { violations, warnings, fix };
}
