// @module completion-tracker
// @description Persistent completion tracking for batch advancement
// @exports loadCompletions, saveCompletion, isNodeComplete

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface CompletionRecord {
  nodeId: string;
  completedAt: string;
  owner?: string;
  checkpointId?: string;
}

/**
 * Load completed node records from .roadmap/completed.json
 */
export function loadCompletions(repoRoot: string): Map<string, CompletionRecord> {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');

  if (!existsSync(completionPath)) {
    return new Map();
  }

  try {
    const data = JSON.parse(readFileSync(completionPath, 'utf-8'));
    const records = new Map<string, CompletionRecord>();

    if (Array.isArray(data)) {
      for (const record of data) {
        records.set(record.nodeId, record);
      }
    }

    return records;
  } catch {
    return new Map();
  }
}

/**
 * Save a node completion record
 */
export function saveCompletion(
  repoRoot: string,
  nodeId: string,
  owner?: string,
  checkpointId?: string,
): void {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');
  const dirPath = join(repoRoot, '.roadmap');

  // Ensure .roadmap directory exists
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  // Load existing completions
  const completions = loadCompletions(repoRoot);

  // Add/update the new completion
  completions.set(nodeId, {
    nodeId,
    completedAt: new Date().toISOString(),
    owner,
    checkpointId,
  });

  // Write back to file
  const recordArray = Array.from(completions.values());
  writeFileSync(completionPath, JSON.stringify(recordArray, null, 2) + '\n');
}

/**
 * Check if a node has been completed
 */
export function isNodeComplete(completions: Map<string, CompletionRecord>, nodeId: string): boolean {
  return completions.has(nodeId);
}

/**
 * Get set of completed node IDs
 */
export function getCompletedNodeIds(completions: Map<string, CompletionRecord>): Set<string> {
  return new Set(completions.keys());
}
