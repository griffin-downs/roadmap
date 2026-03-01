#!/usr/bin/env node

// Expansion script for metaflow-optimizer 6-hour mining loop
// Generates a 44-node DAG: 1 init + 1 bootstrap + 8×5 iteration nodes + 3 terminal nodes

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Graph } from '../src/protocol.ts';

type NodeId = string & { readonly __brand: 'NodeId' };

function node(id: string): NodeId {
  return id as NodeId;
}

const INIT = node('init');
const BOOTSTRAP = node('bootstrap');
const TERM = node('optimizer-terminal');

// Generate iteration nodes
const iterationNodes = (n: number) => ({
  mine: node(`iter-${n}-mine`),
  audit: node(`iter-${n}-audit`),
  propose: node(`iter-${n}-propose`),
  implement: node(`iter-${n}-implement`),
  measure: node(`iter-${n}-measure`),
});

// Terminal nodes
const GATE = node('optimizer-gate');
const REPORT = node('optimizer-report');

const iterations = Array.from({ length: 8 }, (_, i) => iterationNodes(i + 1));

type AllNodeIds = typeof INIT | typeof BOOTSTRAP | ReturnType<typeof iterationNodes>[keyof ReturnType<typeof iterationNodes>] | typeof GATE | typeof REPORT | typeof TERM;

