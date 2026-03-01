// @module orient-cached
// @exports orientCached, updateRoadmapPosition
// @types (uses Orientation from protocol)
// @entry roadmap (re-exported)
// NOTE: orient() in protocol.ts is the standard version. This adds git-state caching.

import { orient as liveOrient, type Graph, type Orientation } from '../../protocol.ts';
import { CompletionStore } from '../completion/completion-context.ts';
import { readGitState, isFresh } from '../utils/git/git-state.schema.ts';

/**
 * Orient with git-state cache.
 * Falls back to live orient() when cache is stale or missing.
 */
export async function orientCached<T extends string>(
  g: Graph<T>,
  repoRoot: string,
  completion: CompletionStore,
): Promise<Orientation> {
  const gitState = await readGitState(repoRoot);

  if (gitState && isFresh(gitState) && gitState.roadmapPosition && gitState.roadmapPosition.length > 0) {
    const batch = gitState.roadmapPosition as T[];
    let batchComplete = true;

    for (const nodeId of batch) {
      const node = g.nodes[nodeId];
      if (!node) { batchComplete = false; break; }
      if (!completion.hasPassing(nodeId)) { batchComplete = false; break; }
    }

    if (batchComplete) {
      const batchProduces: string[] = [];
      const batchConsumes: string[] = [];
      for (const nodeId of batch) {
        const node = g.nodes[nodeId];
        batchProduces.push(...node.produces);
        batchConsumes.push(...node.consumes.map(c => typeof c === 'string' ? c : c.artifact));
      }
      return {
        position: batch,
        level: 0,
        batchRemaining: [],
        batchComplete: true,
        done: [],
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: [],
        preGate: [],
      };
    }
  }

  return liveOrient(g, completion);
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
    // (orient() will recompute next time)
  }
}
