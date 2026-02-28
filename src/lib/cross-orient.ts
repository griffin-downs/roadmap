/**
 * Cross-repo orientation: check local DAG position + sibling repo dependency status.
 * Async — parallelizes sibling repo checks.
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { orient } from '../protocol.ts';
import type { Orientation, Graph } from '../protocol.ts';
import { CompletionStore } from './completion-context.ts';
import { fileExists } from '../predicates.ts';
import { discoverDependencies, resolveSiblingPath } from './dependency-resolver.ts';
import type { DependencySpec } from './project-metadata.schema.ts';

export interface SiblingStatus {
  readonly repo: string;
  readonly path: string;
  readonly position: string[] | 'unknown' | 'untracked';
  readonly satisfied: boolean;
  readonly waiting: string[];
  readonly repoExists: boolean;
  readonly dagExists: boolean;
}

export interface CrossOrientation extends Orientation {
  readonly blockedBy: SiblingStatus[];
  readonly deps: SiblingStatus[];
}

async function loadSiblingDAG(repoRoot: string): Promise<Graph<string> | null> {
  try {
    const content = await readFile(resolve(repoRoot, '.roadmap/head.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function checkSibling(localRoot: string, dep: DependencySpec): Promise<SiblingStatus> {
  const sibPath = resolveSiblingPath(localRoot, dep);
  const repoName = basename(sibPath);

  if (!existsSync(sibPath)) {
    return {
      repo: repoName, path: sibPath, position: 'unknown',
      satisfied: false, waiting: [...dep.consumes], repoExists: false, dagExists: false,
    };
  }

  const sibExists = fileExists(sibPath);
  const waiting = dep.consumes.filter(c => !sibExists(c));

  const dag = await loadSiblingDAG(sibPath);
  let position: string[] | 'unknown' | 'untracked' = 'untracked';
  if (dag) {
    // Sibling repos use loadOrEmpty — they may not have completion tracking
    const sibCompletion = CompletionStore.loadOrEmpty(sibPath);
    const sibOrientation = orient(dag, sibCompletion);
    position = sibOrientation.position;
  }

  return {
    repo: repoName, path: sibPath, position,
    satisfied: waiting.length === 0, waiting,
    repoExists: true, dagExists: dag !== null,
  };
}

export async function crossOrient<T extends string>(
  g: Graph<T>,
  _repoRoot: string,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Promise<CrossOrientation> {
  const local = orient(g, completion, retired);

  const deps = await discoverDependencies(_repoRoot);
  if (!deps.length) {
    return { ...local, blockedBy: [], deps: [] };
  }

  const siblingStatuses = await Promise.all(
    deps.map(d => checkSibling(_repoRoot, d))
  );

  const blockedBy = siblingStatuses.filter(s =>
    !s.satisfied && deps.find(d => basename(resolveSiblingPath(_repoRoot, d)) === s.repo)?.mustComplete
  );

  return { ...local, blockedBy, deps: siblingStatuses };
}
