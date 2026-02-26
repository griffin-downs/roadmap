// @module scaffold
// @exports buildScaffold
// @types StubFile, ScaffoldResult
// @entry roadmap

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import type { Graph } from '../protocol.ts';
import { order } from '../protocol.ts';

export interface StubFile {
  path: string;        // relative to repoRoot
  content: string;
  nodeId: string;
  existed: boolean;    // true if file already existed (was not overwritten)
}

export interface ScaffoldResult {
  stubs: StubFile[];
  typeCheckPassed?: boolean;   // undefined when --build-check not used
  typeErrors?: string[];       // undefined when --build-check not used
  dryRun: boolean;
  nodesScaffolded: number;     // nodes where at least one stub was written
  filesGenerated: number;      // total new stubs written (existed=false)
}

function generateStub(filePath: string, nodeId: string, consumes: readonly string[]): string {
  const ext = extname(filePath);
  const consumesStr = consumes.length ? consumes.join(', ') : 'nothing';

  if (ext === '.ts' || ext === '.tsx') {
    return `// @stub: ${nodeId}\n// consumes: ${consumesStr}\n\nexport {};\n`;
  }

  if (ext === '.vue') {
    return `<!-- @stub: ${nodeId} -->
<template>
  <div />
</template>
<script setup lang="ts">
// consumes: ${consumesStr}
</script>
`;
  }

  if (ext === '.css' || ext === '.scss') {
    return `/* @stub: ${nodeId} */\n`;
  }

  if (ext === '.json') {
    return `{}\n`;
  }

  if (ext === '.md') {
    return `# Stub: ${nodeId}\n`;
  }

  // everything else (.sh, .yaml, .html, etc.)
  return `# @stub: ${nodeId}\n`;
}

export async function buildScaffold<T extends string>(
  dag: Graph<T>,
  repoRoot: string,
  opts: { buildCheck?: boolean; dryRun?: boolean },
): Promise<ScaffoldResult> {
  const topo = order(dag);
  const stubs: StubFile[] = [];
  const nodesWithStubs = new Set<string>();

  // Traverse in topological order
  for (const nodeId of topo) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes];
    if (!node) continue;

    // Skip init, term, and plan nodes
    if (nodeId === dag.init || nodeId === dag.term) continue;
    if (node.mode === 'plan') continue;

    // Materialize stubs for each produced artifact
    for (const producedPath of node.produces) {
      const absPath = join(repoRoot, producedPath);
      const existed = existsSync(absPath);

      // Build stub content
      const consumesStr = node.consumes.map(c =>
        typeof c === 'string' ? c : c.artifact
      );
      const content = generateStub(producedPath, nodeId, consumesStr);

      // Create stub entry
      const stub: StubFile = {
        path: producedPath,
        content,
        nodeId,
        existed,
      };
      stubs.push(stub);

      // Write to disk (skip if existed or dryRun)
      if (!existed && !opts.dryRun) {
        const dir = dirname(absPath);
        mkdirSync(dir, { recursive: true });
        writeFileSync(absPath, content, 'utf-8');
      }

      // Track nodes that produced at least one stub
      if (!existed) {
        nodesWithStubs.add(nodeId);
      }
    }
  }

  // In dry-run mode, no files were actually written — report 0 regardless of what would have been generated.
  const filesGenerated = opts.dryRun ? 0 : stubs.filter(s => !s.existed).length;
  const result: ScaffoldResult = {
    stubs,
    dryRun: opts.dryRun ?? false,
    nodesScaffolded: nodesWithStubs.size,
    filesGenerated,
  };

  // Run type check if requested
  if (opts.buildCheck) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('npx tsc --noEmit', {
        cwd: repoRoot,
        stdio: 'pipe',
        env: { ...process.env, ROADMAP_VALIDATING: '1' },
      });
      result.typeCheckPassed = true;
    } catch (err) {
      result.typeCheckPassed = false;
      if (err instanceof Error && 'stderr' in err) {
        const stderr = (err as { stderr: Buffer }).stderr.toString('utf-8');
        result.typeErrors = stderr.split('\n').filter(line => line.trim());
      } else {
        result.typeErrors = [];
      }
    }
  }

  return result;
}
