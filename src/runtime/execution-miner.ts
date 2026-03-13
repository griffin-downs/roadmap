// @module runtime/execution-miner
// @description Pure execution mining — Context → ExecutionFindings. No IO.
// @exports mineExecution, ExecutionFindings
// @entry roadmap

import type { Graph } from '../lib/protocol/types.ts';
import type { Context } from './context.ts';

// --- Types ---

export interface ExecutionFindings {
  /** Handoff discoveries not addressed by any DAG node (desc or produces) */
  unaddressedDiscoveries: { source: string; nodeId: string; item: string }[];
  /** Files changed outside declared produces (parsed from attributionWarnings) */
  scopeDrift: { file: string; nodeId?: string }[];
  /** Nodes whose only shell validators are grep commands */
  weakEvidence: { nodeId: string; validators: string[] }[];
  /** Blockers still present in final handoffs or at progress < 1 */
  unresolvedBlockers: { nodeId: string; blocker: string }[];
  /** Batches where wallClockMs > 2x median batch duration */
  velocitySignals: { level: number; signal: string }[];
}

// --- Pure helpers ---

function allNodeText(dag: Graph<string>): Set<string> {
  const texts = new Set<string>();
  for (const n of Object.values(dag.nodes)) {
    texts.add(n.desc.toLowerCase());
    for (const p of n.produces) texts.add(p.toLowerCase());
  }
  return texts;
}

function isAddressed(item: string, nodeTexts: Set<string>): boolean {
  const lower = item.toLowerCase();
  for (const text of nodeTexts) {
    if (text.includes(lower) || lower.includes(text)) return true;
  }
  return false;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// --- Main export ---

/**
 * Mine execution context for findings about what went wrong or was missed.
 * Pure function: all data comes through dag + context parameters. No IO.
 */
export function mineExecution(
  dag: Graph<string>,
  context: Context,
  attributionWarnings?: string[],
): ExecutionFindings {
  const nodeTexts = allNodeText(dag);

  // 1. Unaddressed discoveries from handoffs
  const unaddressedDiscoveries: ExecutionFindings['unaddressedDiscoveries'] = [];
  for (const [nodeId, entry] of context.handoffs) {
    const allHandoffs = [...entry.interims, ...(entry.final ? [entry.final] : [])];
    for (const h of allHandoffs) {
      for (const item of h.discovered) {
        if (!isAddressed(item, nodeTexts)) {
          unaddressedDiscoveries.push({ source: nodeId, nodeId, item });
        }
      }
    }
  }

  // 2. Scope drift from attributionWarnings
  const scopeDrift: ExecutionFindings['scopeDrift'] = [];
  for (const warning of attributionWarnings ?? []) {
    // Expected format: "file <path> changed outside produces of <nodeId>"
    // or just a file path — parse loosely
    const nodeMatch = warning.match(/outside\s+produces\s+of\s+(\S+)/i);
    const fileMatch = warning.match(/file\s+(\S+)/i) ?? warning.match(/^(\S+)/);
    if (fileMatch) {
      scopeDrift.push({
        file: fileMatch[1],
        ...(nodeMatch ? { nodeId: nodeMatch[1] } : {}),
      });
    }
  }

  // 3. Weak evidence: nodes where all shell validators are grep commands
  const weakEvidence: ExecutionFindings['weakEvidence'] = [];
  for (const n of Object.values(dag.nodes)) {
    const shellValidators = n.validate.filter((v) => v.type === 'shell');
    if (shellValidators.length === 0) continue;

    const allGrep = shellValidators.every((v) => {
      const cmd = 'command' in v
        ? (typeof v.command === 'string' ? v.command : (v.command as string[]).join(' '))
        : ('argv' in v ? (v as { argv: string[] }).argv.join(' ') : '');
      return cmd.includes('grep');
    });

    if (allGrep) {
      const labels = shellValidators.map((v) =>
        'command' in v
          ? (typeof v.command === 'string' ? v.command : (v.command as string[]).join(' '))
          : ('argv' in v ? (v as { argv: string[] }).argv.join(' ') : ''),
      );
      weakEvidence.push({ nodeId: n.id, validators: labels });
    }
  }

  // 4. Unresolved blockers from handoffs
  const unresolvedBlockers: ExecutionFindings['unresolvedBlockers'] = [];
  for (const [nodeId, entry] of context.handoffs) {
    // A blocker is unresolved if the final handoff still lists it OR progress < 1
    if (entry.final) {
      const finalBlockers = entry.final.blockers ?? [];
      for (const blocker of finalBlockers) {
        if (blocker.trim()) {
          unresolvedBlockers.push({ nodeId, blocker });
        }
      }
    } else {
      // No final handoff — check last interim for stuck blockers at progress < 1
      const interims = entry.interims;
      if (interims.length > 0) {
        const last = interims[interims.length - 1];
        if (last.progress < 1) {
          for (const blocker of last.blockers ?? []) {
            if (blocker.trim()) {
              unresolvedBlockers.push({ nodeId, blocker });
            }
          }
        }
      }
    }
  }

  // 5. Velocity signals: batches where wallClockMs > 2x median
  const velocitySignals: ExecutionFindings['velocitySignals'] = [];
  const batches = context.scoring?.batches ?? [];
  const durations = batches
    .map((b) => b.wallClockMs)
    .filter((ms): ms is number => ms !== undefined);

  if (durations.length >= 2) {
    const median = medianOf(durations);
    const threshold = median * 2;
    for (const batch of batches) {
      if (batch.wallClockMs !== undefined && batch.wallClockMs > threshold) {
        velocitySignals.push({
          level: batch.level,
          signal: `batch level ${batch.level}: ${batch.wallClockMs}ms (2× median ${median}ms, nodes: ${batch.nodes.join(', ')})`,
        });
      }
    }
  }

  return {
    unaddressedDiscoveries,
    scopeDrift,
    weakEvidence,
    unresolvedBlockers,
    velocitySignals,
  };
}
