/**
 * @module hooks
 * @entry roadmap/hooks
 *
 * Git hook integrator API.
 * Use this in post-commit, pre-push, or other git hooks to query/mutate roadmap state.
 *
 * Example: post-commit hook
 * ```ts
 * import { repoInfo, stageAndCommit } from 'roadmap/hooks';
 * const info = repoInfo(process.cwd());
 * console.log(`Committed on ${info.branch}`);
 * ```
 */

export {
  repoInfo, artifactAtRef, archivedFiles, fileHistory, restore, stageAndCommit, createBranch,
  trackedFiles, isTracked, shortHash, isClean,
} from './lib/utils/git/git.ts';
export type { RepoInfo, FileHistory } from './lib/utils/git/git.ts';
