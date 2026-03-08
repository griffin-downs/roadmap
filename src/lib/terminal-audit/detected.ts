// @module terminal-audit/detected
// @description Gap detection — finds uncovered consumes and untested produces in the DAG
// @exports GapEntry, DetectedGaps, detectGaps

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

export type GapType = 'uncovered-consume' | 'untested-produce';

export interface GapEntry {
  type: GapType;
  nodeId: string;
  artifact: string;
}

export interface DetectedGaps {
  gaps: GapEntry[];
}

/**
 * Detect two mechanical gap types in the DAG:
 *
 * 1. uncovered-consume — an artifact consumed by a node where no predecessor
 *    produces it with a shell validator (i.e. the contract is unguarded).
 *
 * 2. untested-produce — an artifact produced by a node but no validator
 *    in the DAG references it (the output has no acceptance test).
 */
export function detectGaps(dag: Graph<string>): DetectedGaps {
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

  return { gaps };
}
