// @module recovery
// @exports discoverDependencies, resolveSiblingPath, buildDepGraph, orderByDependencies
// @types RepoDepGraph, DependencySpec
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * Multi-repo dependency discovery and transitive ordering.
 */

export {
  type RepoDepGraph,
  resolveSiblingPath,
  discoverDependencies,
  buildDepGraph,
  orderByDependencies,
} from './lib/dependency-resolver.ts';
