// CLI command: roadmap audit
// Wraps audit-engine operations behind canonical CLI interface

import type { Command } from 'commander';
import { auditSurface } from '../../lib/audit/audit-engine.ts';

export function registerAuditCommand(program: Command) {
  program
    .command('audit')
    .description('Audit repository surface and generate refactoring proposals')
    .option('--scope <dirs>', 'Directories to audit')
    .option('--exclude <dirs>', 'Directories to exclude')
    .action(async (opts: { scope?: string; exclude?: string }) => {
      const result = await auditSurface({
        scope: opts.scope?.split(',') || ['src', 'bin', 'tests'],
        exclude: opts.exclude?.split(',') || ['dist', 'node_modules']
      });
      console.log(JSON.stringify(result, null, 2));
    });
}

export { registerAuditCommand as default };
