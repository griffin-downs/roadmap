// Utility modules barrel export
export { repoInfo, artifactAtRef, archivedFiles, fileHistory, restore, stageAndCommit, createBranch, trackedFiles, isTracked, shortHash, isClean } from './git/git.ts';
export type { RepoInfo, FileHistory } from './git/git.ts';
export { makeWorkerIndex } from './git/git-index.ts';
export { readGitState, isFresh, validateGitState } from './git/git-state.schema.ts';
export { buildClusters } from './cluster/cluster.ts';
export { buildClustersSolver } from './cluster/cluster-solver.ts';
export { addPeer, removePeer, loadPeers, buildFederationView, loadFederationView, federationStatus } from './federation/federation.ts';
export { writeToken, readToken, listTokens, isTokenExpired, tokenId, TOKEN_DIR } from './tokens/token-store.ts';
export { appendToIndex, readIndex, gcTokens } from './tokens/token-index.ts';
