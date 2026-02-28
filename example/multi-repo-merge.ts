/**
 * Multi-repo coordination example: merge three repos (shared, frontend, backend)
 * at a common workspace root.
 */

import { graph, define, merge, orient, CompletionStore } from '../src/protocol';

// Shared library
const shared = define(
  graph({
    id: 'shared',
    desc: 'Shared utilities',
    init: 'init',
    term: 'published',
    nodes: {
      init: {
        id: 'init',
        desc: 'Source files exist',
        produces: ['shared/src/index.ts'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      compile: {
        id: 'compile',
        desc: 'Compile TypeScript',
        produces: ['shared/dist/index.js'],
        consumes: ['shared/src/index.ts'],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      published: {
        id: 'published',
        desc: 'Shared ready for consumption',
        produces: [],
        consumes: ['shared/dist/index.js'],
        deps: ['compile'],
        validate: [],
        idempotent: false,
      },
    },
  }),
);

// Frontend package
const frontend = define(
  graph({
    id: 'frontend',
    desc: 'Frontend application',
    init: 'setup',
    term: 'built',
    nodes: {
      setup: {
        id: 'setup',
        desc: 'Install dependencies, link shared',
        produces: ['frontend/node_modules/.bin/webpack'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Bundle application',
        produces: ['frontend/dist/app.js'],
        consumes: ['shared/dist/index.js', 'frontend/node_modules/.bin/webpack'],
        deps: ['setup'],
        validate: [],
        idempotent: true,
      },
      built: {
        id: 'built',
        desc: 'Frontend ready',
        produces: [],
        consumes: ['frontend/dist/app.js'],
        deps: ['build'],
        validate: [],
        idempotent: false,
      },
    },
  }),
);

// Backend service
const backend = define(
  graph({
    id: 'backend',
    desc: 'Backend service',
    init: 'setup',
    term: 'running',
    nodes: {
      setup: {
        id: 'setup',
        desc: 'Install dependencies, link shared',
        produces: ['backend/node_modules/.bin/tsc'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Compile TypeScript',
        produces: ['backend/dist/server.js'],
        consumes: ['shared/dist/index.js', 'backend/node_modules/.bin/tsc'],
        deps: ['setup'],
        validate: [],
        idempotent: true,
      },
      running: {
        id: 'running',
        desc: 'Backend ready',
        produces: [],
        consumes: ['backend/dist/server.js'],
        deps: ['build'],
        validate: [],
        idempotent: false,
      },
    },
  }),
);

// Merge phases
const step1 = merge(shared, frontend, [
  { g1Node: 'published', g2Node: 'setup', artifact: 'shared/dist/index.js' },
]);

const combined = merge(step1, backend, [
  { g1Node: 'published', g2Node: 'setup', artifact: 'shared/dist/index.js' },
]);

// Find position
const pos = orient(combined, CompletionStore.loadOrEmpty(process.cwd()));

console.log('=== Multi-Repo Workspace Status ===');
console.log(`Position: ${pos.position}`);
console.log(`Done: ${pos.done.length} nodes`);
console.log(`Remaining: ${pos.remaining.length} nodes`);
console.log(`Artifacts to produce: ${pos.produces.join(', ')}`);

export { shared, frontend, backend, combined, pos };
