// @module recovery
// @exports discoverBuildProcess, discoverAllPhases
// @types BuildDiscovery
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * Build process discovery from package.json scripts.
 */

export {
  type BuildDiscovery,
  discoverBuildProcess,
  discoverAllPhases,
} from './lib/build-discoverer.ts';
