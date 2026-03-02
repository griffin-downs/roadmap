/**
 * Expand dispatch-system phase
 * Seal brief execution with orchestration harness for next mining run
 */

import { define } from '../src/protocol.ts';
import type { Graph, NodeSpec } from '../src/protocol.ts';

const dispatchSystemPhase: Graph<
  | 'dispatch-init'
  | 'brief-gate-impl'
  | 'dispatch-coordinator-impl'
  | 'agent-executor-impl'
  | 'handoff-journal-impl'
  | 'orchestrator-harness'
  | 'dispatch-system-tests'
  | 'dispatch-system-complete'
> = {
  id: 'dispatch-system-phase',
  desc: 'Sealed brief orchestration: agents receive only their slice, no DAG introspection',
  init: 'dispatch-init',
  term: 'dispatch-system-complete',
  nodes: {
    'dispatch-init': {
      id: 'dispatch-init',
      desc: 'Initialize dispatch-system phase: module structure, types, contracts',
      produces: ['.dispatch/.gitkeep', 'src/lib/agent-dispatch/README.md'],
      consumes: [],
      deps: [],
      validate: [{ type: 'artifact-exists', path: '.dispatch/.gitkeep' }],
      idempotent: true,
      mode: 'execute',
    } as NodeSpec<any, 'dispatch-init'>,

    'brief-gate-impl': {
      id: 'brief-gate-impl',
      desc: 'Implement brief validation: contract checking before dispatch',
      produces: ['src/lib/agent-dispatch/brief-gate.ts'],
      consumes: ['src/lib/brief.ts', 'src/protocol.ts'],
      deps: ['dispatch-init'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
        { type: 'shell', command: 'npx vitest run tests/agent-dispatch.test.ts' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'brief-gate-impl'>,

    'dispatch-coordinator-impl': {
      id: 'dispatch-coordinator-impl',
      desc: 'Implement dispatch coordinator: batch computation, agent assignment, brief generation',
      produces: ['src/lib/agent-dispatch/dispatch-coordinator.ts'],
      consumes: ['src/lib/brief.ts', 'src/lib/agent-dispatch/brief-gate.ts'],
      deps: ['brief-gate-impl'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'dispatch-coordinator-impl'>,

    'agent-executor-impl': {
      id: 'agent-executor-impl',
      desc: 'Implement sealed agent executor: read brief, execute, checkpoint, handoff',
      produces: ['src/lib/agent-dispatch/agent-executor.ts'],
      consumes: ['src/lib/brief.ts', 'src/lib/handoff.ts', 'src/lib/agent-dispatch/handoff-journal.ts'],
      deps: ['dispatch-coordinator-impl'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'agent-executor-impl'>,

    'handoff-journal-impl': {
      id: 'handoff-journal-impl',
      desc: 'Implement handoff journal: interim checkpoints, final handoffs, chain loading',
      produces: ['src/lib/agent-dispatch/handoff-journal.ts'],
      consumes: ['src/lib/brief.ts'],
      deps: ['dispatch-init'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'handoff-journal-impl'>,

    'orchestrator-harness': {
      id: 'orchestrator-harness',
      desc: 'Implement orchestrator harness: reads dispatch plan, spawns sealed agents, coordinates completion',
      produces: ['src/lib/agent-dispatch/orchestrator.ts'],
      consumes: [
        'src/lib/agent-dispatch/dispatch-coordinator.ts',
        'src/lib/agent-dispatch/agent-executor.ts',
      ],
      deps: ['agent-executor-impl', 'handoff-journal-impl'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'orchestrator-harness'>,

    'dispatch-system-tests': {
      id: 'dispatch-system-tests',
      desc: 'Integration tests: orchestrator → agents → handoffs → next batch advancement',
      produces: ['tests/dispatch-system.integration.test.ts'],
      consumes: [
        'tests/agent-dispatch.test.ts',
        'src/lib/agent-dispatch/index.ts',
      ],
      deps: ['orchestrator-harness'],
      validate: [
        { type: 'shell', command: 'npx tsc --noEmit' },
        { type: 'shell', command: 'npx vitest run tests/dispatch-system' },
      ],
      idempotent: true,
    } as NodeSpec<any, 'dispatch-system-tests'>,

    'dispatch-system-complete': {
      id: 'dispatch-system-complete',
      desc: 'Dispatch system ready: sealed briefs, orchestration, handoffs working',
      produces: ['.dispatch/system-ready.json'],
      consumes: [],
      deps: ['dispatch-system-tests'],
      validate: [
        {
          type: 'shell',
          command: 'test -f .dispatch/system-ready.json && echo "Dispatch system ready"',
        },
      ],
      idempotent: false,
    } as NodeSpec<any, 'dispatch-system-complete'>,
  },
};

// Validate and export
const g = define(dispatchSystemPhase);
console.log(JSON.stringify({
  phase: 'dispatch-system',
  nodeCount: Object.keys(g.nodes).length,
  init: g.init,
  term: g.term,
  nodes: Object.keys(g.nodes),
}, null, 2));

export { dispatchSystemPhase };
