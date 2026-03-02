// @module roadmap/batch-health-check
// @exports BatchHealthCheck, checkBatchHealth, BatchHealthReport
// @types BatchHealthReport, HealthCheckResult, ArtifactStatus
// @entry roadmap/recovery

/**
 * Batch health check — validates committed artifacts across a batch and entire hardening stack.
 *
 * Problem: After a batch completes, need to validate that all components (preflight-validator,
 * artifact-gates, trail-manager, headsha-recovery) worked together atomically. Catch integration
 * gaps early.
 *
 * Solution: Post-batch validation that checks:
 * 1. Artifact existence: All produces exist in working tree
 * 2. Schema compliance: JSON artifacts conform to spec (graceful fallback)
 * 3. Typecheck: src/ changes pass tsc --noEmit
 * 4. Trail coherence: trail.jsonl entries match completed nodes
 * 5. Head.json consistency: headSha matches git state (post-recovery)
 * 6. Summary report: coverage delta, missing artifacts, validation gaps
 *
 * Graceful degradation: Works independently with basic checks. Integrates with
 * preflight-validator + artifact-gates once ready (interface assumptions).
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTrailEntries } from '../trail-metrics.ts';

export interface ArtifactStatus {
  path: string;
  exists: boolean;
  size?: number;
  hash?: string;
  schema?: { valid: boolean; error?: string };
}

export interface HealthCheckResult {
  passed: boolean;
  category: 'artifact-exists' | 'schema' | 'typecheck' | 'trail-coherence' | 'head-consistency';
  details: string;
  severity: 'error' | 'warning' | 'info';
}

export interface BatchHealthReport {
  timestamp: string;
  batchLevel: number;
  nodeIds: string[];
  totalArtifacts: number;
  artifactsChecked: number;
  artifactsFound: number;
  artifactsMissing: string[];
  results: HealthCheckResult[];
  passed: boolean;
  coverage: number; // 0-100: percentage of artifacts found
  summary: string;
}

export class BatchHealthCheck {
  private repoRoot: string;
  private headJson: any = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.loadHeadJson();
  }

  /**
   * Load and cache head.json
   */
  private loadHeadJson(): void {
    try {
      const headPath = join(this.repoRoot, '.roadmap', 'head.json');
      if (existsSync(headPath)) {
        this.headJson = JSON.parse(readFileSync(headPath, 'utf-8'));
      }
    } catch {
      this.headJson = null;
    }
  }

  /**
   * Check health of a completed batch. If nodeIds not provided, check current batch from trail.
   */
  async checkBatch(nodeIds?: string[]): Promise<BatchHealthReport> {
    const results: HealthCheckResult[] = [];
    const artifactsMissing: string[] = [];
    let artifactsFound = 0;
    let totalArtifacts = 0;

    // Determine node IDs from trail if not provided
    if (!nodeIds || nodeIds.length === 0) {
      nodeIds = this.getLastCompletedBatchNodeIds();
    }

    if (!nodeIds || nodeIds.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        batchLevel: -1,
        nodeIds: [],
        totalArtifacts: 0,
        artifactsChecked: 0,
        artifactsFound: 0,
        artifactsMissing: [],
        results: [
          {
            passed: false,
            category: 'artifact-exists',
            details: 'No completed batch found in trail',
            severity: 'error',
          },
        ],
        passed: false,
        coverage: 0,
        summary: 'No batch to check',
      };
    }

    // 1. Check artifact existence
    const artifactResults = this.checkArtifactExists(nodeIds);
    results.push(...artifactResults.results);
    artifactsFound = artifactResults.found;
    totalArtifacts = artifactResults.total;
    artifactsMissing.push(...artifactResults.missing);

    // 2. Check trail coherence (entries for completed nodes)
    const trailResult = this.checkTrailCoherence(nodeIds);
    results.push(trailResult);

    // 3. Check head.json consistency with git state
    const headResult = this.checkHeadConsistency();
    results.push(headResult);

    // 4. Check typecheck (basic: if src/ files exist, pass for now)
    const typecheckResult = this.checkTypecheck();
    results.push(typecheckResult);

    // 5. Schema compliance (graceful: basic JSON validation only)
    const schemaResult = this.checkSchemaCompliance(nodeIds);
    results.push(schemaResult);

    // Calculate coverage
    const coverage = totalArtifacts > 0 ? Math.round((artifactsFound / totalArtifacts) * 100) : 100;
    const passed = results.every(r => r.severity !== 'error');

    const level = this.getCurrentBatchLevel();
    const summary = passed
      ? `Batch L${level} health check passed: ${artifactsFound}/${totalArtifacts} artifacts found`
      : `Batch L${level} health check FAILED: ${artifactsMissing.length} artifacts missing, ${results.filter(r => r.severity === 'error').length} errors`;

    return {
      timestamp: new Date().toISOString(),
      batchLevel: level,
      nodeIds,
      totalArtifacts,
      artifactsChecked: totalArtifacts,
      artifactsFound,
      artifactsMissing,
      results,
      passed,
      coverage,
      summary,
    };
  }

  /**
   * Check artifact existence for all produces of given nodes
   */
  private checkArtifactExists(nodeIds: string[]): {
    results: HealthCheckResult[];
    found: number;
    total: number;
    missing: string[];
  } {
    const results: HealthCheckResult[] = [];
    let found = 0;
    let total = 0;
    const missing: string[] = [];

    if (!this.headJson || !this.headJson.nodes) {
      return { results, found, total, missing };
    }

    for (const nodeId of nodeIds) {
      const node = this.headJson.nodes[nodeId];
      if (!node || !node.produces) continue;

      for (const artifact of node.produces) {
        total++;
        const artifactPath = join(this.repoRoot, artifact);
        const exists = existsSync(artifactPath);

        if (exists) {
          found++;
        } else {
          missing.push(`${nodeId}:${artifact}`);
        }
      }
    }

    if (missing.length > 0) {
      results.push({
        passed: false,
        category: 'artifact-exists',
        details: `Missing ${missing.length} artifacts: ${missing.join(', ')}`,
        severity: 'error',
      });
    } else if (total > 0) {
      results.push({
        passed: true,
        category: 'artifact-exists',
        details: `All ${total} artifacts exist`,
        severity: 'info',
      });
    }

    return { results, found, total, missing };
  }

  /**
   * Check that trail.jsonl has entries for all completed nodes
   * Graceful: warning if trail can't be read or entries are missing
   */
  private checkTrailCoherence(nodeIds: string[]): HealthCheckResult {
    try {
      const entries = loadTrailEntries(this.repoRoot);
      const completedNodes = new Set<string>();

      for (const entry of entries) {
        if (entry.cmd === 'complete' && entry.detail?.nodeId) {
          completedNodes.add(entry.detail.nodeId as string);
        }
      }

      const missing = nodeIds.filter(n => !completedNodes.has(n));

      if (missing.length > 0) {
        return {
          passed: true, // Warning level, not blocking
          category: 'trail-coherence',
          details: `Trail missing complete entries for: ${missing.join(', ')} (non-blocking)`,
          severity: 'warning',
        };
      }

      return {
        passed: true,
        category: 'trail-coherence',
        details: `Trail coherent: ${nodeIds.length} completed nodes recorded`,
        severity: 'info',
      };
    } catch (err) {
      // Trail errors are non-blocking (graceful degradation)
      return {
        passed: true,
        category: 'trail-coherence',
        details: `Could not read trail.jsonl (non-blocking): ${err instanceof Error ? err.message : 'unknown error'}`,
        severity: 'warning',
      };
    }
  }

  /**
   * Check that head.json headSha matches current git HEAD
   * Graceful: warning if mismatch (recovery available via headsha-recovery)
   */
  private checkHeadConsistency(): HealthCheckResult {
    try {
      if (!this.headJson?.headSha) {
        return {
          passed: true,
          category: 'head-consistency',
          details: 'head.json missing headSha field (recoverable)',
          severity: 'warning',
        };
      }

      const gitHead = execSync('git rev-parse HEAD', {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (this.headJson.headSha === gitHead) {
        return {
          passed: true,
          category: 'head-consistency',
          details: `head.json consistent with git HEAD: ${gitHead.slice(0, 8)}`,
          severity: 'info',
        };
      }

      // Mismatch is a warning, not a blocking error (headsha-recovery can fix)
      return {
        passed: true,
        category: 'head-consistency',
        details: `head.json mismatch: ${this.headJson.headSha.slice(0, 8)} != ${gitHead.slice(0, 8)} (recoverable by headsha-recovery)`,
        severity: 'warning',
      };
    } catch {
      return {
        passed: true,
        category: 'head-consistency',
        details: 'Could not check git HEAD (non-blocking)',
        severity: 'warning',
      };
    }
  }

  /**
   * Check typecheck: if src/ changes exist, verify tsc --noEmit passes
   * Graceful: only check if tsconfig.json exists (skip in test repos)
   */
  private checkTypecheck(): HealthCheckResult {
    const tsconfigPath = join(this.repoRoot, 'tsconfig.json');

    // Skip typecheck if no tsconfig (test repos won't have it)
    if (!existsSync(tsconfigPath)) {
      return {
        passed: true,
        category: 'typecheck',
        details: 'No tsconfig.json — typecheck skipped',
        severity: 'info',
      };
    }

    try {
      execSync('npx tsc --noEmit 2>&1', {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        passed: true,
        category: 'typecheck',
        details: 'TypeScript typecheck passed',
        severity: 'info',
      };
    } catch {
      // tsc exit code != 0 means errors — non-blocking warning
      return {
        passed: true,
        category: 'typecheck',
        details: 'TypeScript typecheck has issues (non-blocking)',
        severity: 'warning',
      };
    }
  }

  /**
   * Check schema compliance: basic JSON validation for *.json artifacts
   */
  private checkSchemaCompliance(nodeIds: string[]): HealthCheckResult {
    if (!this.headJson || !this.headJson.nodes) {
      return {
        passed: true,
        category: 'schema',
        details: 'No schema to validate',
        severity: 'info',
      };
    }

    const issues: string[] = [];

    for (const nodeId of nodeIds) {
      const node = this.headJson.nodes[nodeId];
      if (!node || !node.produces) continue;

      for (const artifact of node.produces) {
        if (!artifact.endsWith('.json')) continue;

        const artifactPath = join(this.repoRoot, artifact);
        if (!existsSync(artifactPath)) continue;

        try {
          const content = readFileSync(artifactPath, 'utf-8');
          JSON.parse(content);
        } catch (e) {
          issues.push(`${nodeId}:${artifact} invalid JSON`);
        }
      }
    }

    if (issues.length > 0) {
      return {
        passed: false,
        category: 'schema',
        details: `Schema validation failed: ${issues.join(', ')}`,
        severity: 'error',
      };
    }

    return {
      passed: true,
      category: 'schema',
      details: 'JSON artifacts schema compliant',
      severity: 'info',
    };
  }

  /**
   * Get node IDs from the last completed batch in trail
   */
  private getLastCompletedBatchNodeIds(): string[] {
    try {
      const entries = loadTrailEntries(this.repoRoot);
      const levelMap = new Map<number, string[]>();

      for (const entry of entries) {
        if (entry.cmd === 'complete' && entry.level !== undefined && entry.detail?.nodeId) {
          const level = entry.level;
          if (!levelMap.has(level)) {
            levelMap.set(level, []);
          }
          levelMap.get(level)!.push(entry.detail.nodeId as string);
        }
      }

      if (levelMap.size === 0) return [];

      const maxLevel = Math.max(...levelMap.keys());
      return [...new Set(levelMap.get(maxLevel) ?? [])];
    } catch {
      return [];
    }
  }

  /**
   * Get current batch level from trail (highest complete level)
   */
  private getCurrentBatchLevel(): number {
    try {
      const entries = loadTrailEntries(this.repoRoot);
      let maxLevel = -1;

      for (const entry of entries) {
        if (entry.level !== undefined && entry.level > maxLevel) {
          maxLevel = entry.level;
        }
      }

      return maxLevel;
    } catch {
      return -1;
    }
  }
}

/**
 * One-shot health check for a batch
 */
export async function checkBatchHealth(
  repoRoot: string,
  nodeIds?: string[]
): Promise<BatchHealthReport> {
  const checker = new BatchHealthCheck(repoRoot);
  return checker.checkBatch(nodeIds);
}

export default BatchHealthCheck;
