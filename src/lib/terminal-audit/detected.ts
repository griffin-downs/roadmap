// @module terminal-audit/detected
// @description Gap detection — structural + scoring-derived gaps in the DAG
// @exports GapType, GapEntry, DetectedGaps, detectGaps

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';
import type { CompletionStore } from '../../runtime/completion.ts';
import type { TrailMetrics } from '../trail-metrics.ts';

export type GapType =
  | 'uncovered-consume'
  | 'untested-produce'
  | 'no-shell-coverage'
  | 'untested-evidence'
  | 'velocity-decay';

export interface GapEntry {
  type: GapType;
  nodeId: string;
  artifact: string;
}

export interface DetectedGaps {
  gaps: GapEntry[];
}

/** Optional scoring-derived data sources for enriched gap detection. */
export interface DetectGapsOptions {
  /** Completion store — enables untested-evidence detection */
  completion?: CompletionStore;
  /** Trail metrics — enables velocity-decay detection */
  scoring?: TrailMetrics;
}

/**
 * Detect gap types in the DAG:
 *
 * Structural (graph-only):
 * 1. uncovered-consume — artifact consumed where no predecessor produces it
 *    with a shell validator (contract is unguarded).
 * 2. untested-produce — artifact produced but no validator references it
 *    (output has no acceptance test).
 * 3. no-shell-coverage — node has produces but ONLY artifact-exists validators
 *    (existence checked, correctness never tested).
 *
 * Scoring-derived (require optional data):
 * 4. untested-evidence — node completed but completion store shows no shell
 *    validator results passing (only artifact-exists checks ran).
 * 5. velocity-decay — batch where wall-clock duration exceeded 2× the median
 *    batch duration (significant slowdown signal).
 */
export function detectGaps(dag: Graph<string>, options?: DetectGapsOptions): DetectedGaps {
  const gaps: GapEntry[] = [];

  // Build lookup: artifact → producing nodes that have a shell validator
  const shellGuardedProducers = new Set<string>();
  for (const node of Object.values(dag.nodes)) {
    const hasShell = node.validate.some((v: ValidationRule) => v.type === 'shell');
    if (hasShell) {
      for (const artifact of node.produces) {
        shellGuardedProducers.add(artifact);
      }
    }
  }

  // Build lookup: artifacts referenced by any validator
  const validatorReferencedArtifacts = new Set<string>();
  for (const node of Object.values(dag.nodes)) {
    for (const v of node.validate) {
      if (v.type === 'artifact-exists') {
        const target = v.path ?? v.target;
        if (target) validatorReferencedArtifacts.add(target);
        // If no explicit target, artifact-exists checks all produces — add them
        if (!target) {
          for (const p of node.produces) {
            validatorReferencedArtifacts.add(p);
          }
        }
      } else if (v.type === 'artifact-schema') {
        validatorReferencedArtifacts.add(v.target);
      } else if (v.type === 'shell') {
        // Shell validators with grep referencing an artifact path
        const cmd = 'command' in v
          ? (typeof v.command === 'string' ? v.command : v.command.join(' '))
          : v.argv.join(' ');
        for (const n2 of Object.values(dag.nodes)) {
          for (const p of n2.produces) {
            if (cmd.includes(p)) validatorReferencedArtifacts.add(p);
          }
        }
      }
    }
  }

  // Detect uncovered consumes
  for (const node of Object.values(dag.nodes)) {
    for (const consume of node.consumes) {
      const artifact = consumeArtifact(consume);
      if (!shellGuardedProducers.has(artifact)) {
        gaps.push({ type: 'uncovered-consume', nodeId: node.id, artifact });
      }
    }
  }

  // Detect untested produces
  for (const node of Object.values(dag.nodes)) {
    for (const artifact of node.produces) {
      if (!validatorReferencedArtifacts.has(artifact)) {
        gaps.push({ type: 'untested-produce', nodeId: node.id, artifact });
      }
    }
  }

  // Detect no-shell-coverage: node has produces but only artifact-exists validators (no shell)
  for (const node of Object.values(dag.nodes)) {
    if (node.produces.length === 0) continue;
    const hasAnyValidator = node.validate.length > 0;
    const hasShell = node.validate.some((v: ValidationRule) => v.type === 'shell');
    const hasArtifactExists = node.validate.some((v: ValidationRule) => v.type === 'artifact-exists');
    if (hasAnyValidator && hasArtifactExists && !hasShell) {
      for (const artifact of node.produces) {
        gaps.push({ type: 'no-shell-coverage', nodeId: node.id, artifact });
      }
    }
  }

  // Scoring-derived: untested-evidence (requires completion store)
  if (options?.completion) {
    const completion = options.completion;
    for (const node of Object.values(dag.nodes)) {
      if (node.produces.length === 0) continue;
      if (!completion.hasPassing(node.id)) continue;
      // Node completed — check if any shell validator evidence exists
      const evidence = completion.evidence(node.id);
      const hasShellEvidence = evidence.some(e => e.rule.startsWith('shell:') && e.passed);
      if (!hasShellEvidence && evidence.length > 0) {
        for (const artifact of node.produces) {
          gaps.push({ type: 'untested-evidence', nodeId: node.id, artifact });
        }
      }
    }
  }

  // Scoring-derived: velocity-decay (requires trail metrics)
  if (options?.scoring && options.scoring.batches.length >= 2) {
    const batches = options.scoring.batches;
    const durations = batches
      .map(b => b.wallClockMs)
      .filter((ms): ms is number => ms !== undefined);
    if (durations.length >= 2) {
      const sorted = [...durations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const threshold = median * 2;
      for (const batch of batches) {
        if (batch.wallClockMs !== undefined && batch.wallClockMs > threshold) {
          // Flag all nodes in the slow batch
          for (const nodeId of batch.nodes) {
            gaps.push({
              type: 'velocity-decay',
              nodeId,
              artifact: `batch-level-${batch.level}:${batch.wallClockMs}ms (median: ${median}ms)`,
            });
          }
        }
      }
    }
  }

  return { gaps };
}
