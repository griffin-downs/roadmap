// @module dag-switcher
// @exports DagSwitcher, switchDAG, validateDAGExists
// @types SwitchResult
// @entry roadmap/dag-management

import {
  readFileSync,
  existsSync,
  writeFileSync,
  lstatSync,
  unlinkSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { Graph } from '../../protocol.ts';
import { orient, type Orientation, CompletionStore } from '../../protocol.ts';

export interface SwitchResult {
  readonly dagId: string;
  readonly dagPath: string;
  readonly headPath: string;
  readonly switched: boolean;
  readonly previousDagId: string | null;
  readonly newOrientation: Orientation;
}

/**
 * Validates that a DAG file exists at .roadmap/head.{dagId}.json
 * Returns the full path if valid, throws if missing
 */
export function validateDAGExists(repoRoot: string, dagId: string): string {
  const dagPath = resolve(repoRoot, '.roadmap', `head.${dagId}.json`);

  if (!existsSync(dagPath)) {
    throw new Error(`DAG not found: ${dagPath}`);
  }

  // Verify it's a valid JSON file
  try {
    const content = readFileSync(dagPath, 'utf8');
    JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid DAG file: ${dagPath} — ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  return dagPath;
}

/**
 * Reads the current DAG ID from head.json
 * Returns null if head.json doesn't exist or can't be read
 */
export function getCurrentDAGId(repoRoot: string): string | null {
  const headPath = resolve(repoRoot, '.roadmap', 'head.json');

  if (!existsSync(headPath)) {
    return null;
  }

  try {
    const content = readFileSync(headPath, 'utf8');
    const parsed = JSON.parse(content) as { id?: string };
    return parsed.id || null;
  } catch {
    return null;
  }
}

/**
 * Copies DAG from source to head.json atomically
 * Writes to temp file first, then renames
 */
function updateHeadDAG(headPath: string, dagPath: string): void {
  const dagContent = readFileSync(dagPath, 'utf8');
  const tempPath = `${headPath}.tmp`;

  try {
    // Write to temp file first
    writeFileSync(tempPath, dagContent, 'utf8');

    // Remove old head.json if it exists and is a regular file
    if (existsSync(headPath)) {
      const stats = lstatSync(headPath);
      if (stats.isSymbolicLink() || stats.isFile()) {
        unlinkSync(headPath);
      }
    }

    // Atomically rename temp to head
    renameSync(tempPath, headPath);
  } catch (err) {
    // Clean up temp file on error
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw err;
  }
}

/**
 * Load a DAG from disk by ID
 */
export function loadDAGById(repoRoot: string, dagId: string): Graph<string> {
  const dagPath = validateDAGExists(repoRoot, dagId);
  const content = readFileSync(dagPath, 'utf8');
  const dag = JSON.parse(content) as Graph<string>;
  return dag;
}

/**
 * DagSwitcher: manage switching between multiple DAGs in a repo
 * Uses head.{dagId}.json convention for storing DAG versions
 * Updates head.json to point to the active DAG
 */
export class DagSwitcher {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Switch to a different DAG by ID
   * - Validates DAG exists
   * - Loads and copies DAG to head.json
   * - Re-orients to new DAG
   * - Returns switch result with new orientation
   */
  async switch(dagId: string): Promise<SwitchResult> {
    // Get current DAG ID before switching
    const previousDagId = getCurrentDAGId(this.repoRoot);

    // Validate new DAG exists
    const dagPath = validateDAGExists(this.repoRoot, dagId);

    // Load the DAG
    const newDAG = loadDAGById(this.repoRoot, dagId);

    // Update head.json
    const headPath = resolve(this.repoRoot, '.roadmap', 'head.json');
    updateHeadDAG(headPath, dagPath);

    // Re-orient to the new DAG
    // Use empty CompletionStore for fresh orientation on new DAG
    const newOrientation = orient(newDAG, CompletionStore.from([]));

    return {
      dagId,
      dagPath,
      headPath,
      switched: true,
      previousDagId,
      newOrientation,
    };
  }

  /**
   * Get list of available DAGs in the repo
   * Returns array of DAG IDs found as head.{dagId}.json files
   */
  getAvailableDAGs(): string[] {
    const dotRoadmapPath = resolve(this.repoRoot, '.roadmap');

    if (!existsSync(dotRoadmapPath)) {
      return [];
    }

    const files = readdirSync(dotRoadmapPath, { withFileTypes: true });
    const dagIds: string[] = [];

    for (const file of files) {
      if (file.isFile() && file.name.startsWith('head.') && file.name.endsWith('.json')) {
        // Extract dagId from 'head.{dagId}.json'
        const match = file.name.match(/^head\.(.+)\.json$/);
        if (match) {
          dagIds.push(match[1]);
        }
      }
    }

    return dagIds.sort();
  }

  /**
   * Get current DAG ID
   */
  getCurrentDAG(): string | null {
    return getCurrentDAGId(this.repoRoot);
  }
}

/**
 * Convenience function: switch DAG and return result
 */
export async function switchDAG(repoRoot: string, dagId: string): Promise<SwitchResult> {
  const switcher = new DagSwitcher(repoRoot);
  return switcher.switch(dagId);
}
