// @module metaflow-optimizer
// @exports implement
// @types ImplementationResult, Proposal

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface Proposal {
  command: string;
  priority: string;
  issue: string;
  optimizations?: Array<{
    strategy: string;
    target?: string;
    expectedImprovement: string;
    effort: string;
  }>;
}

export interface ImplementationResult {
  iterN: number;
  proposal: string;
  strategy: string;
  targetFile: string;
  targetFunction: string;
  approach: string;
  estimatedImpact: {
    latencyReductionPct: number;
    tokenReductionPct: number;
  };
  status: 'recorded';
  timestamp: string;
}

interface OptimizationProposals {
  proposals?: Proposal[];
  timestamp?: string;
}

async function readProposals(path: string): Promise<Proposal[]> {
  if (!existsSync(path)) return [];
  try {
    const data: OptimizationProposals = JSON.parse(readFileSync(path, 'utf8'));
    return data.proposals || [];
  } catch {
    return [];
  }
}

export async function implement(iterN: number, baseDir: string): Promise<ImplementationResult> {
  const proposalPath = join(baseDir, `.roadmap/metaflow-optimizer/iter-${iterN}/proposals.json`);
  const proposals = await readProposals(proposalPath);

  // Pick top-priority proposal
  let topProposal: Proposal | null = null;
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const p of proposals) {
    if (!topProposal) {
      topProposal = p;
    } else {
      const currentPri = priorityOrder[p.priority as keyof typeof priorityOrder] ?? 3;
      const topPri = priorityOrder[topProposal.priority as keyof typeof priorityOrder] ?? 3;
      if (currentPri < topPri) {
        topProposal = p;
      }
    }
  }

  if (!topProposal) {
    // Default safe proposal: no-op
    return {
      iterN,
      proposal: 'noop',
      strategy: 'no-op-safe-default',
      targetFile: '',
      targetFunction: '',
      approach: 'No optimization proposals generated this iteration',
      estimatedImpact: {
        latencyReductionPct: 0,
        tokenReductionPct: 0,
      },
      status: 'recorded',
      timestamp: new Date().toISOString(),
    };
  }

  // Record top proposal honestly
  const strategy = topProposal.optimizations?.[0]?.strategy || 'unknown';
  const optimization = topProposal.optimizations?.[0];

  // Infer target from command name (e.g., 'orient' → bin/roadmap.ts:cmdOrient)
  const targetFile = topProposal.command === 'orient' ? 'bin/roadmap.ts' :
                     topProposal.command === 'complete' ? 'bin/roadmap.ts' :
                     topProposal.command === 'show' ? 'src/lib/metaflow/core.ts' :
                     'src/lib/core.ts';
  const targetFunction = `cmd${topProposal.command[0].toUpperCase()}${topProposal.command.slice(1)}`;

  // Extract impact from proposal (or estimate)
  const tokenEstimate = (topProposal as any).estimatedTokensPerRun || 100;
  const tokenReductionPct = Math.min(70, Math.round((tokenEstimate * 0.7) / tokenEstimate * 100));
  const latencyReductionPct = strategy === 'implement-result-cache' ? 40 :
                              strategy === 'batch-operations' ? 30 :
                              strategy === 'lazy-evaluation' ? 20 : 10;

  return {
    iterN,
    proposal: 'opt-' + strategy.replace(/-/g, '_'),
    strategy,
    targetFile,
    targetFunction,
    approach: optimization?.target || `Implement ${strategy}`,
    estimatedImpact: {
      latencyReductionPct,
      tokenReductionPct,
    },
    status: 'recorded',
    timestamp: new Date().toISOString(),
  };
}

export function writeImplementation(path: string, result: ImplementationResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2));
}
