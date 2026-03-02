// CLI command: roadmap audit
// Wraps audit-engine operations behind canonical CLI interface

import type { Command } from 'commander';
import { scanSurface } from '../../lib/audit/audit-engine.ts';

export function registerAuditCommand(program: Command) {
  program
    .command('audit')
    .description('Audit repository surface and generate refactoring proposals')
    .option('--root <dir>', 'Repository root (default: cwd)')
    .action(async (opts: { root?: string }) => {
      const root = opts.root || process.cwd();
      const result = scanSurface(root);
      console.log(JSON.stringify(result, null, 2));
    });
}

export { registerAuditCommand as default };
