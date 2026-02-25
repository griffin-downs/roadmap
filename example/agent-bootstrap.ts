// Agent bootstrap template
// An agent running on a consumer repo should:
// 1. Import the repo's roadmap
// 2. Call orient() to find current position
// 3. Execute work for current node
// 4. Loop until term

import { readGitState, isFresh } from '../src/git-state.schema.ts';
import { orientCached } from '../src/orient-cached.ts';
import roadmap from '../roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Main agent loop: reorient → execute → loop
 *
 * Typical execution:
 * 1. Agent starts (e.g., spawned by regent)
 * 2. Calls agentBoot(repoRoot)
 * 3. Gets current position in roadmap
 * 4. Executes work for that node
 * 5. Commits (triggers git-state.json update)
 * 6. On next agent spawn, repeats from step 2
 *
 * This pattern makes agents stateless (all state is in git and roadmap).
 */
export async function agentBoot(repoRoot: string): Promise<void> {
  // Step 1: Reorient using cache if available
  const gitState = await readGitState(repoRoot);

  console.log('=== Agent Bootstrap ===');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Branch: ${gitState?.branch ?? 'unknown'}`);
  console.log(`Git clean: ${gitState?.clean ?? 'unknown'}`);

  // Step 2: Call orient with cache (falls back to live if cache missing/stale)
  const fsCheck = (artifact: string) => existsSync(join(repoRoot, artifact));
  const pos = await orientCached(roadmap, repoRoot, fsCheck);

  console.log(`\nCurrent position: ${pos.position}`);
  console.log(`Produces (to create): ${pos.produces.join(', ') || '(none)'}`);
  console.log(`Consumes (available): ${pos.consumes.join(', ') || '(none)'}`);
  console.log(`Remaining nodes: ${pos.remaining.length}`);

  // Step 3: Check if at terminal node
  if (pos.position === roadmap.term) {
    console.log('\n✓ Roadmap complete!');
    return;
  }

  // Step 4: Get node spec for work context
  const node = roadmap.nodes[pos.position as keyof typeof roadmap.nodes];
  if (!node) {
    console.error(`Error: Node "${pos.position}" not found in roadmap`);
    process.exit(1);
  }

  console.log(`\nNode: ${node.id}`);
  console.log(`Description: ${node.desc}`);
  console.log(`Dependencies satisfied: ${node.deps.every((d) => pos.done?.includes(d)) ? 'yes' : 'no'}`);

  // Step 5: Minimal work stub
  // In a real agent, this would:
  // - Read .briefing/{nodeId}.json for detailed context
  // - Execute the work (write files, run tests, etc.)
  // - Commit changes
  // - Update git-state.json with new position
  console.log(`\nTo proceed, implement work for node "${pos.position}"`);
  console.log(`Then commit: git commit -m "${pos.position}: [work description]"`);
  console.log('Git post-commit hook will update .regent/git-state.json');
  console.log('On next agent spawn, it will reorient and continue.');
}

// Example: run agent bootstrap
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.argv[2] || process.cwd();
  await agentBoot(repoRoot);
}
