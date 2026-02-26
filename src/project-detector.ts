// @module recovery
// @exports getProjectType, requireProjectMetadata
// @types ProjectType
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * Project type detection from .roadmap.json metadata.
 */

export {
  type ProjectType,
  getProjectType,
  requireProjectMetadata,
} from './lib/project-detector.ts';
