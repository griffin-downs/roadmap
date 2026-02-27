#!/usr/bin/env node --experimental-strip-types
// Expand spec-threading-feature: generate 9 implementation nodes

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Graph, NodeSpec } from '../src/protocol.ts';

const repoRoot = process.cwd();
const headPath = resolve(repoRoot, '.roadmap/head.json');

// Load current DAG
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph;

// Load the spec-threading template
const template = JSON.parse(
  readFileSync(resolve(repoRoot, '.roadmap/spec-threading.json'), 'utf-8')
);

console.log('📋 Expanding spec-threading-feature...');

let added = 0;

Object.entries(template.nodes).forEach(([nodeId, node]: [string, any]) => {
  // Skip init/term from template (they're structural, not implementation)
  if (nodeId === 'init' || nodeId === 'term') return;

  // Skip if already exists (idempotent)
  if ((dag.nodes as Record<string, any>)[nodeId]) {
    console.log(`   ⏭️  ${nodeId} already exists`);
    return;
  }

  // Fix deps: replace template's "init" and "term" references with actual DAG ones
  let deps = node.deps || [];
  deps = deps.map((d: string) => {
    if (d === 'init') return dag.init;
    if (d === 'term') return dag.term; // Point to actual term in main DAG
    return d;
  });

  const expanded = {
    id: node.id,
    desc: node.desc,
    produces: node.produces || [],
    consumes: node.consumes || [],
    deps,
    validate: node.validate || [],
    idempotent: node.idempotent ?? true,
    mode: node.mode || 'execute',
    expandedFrom: 'spec-threading-feature',
  } as NodeSpec;

  (dag.nodes as Record<string, NodeSpec>)[nodeId] = expanded;
  added++;
  console.log(`   ✅ ${nodeId}`);
});

// Write updated DAG
writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');

console.log(`\n✅ Expanded 9 nodes (idempotent)`);
console.log(`   Added: ${added}`);
console.log(`   Total nodes: ${Object.keys(dag.nodes).length}`);
