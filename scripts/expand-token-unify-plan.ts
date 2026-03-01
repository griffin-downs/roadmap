#!/usr/bin/env npx tsx
// Expansion: token-unify-plan — unify claims + strategy latch + breakglass under BoundToken.
// Single schema, single storage (.roadmap/tokens/), single CLI surface (roadmap token *).
// Kill hint/latch detection — strategies always-surfaced via SGK-1 E5 makes it redundant.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

graph.nodes['token-unify-plan'] = {
  id: 'token-unify-plan',
  desc: 'Unify claims, strategy latch, and breakglass under a single BoundToken schema. Single storage at .roadmap/tokens/, single CLI surface (roadmap token issue/list/inspect/revoke/gc). Delete hint/latch detection — SGK-1 E5 makes it redundant by always surfacing strategies in orient JSON.',
  mode: 'plan',
  produces: [
    '.specify/pre-spec/token-unify.md',
    '.specify/specs/token-unify/spec.md',
    '.specify/specs/token-unify/tasks.md',
  ],
  consumes: [],
  ambient: [
    'src/lib/claims.ts',
    'src/lib/strategy/hints.ts',
    'src/lib/strategy/active.ts',
    'src/lib/strategy/schema.ts',
    'src/lib/strategy/select.ts',
  ],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', path: '.specify/pre-spec/token-unify.md' },
    { type: 'artifact-exists', path: '.specify/specs/token-unify/spec.md' },
    { type: 'artifact-exists', path: '.specify/specs/token-unify/tasks.md' },
    { type: 'expanded', minNodes: 3 },
  ],
  idempotent: false,
};

if (!graph.nodes['integration-terminal'].deps.includes('token-unify-plan')) {
  graph.nodes['integration-terminal'].deps.push('token-unify-plan');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log('Expanded: token-unify-plan added, wired into integration-terminal.deps');
