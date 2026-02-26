/**
 * roadmap/versioning — DAG migration and backward-compatibility
 *
 * Use during upgrades or when loading DAGs from older schema versions.
 * Not needed for normal operation.
 */

export { loadDAG, loadDAGFromFile } from './lib/versioning.ts';
export { checkCompatibility, migrateDAG, CURRENT_PROTOCOL_VERSION } from './lib/versioning.schema.ts';
export { DAGMigrator } from './lib/migrations.ts';

export type { VersionInfo, CompatibilityResult } from './lib/versioning.schema.ts';
