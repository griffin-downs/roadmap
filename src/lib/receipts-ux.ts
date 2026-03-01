// @module receipts-ux
// @exports listNodeReceipts, completionDoctor, completionCompact, NodeReceiptSummary, DoctorResult, CompactResult
// @types NodeReceiptSummary, DoctorResult, CompactResult
// @entry roadmap

import { readdirSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../protocol.ts';
import { CompletionStore } from './completion/completion-context.ts';

// --- Types ---

export interface NodeReceiptSummary {
  receiptFile: string;
  receiptType: string;
  timestamp: string;
  treeSha?: string;
  validatorResults?: Array<{ id: string; passed: boolean }>;
}

export interface DoctorIssue {
  severity: 'error' | 'warn';
  message: string;
  fix: string;
}

export interface DoctorResult {
  ok: boolean;
  issues: DoctorIssue[];
}

export interface CompactResult {
  dryRun: boolean;
  pruned: string[];
  kept: string[];
  errors: string[];
}

// --- Functions ---

/**
 * List receipts for a specific node from .roadmap/receipts/ directory.
 * Matches files whose name contains nodeId OR whose parsed JSON has a matching nodeId field.
 */
export function listNodeReceipts(repoRoot: string, nodeId: string): NodeReceiptSummary[] {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) return [];

  const files = readdirSync(receiptsDir).filter(f => f.endsWith('.json'));
  const results: NodeReceiptSummary[] = [];

  for (const file of files) {
    const filePath = join(receiptsDir, file);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      continue;
    }

    const nameMatch = file.includes(nodeId);
    const fieldMatch = parsed.nodeId === nodeId;
    if (!nameMatch && !fieldMatch) continue;

    const stat = statSync(filePath);
    const receiptType = inferReceiptType(file, parsed);

    const summary: NodeReceiptSummary = {
      receiptFile: file,
      receiptType,
      timestamp: (parsed.timestamp as string) ?? (parsed.completedAt as string) ?? stat.mtime.toISOString(),
    };

    if (parsed.treeSha) summary.treeSha = parsed.treeSha as string;
    if (Array.isArray(parsed.validatorResults)) {
      summary.validatorResults = (parsed.validatorResults as Array<Record<string, unknown>>).map(r => ({
        id: String(r.id ?? r.rule ?? 'unknown'),
        passed: Boolean(r.passed),
      }));
    }
    if (Array.isArray(parsed.validationChecks) && !summary.validatorResults) {
      summary.validatorResults = (parsed.validationChecks as Array<Record<string, unknown>>).map(r => ({
        id: String(r.id ?? r.rule ?? 'unknown'),
        passed: Boolean(r.passed),
      }));
    }

    results.push(summary);
  }

  return results;
}

/**
 * Diagnose completion state issues: missing files, parse errors, schema mismatches.
 */
export function completionDoctor(repoRoot: string): DoctorResult {
  const issues: DoctorIssue[] = [];

  // Check completed.json exists
  const completedPath = join(repoRoot, '.roadmap', 'completed.json');
  if (!existsSync(completedPath)) {
    issues.push({
      severity: 'error',
      message: '.roadmap/completed.json does not exist',
      fix: 'Run `roadmap init <dag-id>` or create completed.json manually as []',
    });
    return { ok: false, issues };
  }

  // Check parseable
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(completedPath, 'utf-8'));
  } catch (e) {
    issues.push({
      severity: 'error',
      message: `.roadmap/completed.json is not valid JSON: ${(e as Error).message}`,
      fix: 'Fix the JSON syntax or restore from git: git checkout -- .roadmap/completed.json',
    });
    return { ok: false, issues };
  }

  // Check schema: should be an array
  if (!Array.isArray(data)) {
    issues.push({
      severity: 'error',
      message: `completed.json root is ${typeof data}, expected array`,
      fix: 'completed.json must be a JSON array of completion records',
    });
    return { ok: false, issues };
  }

  // Check each record has nodeId
  const missingNodeId = data.filter((r: any) => !r.nodeId);
  if (missingNodeId.length > 0) {
    issues.push({
      severity: 'error',
      message: `${missingNodeId.length} record(s) missing nodeId field`,
      fix: 'Each record in completed.json must have a nodeId string field',
    });
  }

  // Check duplicates
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const record of data as Array<{ nodeId?: string }>) {
    if (!record.nodeId) continue;
    if (seen.has(record.nodeId)) dupes.push(record.nodeId);
    seen.add(record.nodeId);
  }
  if (dupes.length > 0) {
    issues.push({
      severity: 'warn',
      message: `Duplicate nodeIds in completed.json: ${dupes.join(', ')}`,
      fix: 'Remove duplicate entries — only the last occurrence is used',
    });
  }

  // Cross-check with head.json
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (existsSync(headPath)) {
    try {
      const dag: Graph<string> = JSON.parse(readFileSync(headPath, 'utf-8'));
      const dagNodeIds = new Set(Object.keys(dag.nodes));
      const completedIds = new Set((data as Array<{ nodeId?: string }>).map(r => r.nodeId).filter(Boolean) as string[]);

      // Stale: in completed but not in DAG
      const stale = [...completedIds].filter(id => !dagNodeIds.has(id));
      if (stale.length > 0) {
        issues.push({
          severity: 'warn',
          message: `${stale.length} completed node(s) not in head.json: ${stale.join(', ')}`,
          fix: 'These may be from an older DAG version. Run `roadmap completion compact` to prune',
        });
      }

      // Legacy records: no validationChecks
      const legacy = (data as Array<Record<string, unknown>>).filter(
        r => dagNodeIds.has(r.nodeId as string) && (!r.validationChecks || (r.validationChecks as unknown[]).length === 0)
      );
      if (legacy.length > 0) {
        issues.push({
          severity: 'warn',
          message: `${legacy.length} record(s) with no validation evidence (legacy format)`,
          fix: 'Re-run `roadmap complete <node>` to generate evidence-backed receipts',
        });
      }
    } catch {
      issues.push({
        severity: 'warn',
        message: 'Could not parse head.json for cross-check',
        fix: 'Ensure .roadmap/head.json is valid JSON',
      });
    }
  }

  return { ok: issues.every(i => i.severity !== 'error'), issues };
}

/**
 * Compact legacy receipt files in .roadmap/receipts/.
 * Legacy = missing schemaVersion or schemaVersion < 1.
 */
export function completionCompact(repoRoot: string, options: { dryRun: boolean }): CompactResult {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  const result: CompactResult = { dryRun: options.dryRun, pruned: [], kept: [], errors: [] };

  if (!existsSync(receiptsDir)) return result;

  const files = readdirSync(receiptsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = join(receiptsDir, file);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
      result.errors.push(`${file}: parse error — ${(e as Error).message}`);
      continue;
    }

    const version = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : undefined;
    if (version !== undefined && version >= 1) {
      result.kept.push(file);
      continue;
    }

    // Legacy receipt — prune
    if (!options.dryRun) {
      try {
        unlinkSync(filePath);
      } catch (e) {
        result.errors.push(`${file}: delete failed — ${(e as Error).message}`);
        continue;
      }
    }
    result.pruned.push(file);
  }

  return result;
}

// --- Helpers ---

function inferReceiptType(filename: string, parsed: Record<string, unknown>): string {
  if (parsed.type && typeof parsed.type === 'string') return parsed.type;
  if (filename.startsWith('import-')) return 'import';
  if (filename.startsWith('plan-select-')) return 'plan-select';
  if (filename.startsWith('candidate-')) return 'candidate';
  if (filename.startsWith('eval-')) return 'evaluation';
  return 'unknown';
}
