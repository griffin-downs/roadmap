/**
 * @module git
 * @entry roadmap/git
 *
 * Git operations library (public API).
 * All git queries and mutations consolidated here.
 */

export {
  repoInfo, artifactAtRef, archivedFiles, fileHistory, restore, stageAndCommit, createBranch,
  trackedFiles, isTracked, shortHash, isClean,
} from './lib/utils/git/git.ts';
export type { RepoInfo, FileHistory } from './lib/utils/git/git.ts';
