/**
 * Multi-repo dependency discovery
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DependencySpec } from './project-metadata.schema.ts';

export async function discoverDependencies(repoRoot: string): Promise<DependencySpec[]> {
  try {
    // Check for .roadmap.json in repo
    const metaPath = join(repoRoot, '.roadmap.json');
    const metaContent = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);

    return meta.dependencies || [];
  } catch {
    // No metadata, return empty
    return [];
  }
}

export async function orderByDependencies(deps: DependencySpec[]): Promise<string[]> {
  // Topological sort: which repos must complete first?
  const order: string[] = [];
  const visited = new Set<string>();

  function visit(repo: string) {
    if (visited.has(repo)) return;
    visited.add(repo);

    // Find deps that this repo depends on
    const myDeps = deps.filter(d => d.repo === repo);
    for (const dep of myDeps) {
      // In the future: visit(dep.repo)
    }

    order.push(repo);
  }

  for (const dep of deps) {
    visit(dep.repo);
  }

  return order;
}
