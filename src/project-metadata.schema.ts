// @module recovery
// @exports ProjectMetadata, ProjectType, PhaseSpec, DependencySpec, validateProjectMetadata, readProjectMetadata, writeProjectMetadata, validateMetadataConsistency, mergeWithDefaults
// @types ProjectMetadata, ProjectType, PhaseSpec, DependencySpec
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * This module provides the ProjectMetadata schema for .roadmap.json files.
 */

export {
  type ProjectMetadata,
  type ProjectType,
  type PhaseSpec,
  type DependencySpec,
  validateProjectMetadata,
  readProjectMetadata,
  writeProjectMetadata,
  validateMetadataConsistency,
  mergeWithDefaults,
} from './lib/project-metadata.schema.ts';
