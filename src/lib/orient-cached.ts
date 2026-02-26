// @module orient-cached
// @exports orientCached, updateRoadmapPosition
// @types (uses Orientation from protocol)
// @entry roadmap (re-exported)
// NOTE: orient() in protocol.ts is the standard version. This adds git-state caching.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { orient as liveOrient, type Graph, type Orientation } from '../protocol.ts';
import { readGitState, isFresh } from './git-state.schema.ts';

/**
 * Orient with git-state cache.
 *
 * Strategy:
 * 1. Try to read .regent/git-state.json
 * 2. If fresh (<10s), use it to skip expensive git ops
 * 3. If stale or missing, call live orient() (backward compatible)
 *
 * The git-state cache contains:
 * - Which files are dirty (from git status)
 * - Current commit hash and subject
 * - Last known roadmap position
 *
 * This avoids repeated `git status`, `git log`, etc. for each agent spawn.
 */
export async function orientCached<T extends string>(
  g: Graph<T>,
  repoRoot: string,
  exists: (artifact: string) => boolean,
): Promise<Orientation> {
  // Try to read git-state.json
  const gitState = await readGitState(repoRoot);

  // If cache is fresh and has a position, verify batch is still complete
  if (gitState && isFresh(gitState) && gitState.roadmapPosition && gitState.roadmapPosition.length > 0) {
    // Validate the batch: all nodes' artifacts must exist
    const batch = gitState.roadmapPosition as T[];
    const batchProduces: string[] = [];
    const batchConsumes: string[] = [];
    let batchComplete = true;

    for (const nodeId of batch) {
      const node = g.nodes[nodeId];
      if (!node) {
        batchComplete = false;
        break;
      }
      if (node.produces.length > 0 && !node.produces.every(a => exists(a))) {
        batchComplete = false;
        break;
      }
      batchProduces.push(...node.produces);
      batchConsumes.push(...node.consumes);
    }

    if (batchComplete) {
      // Cached position is still valid
      return {
        position: batch,
        level: 0, // We don't know the level from cache alone
        batchRemaining: [],
        batchComplete: true,
        done: [], // Could cache this too, but risky
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: [],
        preGate: [],
      };
    }
  }

  // Cache miss or stale: call live orient
  return liveOrient(g, exists);
}

/**
 * Update git-state.json with current roadmap position.
 * Call this after orient() to save position for next session.
 */
export async function updateRoadmapPosition(
  repoRoot: string,
  position: string[],
  note?: string,
): Promise<void> {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const regentDir = join(repoRoot, '.regent');

  try {
    const stateFile = join(regentDir, 'git-state.json');
    const content = await readFile(stateFile, 'utf-8');
    const state = JSON.parse(content);
    state.roadmapPosition = position;
    if (note) state.lastPositionNote = note;
    await writeFile(stateFile, JSON.stringify(state, null, 2));
  } catch {
    // If file doesn't exist or can't be written, silently fail
    // (orient() will recompute next time)
  }
}
