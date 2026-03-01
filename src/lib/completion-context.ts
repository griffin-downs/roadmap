// @module completion-context
// @description Receipt-only completion store — single truth regime for node completion
// @exports CompletionStore, CompletionStoreError
// @entry roadmap/completion

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompletionRecordWithEvidence, EvidenceRecord } from './evidence/completion-evidence.ts';
import { loadCompletionsWithEvidence, hasPassingReceipt } from './evidence/completion-evidence.ts';

/**
 * Receipt-only completion store. A node is "done" iff it has a passing receipt.
 * No artifact-existence fallback. No implicit legacy mode.
 *
 * Usage:
 *   CompletionStore.load(repoRoot)  — from completed.json (throws if missing)
 *   CompletionStore.empty()         — test fixture: nothing done
 *   CompletionStore.from(['a','b']) — test fixture: listed nodes done
 */
export class CompletionStore {
  private records: Map<string, CompletionRecordWithEvidence>;

  private constructor(records: Map<string, CompletionRecordWithEvidence>) {
    this.records = records;
  }

  /** Is this node completed with passing evidence? */
  hasPassing(nodeId: string): boolean {
    const record = this.records.get(nodeId);
    if (!record) return false;
    return hasPassingReceipt(record);
  }

  /** Get evidence records for a node (empty array if none). */
  evidence(nodeId: string): EvidenceRecord[] {
    return this.records.get(nodeId)?.validationChecks ?? [];
  }

  /** Does this node have any record (passing or failing)? */
  hasRecord(nodeId: string): boolean {
    return this.records.has(nodeId);
  }

  /** Does this node have a record with at least one failing check? */
  hasFailing(nodeId: string): boolean {
    const record = this.records.get(nodeId);
    if (!record) return false;
    if (!record.validationChecks || record.validationChecks.length === 0) return false;
    return record.validationChecks.some(c => !c.passed);
  }

  /** Get raw completion record for a node (undefined if none). */
  record(nodeId: string): CompletionRecordWithEvidence | undefined {
    return this.records.get(nodeId);
  }

  /** All node IDs in the store (passing, failing, or empty checks). */
  allIds(): Set<string> {
    return new Set(this.records.keys());
  }

  /** All node IDs with passing receipts. */
  passingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id] of this.records) {
      if (this.hasPassing(id)) ids.add(id);
    }
    return ids;
  }

  /** All node IDs with at least one failing check. */
  failingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id] of this.records) {
      if (this.hasFailing(id)) ids.add(id);
    }
    return ids;
  }

  /**
   * Load from .roadmap/completed.json.
   * Throws if file is missing — caller must handle (e.g. suggest `roadmap init`).
   */
  static load(repoRoot: string): CompletionStore {
    const completedPath = join(repoRoot, '.roadmap', 'completed.json');
    if (!existsSync(completedPath)) {
      throw new CompletionStoreError(
        `No completion store at ${completedPath}`,
        'Run `roadmap init` to create one, or `roadmap migrate` to upgrade an existing repo.',
      );
    }
    return new CompletionStore(loadCompletionsWithEvidence(repoRoot));
  }

  /**
   * Load from .roadmap/completed.json, or return empty store if missing.
   * Use only where missing store is expected (e.g. sibling repo checks).
   */
  static loadOrEmpty(repoRoot: string): CompletionStore {
    const completedPath = join(repoRoot, '.roadmap', 'completed.json');
    if (!existsSync(completedPath)) return CompletionStore.empty();
    return new CompletionStore(loadCompletionsWithEvidence(repoRoot));
  }

  /** Empty store — no nodes are done. */
  static empty(): CompletionStore {
    return new CompletionStore(new Map());
  }

  /** Test fixture — listed nodes are done with synthetic passing receipts. */
  static from(ids: Iterable<string>): CompletionStore {
    const records = new Map<string, CompletionRecordWithEvidence>();
    for (const id of ids) {
      records.set(id, {
        nodeId: id,
        completedAt: new Date().toISOString(),
        validationChecks: [{ rule: 'fixture', passed: true, evidence: 'test fixture' }],
      });
    }
    return new CompletionStore(records);
  }

  /** Test fixture — build from explicit records (passing, failing, or empty checks). */
  static fromRecords(records: CompletionRecordWithEvidence[]): CompletionStore {
    const map = new Map<string, CompletionRecordWithEvidence>();
    for (const r of records) map.set(r.nodeId, r);
    return new CompletionStore(map);
  }
}

export class CompletionStoreError extends Error {
  fix: string;
  constructor(message: string, fix: string) {
    super(message);
    this.name = 'CompletionStoreError';
    this.fix = fix;
  }
}
