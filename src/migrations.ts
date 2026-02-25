// @module migrations
// @exports DAGMigrator
// @types (none)
// @entry roadmap/versioning

import { migrateDAG as applySchemaMigrations, checkCompatibility, type ProtocolVersion } from './versioning.schema.ts';

export interface MigrationPlan {
  from: ProtocolVersion;
  to: ProtocolVersion;
  steps: string[];
}

/**
 * Detailed migration with validation
 */
export class DAGMigrator {
  async migrate(dag: any, targetVersion: ProtocolVersion = '0.3.0'): Promise<any> {
    const compat = checkCompatibility(dag.protocolVersion, targetVersion);

    if (!compat.compatible && !compat.needsMigration) {
      throw new Error(`Cannot migrate: ${dag.protocolVersion} → ${targetVersion}`);
    }

    // Apply schema migrations
    let migrated = applySchemaMigrations(dag, targetVersion);

    // Validate result
    if (!migrated.protocolVersion) {
      migrated.protocolVersion = targetVersion;
    }

    return migrated;
  }

  /**
   * Get migration plan (what will happen)
   */
  getPlan(fromVersion: ProtocolVersion, toVersion: ProtocolVersion): MigrationPlan {
    const versions: ProtocolVersion[] = ['0.1.0', '0.2.0', '0.3.0'];
    const fromIdx = versions.indexOf(fromVersion);
    const toIdx = versions.indexOf(toVersion);

    if (fromIdx < 0 || toIdx < 0) {
      throw new Error(`Invalid versions: ${fromVersion} → ${toVersion}`);
    }

    if (fromIdx >= toIdx) {
      throw new Error(`Cannot migrate backward: ${fromVersion} → ${toVersion}`);
    }

    const steps: string[] = [];
    for (let i = fromIdx; i < toIdx; i++) {
      const from = versions[i];
      const to = versions[i + 1];
      steps.push(this.describeStep(from, to));
    }

    return { from: fromVersion, to: toVersion, steps };
  }

  private describeStep(from: ProtocolVersion, to: ProtocolVersion): string {
    if (from === '0.1.0' && to === '0.2.0') {
      return 'Add optional idempotent field (backward compat)';
    }
    if (from === '0.2.0' && to === '0.3.0') {
      return 'Fill required idempotent field (infer from semantics)';
    }
    return `Migrate ${from} → ${to}`;
  }
}

export async function createMigrator(): Promise<DAGMigrator> {
  return new DAGMigrator();
}

export default createMigrator;
