import { readFileSync } from 'node:fs';
import { define, check, verify } from './src/protocol.ts';
import type { Graph } from './src/protocol.ts';

const dag = JSON.parse(readFileSync('.roadmap/head.json', 'utf-8')) as Graph;

console.log('📋 Validating expanded DAG\n');
console.log(`Nodes: ${Object.keys(dag.nodes).length}`);

try {
  define(dag);
  console.log('✅ define() — no cycles');
} catch (e) {
  console.log('❌ define():', e instanceof Error ? e.message : e);
  process.exit(1);
}

try {
  const result = check(dag);
  if (result.done) {
    console.log('✅ check() — all reachable');
  } else {
    console.log(`❌ check() — unreachable:`, result.unreachable);
  }
} catch (e) {
  console.log('❌ check():', e instanceof Error ? e.message : e);
  process.exit(1);
}

const gaps = verify(dag);
if (gaps.length === 0) {
  console.log('✅ verify() — all contracts satisfied\n');
  console.log('✨ DAG is valid!');
} else {
  console.log(`❌ verify() — ${gaps.length} gap(s):`);
  gaps.slice(0, 5).forEach(g => {
    console.log(`   ${g.node}: ${g.message}`);
  });
}
