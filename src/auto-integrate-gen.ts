// @module auto-integrate
// @exports generateRoadmapDAG, validateGeneratedDAG
// @types GeneratedDAG
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * Automatic roadmap generation from project metadata.
 */

export {
  type GeneratedDAG,
  generateRoadmapDAG,
  validateGeneratedDAG,
} from './lib/auto-integrate-gen.ts';
