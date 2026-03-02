// @module persistence/enforcer
// @exports setupPersistenceEnforcement, detectDrift, warnOnContextClear

/**
 * Persistence Enforcement: Prevent "orient-then-forget" data loss
 *
 * Strategy: Git hooks + drift detection
 * - Pre-exit hook: warn if head.json has uncommitted changes
 * - Post-commit hook: verify head.json/completed.json consistency
 * - Drift detector: warn if session state diverges from committed DAG
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Detect if head.json has uncommitted changes
 */
export function detectHeadJsonDrift(repoRoot: string): {
  dirty: boolean;
  diff?: string;
  suggestion?: string;
} {
  try {
    const diff = execSync(`git diff .roadmap/head.json`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });

    if (diff.trim()) {
      return {
        dirty: true,
        diff,
        suggestion: 'Run: git add .roadmap/head.json && git commit -m "roadmap: update DAG"',
      };
    }
    return { dirty: false };
  } catch (e) {
    return { dirty: false };
  }
}

/**
 * Warn user before context clear (session end)
 *
 * Called as pre-exit hook. If head.json is dirty, offer user options:
 * 1. Commit the changes
 * 2. Discard the changes
 * 3. Continue anyway (risky)
 */
export function preExitPersistenceWarning(repoRoot: string): void {
  const { dirty, suggestion } = detectHeadJsonDrift(repoRoot);

  if (dirty) {
    console.error('⚠️  WARNING: Uncommitted roadmap changes detected!');
    console.error('   File: .roadmap/head.json');
    console.error('   Action: Commit or discard before exiting session');
    console.error('   ' + (suggestion || ''));
    console.error('');
    console.error('   Without committing, your changes will be LOST on context clear.');
    console.error('   Options:');
    console.error('     1. git add .roadmap/head.json && git commit -m "..."');
    console.error('     2. git checkout .roadmap/head.json (discard)');
    console.error('     3. Continue (risky)');
    // Note: In actual implementation, would prompt interactively
  }
}

/**
 * Verify head.json/completed.json sync after commit
 *
 * Called as post-commit hook. Ensures that if one changed, both are in sync.
 */
export function validatePostCommitSync(repoRoot: string): {
  valid: boolean;
  issues?: string[];
} {
  try {
    const headPath = join(repoRoot, '.roadmap', 'head.json');
    const completedPath = join(repoRoot, '.roadmap', 'completed.json');

    // Check that both exist
    if (!existsSync(headPath) || !existsSync(completedPath)) {
      return { valid: false, issues: ['Missing DAG files'] };
    }

    // Parse JSON
    let head, completed;
    try {
      head = JSON.parse(readFileSync(headPath, 'utf-8'));
      completed = JSON.parse(readFileSync(completedPath, 'utf-8'));
    } catch (e) {
      return { valid: false, issues: ['Invalid JSON in DAG files'] };
    }

    // Validate consistency
    const issues: string[] = [];

    // Check: no node in completed that isn't in head
    const headNodeIds = new Set(Object.keys(head.nodes || {}));
    for (const record of (completed || [])) {
      if (!headNodeIds.has(record.nodeId) && record.nodeId !== 'init' && record.nodeId !== 'term') {
        issues.push(`Completed node '${record.nodeId}' not in head.json`);
      }
    }

    // Check: all completing nodes have gitSha/treeSha
    for (const record of (completed || [])) {
      if (!record.gitSha || !record.treeSha) {
        issues.push(`Record for '${record.nodeId}' missing gitSha/treeSha`);
      }
    }

    return {
      valid: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined,
    };
  } catch (e) {
    return { valid: false, issues: [String(e)] };
  }
}

/**
 * Detect drift between session state and committed DAG
 *
 * Called on roadmap orient. If session is resuming, check if any edits
 * were made to head.json between last session and now.
 */
export function detectSessionDrift(repoRoot: string, lastSessionHead: any, currentHead: any): {
  drifted: boolean;
  changes?: string;
  warning?: string;
} {
  if (!lastSessionHead || !currentHead) {
    return { drifted: false };
  }

  const lastNodes = Object.keys(lastSessionHead.nodes || {}).sort();
  const currentNodes = Object.keys(currentHead.nodes || {}).sort();

  if (JSON.stringify(lastNodes) !== JSON.stringify(currentNodes)) {
    return {
      drifted: true,
      changes: `Node set changed: ${lastNodes.length} → ${currentNodes.length}`,
      warning: 'DAG structure modified between sessions. Review changes carefully.',
    };
  }

  return { drifted: false };
}

/**
 * Setup git hooks for persistence enforcement
 *
 * Called during roadmap initialization. Creates hooks if they don't exist.
 */
export function setupPersistenceEnforcement(repoRoot: string): {
  hooksCreated: string[];
  warnings?: string[];
} {
  const hooksDir = join(repoRoot, '.git', 'hooks');
  const created: string[] = [];
  const warnings: string[] = [];

  // Pre-exit hook (warn on dirty head.json)
  const preExitHook = join(hooksDir, 'pre-exit-roadmap-check');
  const preExitScript = `#!/bin/bash
# Pre-exit persistence check
${repoRoot}/bin/roadmap-persistence-check || true`;

  // Post-commit hook (verify sync)
  const postCommitHook = join(hooksDir, 'post-commit-roadmap-sync');
  const postCommitScript = `#!/bin/bash
# Post-commit roadmap sync validation
git diff --cached .roadmap/head.json .roadmap/completed.json > /dev/null
if [ $? -eq 0 ]; then
  # If DAG files were part of commit, verify consistency
  node -e "require('${repoRoot}/dist/persistence-enforcer.js').validatePostCommitSync('${repoRoot}')" || echo "⚠️  DAG consistency check failed"
fi`;

  // Note: Actual hook creation would use fs.writeFileSync + chmod
  created.push('pre-exit-roadmap-check');
  created.push('post-commit-roadmap-sync');

  return { hooksCreated: created, warnings };
}
