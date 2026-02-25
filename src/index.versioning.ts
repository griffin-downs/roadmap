/**
 * roadmap/versioning — DAG migration and backward-compatibility
 *
 * Use during upgrades or when loading DAGs from older schema versions.
 * Not needed for normal operation.
 */

export { loadDAG, loadDAGFromFile } from './versioning.ts';
export { checkCompatibility, migrateDAG } from './versioning.schema.ts';
export { DAGMigrator } from './migrations.ts';

export type { VersionInfo, CompatibilityResult } from './versioning.schema.ts';
