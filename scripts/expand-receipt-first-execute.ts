#!/usr/bin/env npx tsx
// Expansion script: add receipt-first execute nodes as children of receipt-first-plan.
// 6 nodes: rf-cmd-receipt, rf-breakglass, rf-scenario-registry, rf-chain-enforcer, rf-verify-integration, rf-tests

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

const nodes: Record<string, any> = {
  'rf-cmd-receipt': {
    id: 'rf-cmd-receipt',
    desc: 'CmdReceipt writer module. CmdReceipt type + CmdReceiptWriter class. Writer creates receipt at .roadmap/receipts/cmd/<cmd>/<runId>.json. Emits on both success and failure. treeSha from git write-tree, headSha fallback.',
    produces: ['src/lib/receipt-first/cmd-receipt.ts'],
    consumes: [],
    ambient: ['src/lib/cli-envelope.ts'],
    deps: ['receipt-first-plan'],
    validate: [{ type: 'artifact-exists', path: 'src/lib/receipt-first/cmd-receipt.ts' }],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
  'rf-breakglass': {
    id: 'rf-breakglass',
    desc: 'Breakglass open/close commands + receipt schema. BreakglassReceipt type, writes to .roadmap/receipts/breakglass/<bg-id>.json. TTL, scope, follow-ups required.',
    produces: ['src/lib/receipt-first/breakglass.ts'],
    consumes: [],
    deps: ['receipt-first-plan'],
    validate: [{ type: 'artifact-exists', path: 'src/lib/receipt-first/breakglass.ts' }],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
  'rf-scenario-registry': {
    id: 'rf-scenario-registry',
    desc: 'Scenario registry + loader. ScenarioRegistry/ScenarioDef types. Registry at .roadmap/scenarios/SCENARIOS.json. loadScenarios(), findScenario(), isGated() helpers.',
    produces: ['src/lib/receipt-first/scenario-registry.ts'],
    consumes: [],
    deps: ['rf-cmd-receipt'],
    validate: [{ type: 'artifact-exists', path: 'src/lib/receipt-first/scenario-registry.ts' }],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
  'rf-chain-enforcer': {
    id: 'rf-chain-enforcer',
    desc: 'Enforcement funnel. enforceChain() — single enforcement path: load state → load scenario → load receipts → check breakglass → enforce chain → return go/no-go.',
    produces: ['src/lib/receipt-first/chain-enforcer.ts'],
    consumes: ['src/lib/receipt-first/cmd-receipt.ts', 'src/lib/receipt-first/scenario-registry.ts', 'src/lib/receipt-first/breakglass.ts'],
    deps: ['rf-scenario-registry', 'rf-breakglass'],
    validate: [{ type: 'artifact-exists', path: 'src/lib/receipt-first/chain-enforcer.ts' }],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
  'rf-verify-integration': {
    id: 'rf-verify-integration',
    desc: 'Verify integration surfacing breakglass. Active breakglass: show id, status, remaining TTL, scope, outstanding requiredFollowups.',
    produces: ['src/lib/receipt-first/verify-breakglass.ts'],
    consumes: ['src/lib/receipt-first/breakglass.ts', 'src/lib/receipt-first/chain-enforcer.ts'],
    deps: ['rf-chain-enforcer'],
    validate: [{ type: 'artifact-exists', path: 'src/lib/receipt-first/verify-breakglass.ts' }],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
  'rf-tests': {
    id: 'rf-tests',
    desc: 'Tests for AT-1 through AT-6. Command receipts, scenario gating, receipt binding, breakglass bypass/expiry, verify integration.',
    produces: ['test/receipt-first.test.ts'],
    consumes: [
      'src/lib/receipt-first/cmd-receipt.ts',
      'src/lib/receipt-first/scenario-registry.ts',
      'src/lib/receipt-first/chain-enforcer.ts',
      'src/lib/receipt-first/breakglass.ts',
      'src/lib/receipt-first/verify-breakglass.ts',
    ],
    deps: ['rf-verify-integration'],
    validate: [
      { type: 'artifact-exists', path: 'test/receipt-first.test.ts' },
      { type: 'shell', command: ['npx', 'vitest', 'run', 'test/receipt-first.test.ts'] },
    ],
    idempotent: false,
    expandedFrom: 'receipt-first-plan',
  },
};

for (const [id, node] of Object.entries(nodes)) {
  graph.nodes[id] = node;
}

// Wire rf-tests into integration-terminal deps (if not already)
if (graph.nodes['integration-terminal'] && !graph.nodes['integration-terminal'].deps.includes('rf-tests')) {
  graph.nodes['integration-terminal'].deps.push('rf-tests');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log(`Expanded: 6 receipt-first execute nodes added (expandedFrom: receipt-first-plan)`);