const graph: Graph<AllNodeIds> = {
  id: 'metaflow-optimizer',
  desc: '6-hour mining & self-improvement loop — optimize roadmap CLI performance via iteration',
  init: INIT,
  term: TERM,
  nodes: {
    [INIT]: {
      id: INIT,
      desc: 'Synthetic init — root of optimizer DAG',
      produces: ['.roadmap/metaflow-optimizer/init.marker'],
      consumes: [],
      deps: [],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/init.marker',
        },
      ],
      idempotent: true,
    },

    [BOOTSTRAP]: {
      id: BOOTSTRAP,
      desc: 'Write targets.json and compute baseline metrics from metaflows-p1',
      produces: ['.roadmap/metaflow-optimizer/targets.json', '.roadmap/metaflow-optimizer/baseline.json'],
      consumes: [],
      deps: [INIT],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/targets.json',
        },
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/baseline.json',
        },
      ],
      idempotent: true,
      ambient: [
        '.roadmap/metaflow/performance/latency-data.json',
        '.roadmap/metaflow/performance/optimization-proposals.json',
        '.roadmap/metaflow/coherence/coherence-report.json',
        '.roadmap/mining/aggregated.json',
      ],
    },

    // Iteration 1
    [iterations[0].mine]: {
      id: iterations[0].mine,
      desc: 'Mine execution data from current run',
      produces: ['.roadmap/metaflow-optimizer/iter-1/mining.json'],
      consumes: ['.roadmap/metaflow-optimizer/baseline.json'],
      deps: [BOOTSTRAP],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/iter-1/mining.json',
        },
      ],
      idempotent: true,
    },

    [iterations[0].audit]: {
      id: iterations[0].audit,
      desc: 'Run compliance audit on mined data',
      produces: ['.roadmap/metaflow-optimizer/iter-1/audit.json'],
      consumes: ['.roadmap/metaflow-optimizer/iter-1/mining.json'],
      deps: [iterations[0].mine],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/iter-1/audit.json',
        },
      ],
      idempotent: true,
    },

    [iterations[0].propose]: {
      id: iterations[0].propose,
      desc: 'Generate optimization proposals',
      produces: ['.roadmap/metaflow-optimizer/iter-1/proposals.json'],
      consumes: ['.roadmap/metaflow-optimizer/iter-1/audit.json'],
      deps: [iterations[0].audit],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/iter-1/proposals.json',
        },
      ],
      idempotent: true,
    },

    [iterations[0].implement]: {
      id: iterations[0].implement,
      desc: 'Implement top-priority optimization proposal',
      produces: ['.roadmap/metaflow-optimizer/iter-1/impl.json'],
      consumes: ['.roadmap/metaflow-optimizer/iter-1/proposals.json'],
      deps: [iterations[0].propose],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/iter-1/impl.json',
        },
        {
          type: 'shell',
          command: 'npm test --silent > /dev/null 2>&1',
          expectExitCode: 0,
        },
      ],
      idempotent: true,
    },

    [iterations[0].measure]: {
      id: iterations[0].measure,
      desc: 'Measure performance metrics after optimization',
      produces: ['.roadmap/metaflow-optimizer/iter-1/metrics.json'],
      consumes: ['.roadmap/metaflow-optimizer/iter-1/impl.json'],
      deps: [iterations[0].implement],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/iter-1/metrics.json',
        },
      ],
      idempotent: true,
    },

    // Iterations 2-8 (repeating pattern with early-exit sentinel check)
    ...iterations.slice(1).flatMap((iter, idx) => {
      const n = idx + 2;
      const prevMeasure = iterations[idx].measure;

      return [
        {
          [iter.mine]: {
            id: iter.mine,
            desc: `Iter ${n}: Mine execution data`,
            produces: [`.roadmap/metaflow-optimizer/iter-${n}/mining.json`],
            consumes: [`.roadmap/metaflow-optimizer/iter-${n - 1}/metrics.json`],
            deps: [prevMeasure],
            validate: [
              {
                type: 'artifact-exists',
                target: `.roadmap/metaflow-optimizer/iter-${n}/mining.json`,
              },
            ],
            idempotent: true,
          },

          [iter.audit]: {
            id: iter.audit,
            desc: `Iter ${n}: Run compliance audit`,
            produces: [`.roadmap/metaflow-optimizer/iter-${n}/audit.json`],
            consumes: [`.roadmap/metaflow-optimizer/iter-${n}/mining.json`],
            deps: [iter.mine],
            validate: [
              {
                type: 'shell',
                command: `test ! -f .roadmap/metaflow-optimizer/targets-achieved.json`,
                expectExitCode: 0,
              },
              {
                type: 'artifact-exists',
                target: `.roadmap/metaflow-optimizer/iter-${n}/audit.json`,
              },
            ],
            idempotent: true,
          },

          [iter.propose]: {
            id: iter.propose,
            desc: `Iter ${n}: Generate proposals`,
            produces: [`.roadmap/metaflow-optimizer/iter-${n}/proposals.json`],
            consumes: [`.roadmap/metaflow-optimizer/iter-${n}/audit.json`],
            deps: [iter.audit],
            validate: [
              {
                type: 'artifact-exists',
                target: `.roadmap/metaflow-optimizer/iter-${n}/proposals.json`,
              },
            ],
            idempotent: true,
          },

          [iter.implement]: {
            id: iter.implement,
            desc: `Iter ${n}: Implement top optimization`,
            produces: [`.roadmap/metaflow-optimizer/iter-${n}/impl.json`],
            consumes: [`.roadmap/metaflow-optimizer/iter-${n}/proposals.json`],
            deps: [iter.propose],
            validate: [
              {
                type: 'artifact-exists',
                target: `.roadmap/metaflow-optimizer/iter-${n}/impl.json`,
              },
              {
                type: 'shell',
                command: 'npm test --silent > /dev/null 2>&1',
                expectExitCode: 0,
              },
            ],
            idempotent: true,
          },

          [iter.measure]: {
            id: iter.measure,
            desc: `Iter ${n}: Measure metrics`,
            produces: [`.roadmap/metaflow-optimizer/iter-${n}/metrics.json`],
            consumes: [`.roadmap/metaflow-optimizer/iter-${n}/impl.json`],
            deps: [iter.implement],
            validate: [
              {
                type: 'artifact-exists',
                target: `.roadmap/metaflow-optimizer/iter-${n}/metrics.json`,
              },
            ],
            idempotent: true,
          },
        },
      ];
    }).reduce((acc, obj) => ({ ...acc, ...obj }), {}),

    // Terminal nodes
    [GATE]: {
      id: GATE,
      desc: 'Check if all optimization targets met',
      produces: ['.roadmap/metaflow-optimizer/optimizer-gate.json'],
      consumes: ['.roadmap/metaflow-optimizer/iter-8/metrics.json'],
      deps: [iterations[7].measure],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/optimizer-gate.json',
        },
      ],
      idempotent: true,
    },

    [REPORT]: {
      id: REPORT,
      desc: 'Synthesize iteration metrics into final report',
      produces: ['.roadmap/metaflow-optimizer/optimizer-report.json'],
      consumes: Array.from({ length: 8 }, (_, i) => `.roadmap/metaflow-optimizer/iter-${i + 1}/metrics.json`),
      deps: [GATE],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/optimizer-report.json',
        },
      ],
      idempotent: true,
    },

    [TERM]: {
      id: TERM,
      desc: 'Metaflow optimizer complete — targets met or 8 iterations done',
      produces: ['.roadmap/metaflow-optimizer/intent-optimizer-terminal.json'],
      consumes: ['.roadmap/metaflow-optimizer/optimizer-report.json'],
      deps: [REPORT],
      validate: [
        {
          type: 'artifact-exists',
          target: '.roadmap/metaflow-optimizer/intent-optimizer-terminal.json',
        },
      ],
      idempotent: true,
    },
  },
};

// Write the DAG
const outPath = '.roadmap/head.metaflow-optimizer.json';
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(graph, null, 2));
console.log(`✓ Created ${outPath} (44 nodes)`);
