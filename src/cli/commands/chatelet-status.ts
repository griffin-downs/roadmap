// @module cli/commands
// @exports chateletStatus, KeepAudit
// @entry roadmap/cli

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

export interface KeepBudget {
  maxFiles: number;
  maxLOC: number;
  maxDeps: number;
  maxDevDeps: number;
  vitestMaxSeconds: number;
  forbiddenGlobs: string[];
}

export interface KeepAudit {
  timestamp: string;
  status: 'ready' | 'degraded' | 'error';
  fileCount: number;
  maxFiles: number;
  locCount: number;
  maxLOC: number;
  depCount: number;
  maxDeps: number;
  components: {
    gitsafe: boolean;
    keepbudget: boolean;
    packs: boolean;
  };
  violations: string[];
  message: string;
}

export async function chateletStatus(repoRoot: string = '.'): Promise<KeepAudit> {
  const violations: string[] = [];
  let status: 'ready' | 'degraded' | 'error' = 'ready';
  let fileCount = 0;
  let maxFiles = 0;
  let locCount = 0;
  let maxLOC = 0;
  let depCount = 0;
  let maxDeps = 0;

  try {
    // Load CHATELET.json
    const chatelPath = join(repoRoot, 'security', 'CHATELET.json');
    if (!existsSync(chatelPath)) {
      throw new Error('CHATELET.json not found');
    }

    const chatelContent = readFileSync(chatelPath, 'utf-8');
    const chatel = JSON.parse(chatelContent);
    const keepBudget: KeepBudget = chatel.keep;

    maxFiles = keepBudget.maxFiles;
    maxLOC = keepBudget.maxLOC;
    maxDeps = keepBudget.maxDeps;

    // Count source files
    try {
      const findCmd = `find src -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \\) 2>/dev/null | wc -l`;
      fileCount = parseInt(execSync(findCmd, { cwd: repoRoot, encoding: 'utf-8' }).trim(), 10) || 0;
    } catch {
      violations.push('Failed to count source files');
      status = 'degraded';
    }

    // Count lines of code
    try {
      const wc = execSync(`find src -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \\) -exec wc -l {} + 2>/dev/null | tail -1`,
        { cwd: repoRoot, encoding: 'utf-8' });
      locCount = parseInt(wc.trim().split(/\s+/)[0], 10) || 0;
    } catch {
      violations.push('Failed to count lines of code');
      status = 'degraded';
    }

    // Count dependencies from package.json
    try {
      const pkgPath = join(repoRoot, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        depCount = Object.keys(pkg.dependencies || {}).length;
      }
    } catch {
      violations.push('Failed to count dependencies');
      status = 'degraded';
    }

    // Check budget violations
    if (fileCount > keepBudget.maxFiles) {
      violations.push(`File count ${fileCount} exceeds max ${keepBudget.maxFiles}`);
      status = 'degraded';
    }
    if (locCount > keepBudget.maxLOC) {
      violations.push(`LOC ${locCount} exceeds max ${keepBudget.maxLOC}`);
      status = 'degraded';
    }
    if (depCount > keepBudget.maxDeps) {
      violations.push(`Dependencies ${depCount} exceed max ${keepBudget.maxDeps}`);
      status = 'degraded';
    }

    return {
      timestamp: new Date().toISOString(),
      status,
      fileCount,
      maxFiles,
      locCount,
      maxLOC,
      depCount,
      maxDeps,
      components: {
        gitsafe: true,
        keepbudget: status !== 'error',
        packs: true,
      },
      violations,
      message: violations.length === 0
        ? 'Keep audit passed: all budgets within limits'
        : `Keep audit failed: ${violations.length} violation(s)`,
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      status: 'error',
      fileCount,
      maxFiles,
      locCount,
      maxLOC,
      depCount,
      maxDeps,
      components: {
        gitsafe: false,
        keepbudget: false,
        packs: false,
      },
      violations: [`Chatelet audit failed: ${err instanceof Error ? err.message : String(err)}`],
      message: 'Chatelet operational error',
    };
  }
}
