// @module versioning
// @exports loadDAG, loadDAGFromFile
// @types (uses versioning.schema types)
// @entry roadmap/versioning

import { define as defineDAG, type Graph } from './protocol.ts';
import { checkCompatibility, migrateDAG, type ProtocolVersion } from './versioning.schema.ts';
import { DAGMigrator } from './migrations.ts';

export interface LoadOptions {
  autoMigrate?: boolean;
  targetVersion?: ProtocolVersion;
}

/**
 * Load DAG with version validation + automatic migration
 */
export async function loadDAG(
  rawDAG: any,
  options: LoadOptions = {}
): Promise<Graph<any>> {
  const { autoMigrate = true, targetVersion = '0.3.0' } = options;

  // Check compatibility
  const compat = checkCompatibility(rawDAG.protocolVersion || '0.1.0', targetVersion);

  if (!compat.compatible && !compat.needsMigration) {
    throw new Error(
      `DAG protocol ${rawDAG.protocolVersion} not compatible with ${targetVersion}. ` +
      `${compat.message || 'Cannot load.'}`
    );
  }

  let dag = rawDAG;

  // Migrate if needed
  if (compat.needsMigration) {
    if (!autoMigrate) {
      throw new Error(
        `DAG requires migration from ${rawDAG.protocolVersion} to ${targetVersion}. ` +
        `Set autoMigrate: true to automatically upgrade.`
      );
    }

    const migrator = new DAGMigrator();
    const plan = migrator.getPlan(rawDAG.protocolVersion, targetVersion);
    console.log(`Migrating DAG: ${plan.steps.join(' → ')}`);

    dag = await migrator.migrate(rawDAG, targetVersion);
    console.log(`✓ Migration complete`);
  }

  // Validate + return
  return defineDAG(dag);
}

/**
 * Load from file path
 */
export async function loadDAGFromFile(
  filePath: string,
  options?: LoadOptions
): Promise<Graph<any>> {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(filePath, 'utf-8');

  // Handle .ts files (export default)
  if (filePath.endsWith('.ts')) {
    // For TS files, we'd normally need to import/eval
    // For now, just parse as JSON if wrapped
    try {
      const match = content.match(/export default (\{[\s\S]*\})/);
      if (match) {
        const rawDAG = JSON.parse(match[1]);
        return loadDAG(rawDAG, options);
      }
    } catch {
      // Fall through
    }
  }

  // JSON parsing
  const rawDAG = JSON.parse(content);
  return loadDAG(rawDAG, options);
}

export default loadDAG;
