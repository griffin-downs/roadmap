// @module metaflow/opt-dag
// @exports buildOptimizationNodes, readMining, emitOptExpansion

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { MiningResult, OptimizationNode, RunId, FrictionCategory } from '../types.ts';
import { runDir } from '../fs.ts';

const FRICTION_TO_NODE: Record<FrictionCategory, { id: string; desc: string }> = {
  'orient-churn':      { id: 'opt-reduce-orient-churn',  desc: 'Cache orient result in run context; skip re-orient if headSha unchanged' },
  'validate-loop':     { id: 'opt-validate-cache',        desc: 'Cache validator output keyed by nodeId+headSha' },
  'tool-inflation':    { id: 'opt-merge-toolcalls',        desc: 'Batch repeated tool calls into single aggregate call' },
  'ask-churn':         { id: 'opt-streamline-questions',  desc: 'Merge redundant questions into single decision block' },
  'enforcement-retry': { id: 'opt-fix-enforcement-gaps',  desc: 'Add pre-check before blocked tool call' },
};

export function buildOptimizationNodes(mining: MiningResult): OptimizationNode[] {
  const seen = new Set<string>();
  const nodes: OptimizationNode[] = [];

  for (const finding of mining.friction) {
    const template = FRICTION_TO_NODE[finding.category];
    if (!template || seen.has(template.id)) continue;
    seen.add(template.id);
    nodes.push({
      id: template.id,
      desc: template.desc,
      produces: [`mining-patches/${template.id}.patch.json`],
      consumes: ['mining.json'],
      rationale: finding.detail,
    });
  }

  if (mining.teamReuseMissed && !seen.has('opt-enforce-team-reuse')) {
    nodes.push({
      id: 'opt-enforce-team-reuse',
      desc: 'Enforce team reuse by default in mf dispatch; TEAM_REUSE_MISSED becomes a hard gate',
      produces: ['mining-patches/opt-enforce-team-reuse.patch.json'],
      consumes: ['mining.json'],
      rationale: 'TEAM_REUSE_MISSED flagged: a reusable worker existed but a new team was created',
    });
  }

  return nodes;
}

export function readMining(runId: RunId, base = process.cwd()): MiningResult {
  const p = join(runDir(runId, base), 'mining.json');
  if (!existsSync(p)) throw new Error(`mining.json not found for run ${runId} — run: roadmap mf mine --run ${runId}`);
  return JSON.parse(readFileSync(p, 'utf8')) as MiningResult;
}

export function emitOptExpansion(runId: RunId, nodes: OptimizationNode[], base = process.cwd()): string {
  const expansionPath = join(base, '.roadmap', 'expansions', `expand-opt-${runId}.ts`);
  mkdirSync(dirname(expansionPath), { recursive: true });

  const nodeEntries = nodes.map(n => `
  '${n.id}': {
    id: '${n.id}' as const,
    desc: ${JSON.stringify(n.desc)},
    deps: ['mf-mine-run'] as const,
    produces: ${JSON.stringify(n.produces)},
    consumes: ${JSON.stringify(n.consumes)},
    validate: [{ type: 'artifact-exists' as const, target: ${JSON.stringify(n.produces[0])} }],
  },`).join('');

  const content = `// Auto-generated optimization expansion for run: ${runId}
// Generated: ${new Date().toISOString()}
import { expand } from '../src/protocol.ts';

export default expand({
  expandFrom: 'mf-opt-dag-generator',
  nodes: {${nodeEntries}
  },
});
`;
  writeFileSync(expansionPath, content);
  return expansionPath;
}
