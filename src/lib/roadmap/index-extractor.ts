// @module consolidation
// @exports extractMetadataIndex, IndexEntry, HeadIndex, MetadataIndexError, hashIndex
// @types IndexEntry, HeadIndex

import * as crypto from 'crypto';
import type { Graph, NodeSpec, ValidationRule } from '../../protocol.ts';
import type { MergeResult } from './dag-consolidator.ts';

export interface IndexEntry {
  id: string;
  phase: string;
  produces: readonly string[];
  consumes: readonly string[];
  deps: readonly string[];
  desc: string;
  mode?: 'execute' | 'plan';
  validate: readonly ValidationRule[];
  expandedFrom?: string;
  ambient?: readonly string[];
}

export interface HeadIndex {
  id: string;
  desc: string;
  sourceDAGs: string[];
  timestamp: string;
  entries: IndexEntry[];
  phaseMap: { [phaseId: string]: string[] }; // phase -> [nodeIds]
  nodeToPhase: { [nodeId: string]: string }; // node -> phase
  hash?: string; // content hash for change detection
}

export class MetadataIndexError extends Error {
  code: string;
  context: Record<string, any>;

  constructor(
    code: string,
    message: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'MetadataIndexError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Compute content hash of index for change detection
 */
export function hashIndex(index: Omit<HeadIndex, 'hash'>): string {
  const content = JSON.stringify(index, null, 2);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract metadata index from merged DAG
 * Creates a searchable index of all nodes with their phase, produces, consumes, deps
 * Enables fast lookups without full DAG traversal
 *
 * Output format: HeadIndex (compatible with head-index.json)
 */
export function extractMetadataIndex(
  mergeResult: MergeResult,
  includeHash: boolean = false
): HeadIndex {
  const { merged, phases, sourceFiles, timestamp } = mergeResult;

  // Build reverse phase map: node -> phase
  const nodeToPhase = new Map<string, string>();
  for (const [phaseId, nodeIds] of Object.entries(phases)) {
    nodeIds.forEach((nodeId) => nodeToPhase.set(nodeId, phaseId));
  }

  // Extract entries from all nodes
  const entries: IndexEntry[] = [];
  for (const [nodeId, nodeSpec] of Object.entries(merged.nodes)) {
    const phase = nodeToPhase.get(nodeId) || 'unknown';

    const entry: IndexEntry = {
      id: nodeId,
      phase,
      produces: nodeSpec.produces,
      consumes: normalizeConsumes(nodeSpec.consumes),
      deps: nodeSpec.deps,
      desc: nodeSpec.desc,
      validate: nodeSpec.validate,
    };

    // Include optional fields only if present
    if (nodeSpec.mode) {
      entry.mode = nodeSpec.mode;
    }

    if (nodeSpec.expandedFrom) {
      entry.expandedFrom = nodeSpec.expandedFrom;
    }

    if (nodeSpec.ambient && nodeSpec.ambient.length > 0) {
      entry.ambient = nodeSpec.ambient;
    }

    entries.push(entry);
  }

  const index: HeadIndex = {
    id: merged.id,
    desc: merged.desc,
    sourceDAGs: sourceFiles,
    timestamp,
    entries,
    phaseMap: phases as { [phaseId: string]: string[] },
    nodeToPhase: Object.fromEntries(nodeToPhase),
  };

  if (includeHash) {
    index.hash = hashIndex(index);
  }

  return index;
}

/**
 * Normalize consumes array: convert ConsumeSpec to artifact strings
 */
function normalizeConsumes(consumes: readonly any[]): readonly string[] {
  return consumes.map((c) => {
    if (typeof c === 'string') {
      return c;
    }
    // Handle { artifact: string; resolvedBy: string } case
    return (c.artifact as string) || '';
  });
}

/**
 * Query helpers on extracted index
 */
export function findNodesByPhase(index: HeadIndex, phase: string): IndexEntry[] {
  return index.entries.filter((e) => e.phase === phase);
}

/**
 * Find all nodes that produce a given artifact
 */
export function findProducers(index: HeadIndex, artifact: string): IndexEntry[] {
  return index.entries.filter((e) => e.produces.includes(artifact));
}

/**
 * Find all nodes that consume a given artifact
 */
export function findConsumers(index: HeadIndex, artifact: string): IndexEntry[] {
  return index.entries.filter((e) => e.consumes.includes(artifact));
}

/**
 * Find transitive dependencies of a node
 */
export function findTransitiveDeps(
  index: HeadIndex,
  nodeId: string,
  visited = new Set<string>()
): string[] {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const entry = index.entries.find((e) => e.id === nodeId);
  if (!entry) return [];

  const allDeps = [...(entry.deps || [])];
  for (const dep of entry.deps || []) {
    allDeps.push(...findTransitiveDeps(index, dep, visited));
  }

  return Array.from(new Set(allDeps));
}

/**
 * Find critical path: longest chain from any init-like node to any term-like node
 */
export function findCriticalPath(index: HeadIndex): string[] {
  const graph = buildGraphFromIndex(index);
  const path: string[] = [];

  function dfs(
    nodeId: string,
    currentPath: string[],
    visited: Set<string>
  ): string[] {
    if (visited.has(nodeId)) return currentPath;
    visited.add(nodeId);

    const entry = index.entries.find((e) => e.id === nodeId);
    if (!entry) return currentPath;

    currentPath.push(nodeId);

    // Find all dependents (nodes that depend on this one)
    const dependents = index.entries.filter((e) => e.deps.includes(nodeId));
    if (dependents.length === 0) {
      return currentPath;
    }

    let longestPath = currentPath;
    for (const dependent of dependents) {
      const pathFromDependent = dfs(dependent.id, [...currentPath], new Set(visited));
      if (pathFromDependent.length > longestPath.length) {
        longestPath = pathFromDependent;
      }
    }

    return longestPath;
  }

  // Start from nodes with no dependencies
  const roots = index.entries.filter((e) => !e.deps || e.deps.length === 0);
  let longestPath: string[] = [];

  for (const root of roots) {
    const path = dfs(root.id, [], new Set());
    if (path.length > longestPath.length) {
      longestPath = path;
    }
  }

  return longestPath;
}

/**
 * Helper: build adjacency structure for traversal
 */
function buildGraphFromIndex(index: HeadIndex): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const entry of index.entries) {
    if (!graph.has(entry.id)) {
      graph.set(entry.id, []);
    }
    // Add edges from this node to its dependents
    for (const dependent of index.entries) {
      if (dependent.deps.includes(entry.id)) {
        graph.get(entry.id)!.push(dependent.id);
      }
    }
  }

  return graph;
}

/**
 * Analyze index for gaps and issues
 */
export function analyzeIndexQuality(index: HeadIndex): {
  orphanNodes: string[];
  circularDeps: boolean;
  unreachableFromInit: string[];
  unreachableToTerm: string[];
} {
  const orphans: string[] = [];
  const unreachable: string[] = [];
  const unreachableToTerm: string[] = [];

  // Find nodes with no artifacts flowing through them
  for (const entry of index.entries) {
    if (
      (entry.produces.length === 0 || entry.consumes.length === 0) &&
      entry.deps.length === 0
    ) {
      orphans.push(entry.id);
    }
  }

  // Check for circular dependencies (simple)
  let hasCircular = false;
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCircularPath(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const entry = index.entries.find((e) => e.id === nodeId);
    for (const dep of entry?.deps || []) {
      if (!visited.has(dep)) {
        if (hasCircularPath(dep)) return true;
      } else if (recursionStack.has(dep)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const entry of index.entries) {
    visited.clear();
    recursionStack.clear();
    if (hasCircularPath(entry.id)) {
      hasCircular = true;
      break;
    }
  }

  return {
    orphanNodes: orphans,
    circularDeps: hasCircular,
    unreachableFromInit: unreachable,
    unreachableToTerm,
  };
}
