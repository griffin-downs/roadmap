// @module cli/commands
// @exports cmdChateletMigrate
// @description Migrate project to Châtelet pack structure
// @entry roadmap/cli

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { listRefs, lsTree, GitSafeConfig } from '../../lib/gitsafe/index.js';
import {
  validateMigrationPlan,
  type MoveOperation,
  type MigrationPlan,
  formatValidationError,
} from '../../lib/chatelet/migration-validator.js';

export interface MigrateOptions {
  planOnly?: boolean;
  dryRun?: boolean;
  format?: 'json' | 'text';
  output?: string;
}

export interface AuditResult {
  modules: string[];
  filesByModule: Map<string, string[]>;
  estimatedLineCount: number;
  timestamp: string;
}

function auditMonolith(repoRoot: string): AuditResult {
  const timestamp = new Date().toISOString();
  const srcPath = join(repoRoot, 'src');
  const modules: string[] = [];
  const filesByModule = new Map<string, string[]>();
  let estimatedLineCount = 0;

  if (!existsSync(srcPath)) {
    return { modules, filesByModule, estimatedLineCount, timestamp };
  }

  try {
    const entries = readdirSync(srcPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const modulePath = join(srcPath, entry.name);
        const moduleFiles: string[] = [];

        // Recursively find all .ts files in this module
        const findTsFiles = (dir: string, prefix: string): void => {
          try {
            const items = readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              if (item.name.startsWith('.') || item.name === 'node_modules') continue;

              const fullPath = join(dir, item.name);
              const relPath = join(prefix, item.name);

              if (item.isDirectory()) {
                findTsFiles(fullPath, relPath);
              } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) {
                moduleFiles.push(relPath);
                // Estimate lines per file (rough)
                try {
                  const content = readFileSync(fullPath, 'utf-8');
                  estimatedLineCount += content.split('\n').length;
                } catch {
                  // Skip if unreadable
                }
              }
            }
          } catch {
            // Skip directories we can't read
          }
        };

        findTsFiles(modulePath, join('src', entry.name));

        if (moduleFiles.length > 0) {
          modules.push(entry.name);
          filesByModule.set(entry.name, moduleFiles);
        }
      }
    }
  } catch {
    // Audit failed gracefully - return empty result
  }

  return {
    modules: modules.sort(),
    filesByModule,
    estimatedLineCount,
    timestamp,
  };
}

function generateMoveOperations(
  audit: AuditResult,
  packagePrefix: string = 'packs',
): MoveOperation[] {
  const moves: MoveOperation[] = [];

  audit.filesByModule.forEach((files, module) => {
    for (const file of files) {
      const targetDir = `${packagePrefix}/${module}`;
      const targetPath = join(targetDir, relative('src', file));

      moves.push({
        from: file,
        to: targetPath,
        reason: `Migrate ${module} module to Châtelet pack structure`,
      });
    }
  });

  return moves;
}

function formatMigrationPlan(
  audit: AuditResult,
  moves: MoveOperation[],
  validation: ReturnType<typeof validateMigrationPlan>,
): MigrationPlan {
  // Calculate time estimate: ~5 minutes per 1000 lines
  const estimatedMinutes = Math.max(15, Math.ceil(audit.estimatedLineCount / 200));

  return {
    moves,
    estimated_time: `${estimatedMinutes}m`,
    safety: validation.valid ? 'dry-run-verified' : 'dry-run-failed',
    rollback: {
      metadata: {
        audit_timestamp: audit.timestamp,
        module_count: audit.modules.length,
        file_count: moves.length,
        line_count: audit.estimatedLineCount,
      },
      timestamp: new Date().toISOString(),
    },
  };
}

export async function cmdChateletMigrate(
  repoRoot: string = '.',
  options: MigrateOptions = {},
): Promise<MigrationPlan> {
  try {
    // Step 1: Audit the monolith
    const audit = auditMonolith(repoRoot);

    // Step 2: Generate move operations
    const moves = generateMoveOperations(audit);

    // Step 3: Create the migration plan
    const basePlan: MigrationPlan = {
      moves,
      estimated_time: '',
      safety: 'pending',
    };

    // Step 4: Validate the plan
    const validation = validateMigrationPlan(basePlan);

    // Step 5: Format the final plan
    const plan = formatMigrationPlan(audit, moves, validation);

    // Step 6: Handle validation errors
    if (!validation.valid) {
      const errorSummary = validation.errors.map(e => formatValidationError(e)).join('\n\n');
      console.error('Migration plan validation failed:');
      console.error(errorSummary);

      if (options.format === 'json') {
        console.log(JSON.stringify(plan, null, 2));
      }
      throw new Error('Plan validation failed');
    }

    // Step 7: Output the plan
    if (options.format === 'json' || options.output) {
      const output = JSON.stringify(plan, null, 2);

      if (options.output) {
        writeFileSync(options.output, output, 'utf-8');
        console.log(`Migration plan written to: ${options.output}`);
      } else {
        console.log(output);
      }
    } else {
      // Text format
      console.log('Châtelet Migration Plan');
      console.log('=======================');
      console.log(`Modules identified: ${audit.modules.length}`);
      console.log(`Files to move: ${moves.length}`);
      console.log(`Estimated lines: ${audit.estimatedLineCount}`);
      console.log(`Estimated time: ${plan.estimated_time}`);
      console.log(`Safety status: ${plan.safety}`);

      if (audit.modules.length > 0) {
        console.log(`\nModules:`);
        for (const module of audit.modules) {
          const count = audit.filesByModule.get(module)?.length ?? 0;
          console.log(`  • ${module} (${count} files)`);
        }
      }

      if (moves.length > 0) {
        console.log(`\nSample moves (showing first 10):`);
        for (let i = 0; i < Math.min(10, moves.length); i++) {
          const move = moves[i];
          console.log(`  ${i + 1}. ${move.from} → ${move.to}`);
        }
        if (moves.length > 10) {
          console.log(`  ... and ${moves.length - 10} more moves`);
        }
      }

      console.log(`\nDry-run: No actual changes were made.`);
      console.log(`To see full plan: tool chatelet migrate --plan-only --format json`);
    }

    // Step 8: Return plan (dry-run only, no execution)
    if (options.planOnly) {
      return plan;
    }

    return plan;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error generating migration plan: ${message}`);
    throw err;
  }
}

export const helpText = `
tool chatelet migrate [OPTIONS]

Generate a migration plan from monolith to Châtelet pack structure.
Performs dry-run analysis and validation without making changes.

OPTIONS:
  --plan-only         Output plan in JSON format and exit (default: true)
  --format json|text  Output format (default: text)
  --output <path>     Write plan to file instead of stdout

EXAMPLES:
  tool chatelet migrate --plan-only
    Generate plan and display in text format

  tool chatelet migrate --format json
    Generate and output plan as JSON to stdout

  tool chatelet migrate --output MIGRATION_PLAN.json
    Generate plan and save to MIGRATION_PLAN.json

OUTPUT:
  Audit results with module count and file list
  Migration plan with move operations
  Dry-run validation status
  Estimated migration time

VALIDATION:
  - Syntax: All moves have from/to fields
  - Safety: No path traversal or absolute paths
  - Uniqueness: No conflicting or duplicate targets
  - Idempotency: Plan is deterministic and re-runnable

EXIT CODES:
  0 - Plan generated successfully
  1 - Plan validation failed or error occurred
`;

