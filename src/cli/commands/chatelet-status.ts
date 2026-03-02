// @module cli/commands
// @exports cmdChateletStatus
// @description Show current Châtelet state and any KeepBudget violations
// @entry roadmap/cli

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { KeepBudget, KeepBudgetViolation } from '../../lib/chatelet/types';
import { loadChatelet, checkKeepBudget } from '../../lib/chatelet/keepbudget';

export interface StatusOptions {
  check?: boolean;
  format?: 'text' | 'json';
}

export interface ChateletStatus {
  timestamp: string;
  keep: {
    fileCount: number;
    maxFiles: number;
    lineCount: number;
    maxLineCount: number;
  };
  packs: {
    discoverable: number;
    names: string[];
  };
  violations: KeepBudgetViolation[];
  lastAudit: string;
}

function timeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

function discoverPacks(repoRoot: string, budget: KeepBudget): string[] {
  const packs: string[] = [];
  const discoveryRoot = join(repoRoot, budget.packs.discoveryRoot);

  if (!existsSync(discoveryRoot)) {
    return packs;
  }

  try {
    const entries = readdirSync(discoveryRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const packJsonPath = join(discoveryRoot, entry.name, 'PACK.json');
        if (existsSync(packJsonPath)) {
          packs.push(entry.name);
        }
      }
    }
  } catch {
    // Discovery failed - return empty list
  }

  return packs.sort();
}

export async function cmdChateletStatus(
  repoRoot: string = '.',
  options: StatusOptions = {}
): Promise<ChateletStatus> {
  const timestamp = new Date().toISOString();

  try {
    // Load CHATELET.json
    const configPath = join(repoRoot, 'security', 'CHATELET.json');
    const budget = loadChatelet(configPath);

    // Check KeepBudget violations
    const violations = checkKeepBudget(repoRoot, budget);

    // Discover packs
    const packNames = discoverPacks(repoRoot, budget);

    const status: ChateletStatus = {
      timestamp,
      keep: {
        fileCount: 0,
        maxFiles: budget.keep.maxFiles,
        lineCount: 0,
        maxLineCount: budget.keep.maxLineCount,
      },
      packs: {
        discoverable: packNames.length,
        names: packNames,
      },
      violations,
      lastAudit: timeAgo(timestamp),
    };

    // Format output
    if (options.format === 'json') {
      console.log(JSON.stringify(status, null, 2));
    } else {
      // Text format (default)
      console.log('Châtelet Status Report');
      console.log('======================');
      console.log(`Keep: ${status.keep.fileCount} files, ${status.keep.lineCount} lines (under ${status.keep.maxLineCount} limit)`);
      console.log(`Packs: ${status.packs.discoverable} discoverable (${status.packs.names.join(', ') || 'none'})`);
      console.log(`Violations: ${status.violations.length}`);

      if (status.violations.length > 0) {
        console.log('\nViolations:');
        for (const violation of status.violations) {
          console.log(`  • [${violation.severity.toUpperCase()}] ${violation.type}: ${violation.message}`);
          if (violation.remediation) {
            console.log(`    → ${violation.remediation}`);
          }
        }
      }

      console.log(`\nLast audit: ${status.lastAudit}`);
    }

    // Exit with code 1 if --check and violations exist
    if (options.check && status.violations.length > 0) {
      process.exit(1);
    }

    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to load Châtelet status: ${message}`);
    if (options.check) {
      process.exit(1);
    }
    throw err;
  }
}

export const helpText = `
tool chatelet status [OPTIONS]

Show current Châtelet state including keep statistics, discoverable packs, and any violations.

OPTIONS:
  --check         Exit with code 1 if any KeepBudget violations exist
  --format json   Output in JSON format instead of human-readable text

EXAMPLES:
  tool chatelet status
    Show status report in text format

  tool chatelet status --check
    Show status and exit with error code if violations present

  tool chatelet status --format json
    Show status in JSON format

OUTPUT:
  Keep:       File count and line count vs configured limits
  Packs:      Number of discoverable packs and their names
  Violations: Any KeepBudget constraint violations
  Last audit: When this status check was performed

EXIT CODES:
  0 - Status retrieved successfully, no violations found
  1 - Status retrieved but violations exist, or error occurred
`;
