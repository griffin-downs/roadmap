// @module metaflow-optimizer
// @exports buildOptimizerFlows, writeFlowsToDirectory
// @types OptimizerFlowConfig

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Flow, FlowIndex } from '../phases/flow-schema.ts';

export interface OptimizerFlowConfig {
  iterN: number;
  baseDir: string;
}

/**
 * Build optimizer flow for a single iteration.
 * Returns a Flow object with 5 steps: mine, audit, propose, implement, measure.
 */
export function buildOptimizerFlow(iterN: number): Flow {
  const prefix = `opt-${iterN}`;
  const iterPath = `.roadmap/metaflow-optimizer/iter-${iterN}`;

  return {
    schemaVersion: 1,
    id: `optimizer-iter-${iterN}`,
    desc: `Optimizer iteration ${iterN}`,
    stageMin: 1,
    stageMax: 5,
    requiresAuthority: false,
    steps: [
      {
        id: `${prefix}-mine`,
        cmd: 'roadmap internal optimizer-mine',
        args: { iterN },
        produces: [`${iterPath}/mining.json`],
        consumes: [
          '.roadmap/metaflow-optimizer/baseline.json',
          '.roadmap/mining/aggregated.json',
        ],
        validate: [{ type: 'artifact-exists', target: `${iterPath}/mining.json` }],
        desc: 'Mine execution data from aggregated.json; detect friction',
        render: { required: false },
      },
      {
        id: `${prefix}-audit`,
        cmd: 'roadmap internal optimizer-audit',
        args: { iterN },
        produces: [`${iterPath}/audit.json`],
        consumes: [`${iterPath}/mining.json`],
        validate: [{ type: 'artifact-exists', target: `${iterPath}/audit.json` }],
        desc: 'Audit and categorize friction findings',
        render: { required: false },
      },
      {
        id: `${prefix}-propose`,
        cmd: 'roadmap internal optimizer-propose',
        args: { iterN },
        produces: [`${iterPath}/proposals.json`],
        consumes: [
          `${iterPath}/audit.json`,
          '.roadmap/mining/aggregated.json',
        ],
        validate: [{ type: 'artifact-exists', target: `${iterPath}/proposals.json` }],
        desc: 'Generate optimization proposals from friction analysis',
        render: { required: false },
      },
      {
        id: `${prefix}-implement`,
        cmd: 'roadmap internal optimizer-implement',
        args: { iterN },
        produces: [`${iterPath}/impl.json`],
        consumes: [`${iterPath}/proposals.json`],
        validate: [{ type: 'artifact-exists', target: `${iterPath}/impl.json` }],
        desc: 'Record top proposal as plan (not code implementation)',
        render: { required: false },
      },
      {
        id: `${prefix}-measure`,
        cmd: 'roadmap internal optimizer-measure',
        args: { iterN },
        produces: [`${iterPath}/metrics.json`],
        consumes: [
          `${iterPath}/impl.json`,
          `${iterPath}/mining.json`,
          '.roadmap/metaflow/coherence/coherence-report.json',
          '.roadmap/metaflow/recovery/recovery-report.json',
        ],
        validate: [{ type: 'artifact-exists', target: `${iterPath}/metrics.json` }],
        desc: 'Measure real metrics; write sentinel if targets met',
        render: { required: false },
      },
    ],
  };
}

/**
 * Build all 8 optimizer flows.
 */
export function buildAllOptimizerFlows(): Flow[] {
  const flows: Flow[] = [];
  for (let i = 1; i <= 8; i++) {
    flows.push(buildOptimizerFlow(i));
  }
  return flows;
}

/**
 * Write flow files to .roadmap/flows/ and create INDEX.json.
 * Called at bootstrap to generate the flow registry.
 */
export function writeOptimizationsFlows(baseDir: string): void {
  const flowsDir = join(baseDir, '.roadmap', 'flows');
  mkdirSync(flowsDir, { recursive: true });

  const flows = buildAllOptimizerFlows();
  const ids: string[] = [];

  for (const flow of flows) {
    const flowFile = join(flowsDir, `${flow.id}.json`);
    writeFileSync(flowFile, JSON.stringify(flow, null, 2));
    ids.push(flow.id);
  }

  // Write INDEX.json
  const index: FlowIndex = { ids };
  const indexFile = join(flowsDir, 'INDEX.json');
  writeFileSync(indexFile, JSON.stringify(index, null, 2));
}

/**
 * CLI entry point: node -e "import('./flow-builder.ts').then(m => m.main())"
 */
export async function main(): Promise<void> {
  const baseDir = process.cwd();
  try {
    writeOptimizationsFlows(baseDir);
    console.log('✓ Generated 8 optimizer flows in .roadmap/flows/');
    console.log('  optimizer-iter-1.json through optimizer-iter-8.json');
    console.log('  INDEX.json created');
  } catch (e) {
    console.error('✗ Failed to generate optimizer flows:', e);
    process.exit(1);
  }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
