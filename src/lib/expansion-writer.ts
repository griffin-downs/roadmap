// @module expansion-writer
// @exports writeExpansionScript
// @types none
// @entry roadmap

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NodeSpec } from '../protocol.ts';
import type { FixNodeSpec, IntentFailure } from './intent/intent-expansion.ts';

export interface ExpansionWriterOptions {
  parentId: string;
  parentNode: NodeSpec<any, any>;
  failures: IntentFailure[];
  fixNodes: FixNodeSpec[];
  reason: 'intent-expansion' | 'runtime-explore' | 'escalation-recovery';
  repoRoot: string;
}

export function writeExpansionScript(opts: ExpansionWriterOptions): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const expansionDir = join(opts.repoRoot, '.roadmap', 'expansions');

  // Ensure expansions directory exists
  mkdirSync(expansionDir, { recursive: true });

  const filename = `${opts.parentId}-${timestamp}.ts`;
  const filepath = join(expansionDir, filename);

  // Generate file content
  const content = generateExpansionScript({
    parentId: opts.parentId,
    parentNode: opts.parentNode,
    fixNodes: opts.fixNodes,
    reason: opts.reason,
    timestamp: new Date(timestamp * 1000).toISOString(),
  });

  writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

interface GenerateOptions {
  parentId: string;
  parentNode: NodeSpec<any, any>;
  fixNodes: FixNodeSpec[];
  reason: string;
  timestamp: string;
}

function generateExpansionScript(opts: GenerateOptions): string {
  const lines: string[] = [];

  // Header comments
  lines.push('#!/usr/bin/env node');
  lines.push(`// Expansion script for: ${opts.parentId}`);
  lines.push(`// Generated: ${opts.timestamp}`);
  lines.push(`// Parent: ${opts.parentId}`);
  lines.push(`// Reason: ${opts.reason}`);
  lines.push('');

  // Imports
  lines.push("import { readFileSync, writeFileSync } from 'node:fs';");
  lines.push("import { join } from 'node:path';");
  lines.push("import type { FixNodeSpec } from '../src/lib/intent/intent-expansion.ts';");
  lines.push('');

  // Load DAG
  lines.push("const headPath = join(process.cwd(), '.roadmap', 'head.json');");
  lines.push("const dag = JSON.parse(readFileSync(headPath, 'utf-8'));");
  lines.push('');

  // Section divider
  lines.push('// ─────────────────────────────────────────────────────────');
  lines.push(`// Expansion: ${opts.fixNodes.length} fix node(s) for ${opts.reason}`);
  lines.push('// ─────────────────────────────────────────────────────────');
  lines.push('');

  // Add each fix node assignment
  for (const fixNode of opts.fixNodes) {
    lines.push(`dag.nodes['${fixNode.id}'] = ${JSON.stringify(fixNode, null, 2)};`);
    lines.push('');
  }

  // Connect: rewire parent deps if it's a plan node
  if ((opts.parentNode as any).mode === 'plan') {
    lines.push('// ─────────────────────────────────────────────────────────');
    lines.push('// Connect: rewire parent deps');
    lines.push('// ─────────────────────────────────────────────────────────');
    lines.push('');

    // Update parent node to depend on fix nodes
    const fixNodeIds = opts.fixNodes.map(n => n.id);
    const updatedParent = {
      ...opts.parentNode,
      deps: fixNodeIds,
    };

    lines.push(`dag.nodes['${opts.parentId}'] = ${JSON.stringify(updatedParent, null, 2)};`);
    lines.push('');
  }

  // Write back and output
  lines.push('// ─────────────────────────────────────────────────────────');
  lines.push('// Finalize');
  lines.push('// ─────────────────────────────────────────────────────────');
  lines.push('');
  lines.push("writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\\n');");
  lines.push(`console.log('Expanded: ${opts.parentId} → ${opts.fixNodes.map(n => n.id).join(', ')} (+${opts.fixNodes.length} node(s))');`);

  return lines.join('\n') + '\n';
}
