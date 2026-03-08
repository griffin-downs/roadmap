// @module dag-dependency-resolver
// @exports analyzeDAGContract, buildDAGDependencyGraph, topologicalSortDAGs
// @types DAGContract, DAGDependencyGraph
// @entry internal

import type { Graph, NodeSpec } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

export interface DAGContract {
  id: string;
  produces: Set<string>;          // all artifacts this DAG produces (across all nodes)
  consumes: Set<string>;          // all artifacts this DAG consumes
  internalDeps: Map<string, Set<string>>; // node → artifacts it needs from other DAGs
}

export interface DAGDependencyGraph {
  dags: Map<string, DAGContract>;
  dependencies: Map<string, Set<string>>; // DAG A → [DAGs that A depends on]
  order: string[];                // topologically sorted DAG IDs
  hasCycle: boolean;
}

/**
 * Analyze a single DAG's contract:
 * - What does it produce (across all nodes)?
 * - What does it consume?
 * - Which nodes need external (cross-DAG) artifacts?
 */
export function analyzeDAGContract(dag: Graph<string>): DAGContract {
  const produces = new Set<string>();
  const consumes = new Set<string>();
  const internalDeps = new Map<string, Set<string>>();

  // Scan all nodes for produces/consumes
  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    // Collect produces
    if (node.produces) {
      node.produces.forEach(p => produces.add(p));
    }

    // Collect consumes (handle both string[] and ConsumeSpec[])
    if (node.consumes) {
      node.consumes.forEach(c => {
        consumes.add(consumeArtifact(c));
      });
    }
  }

  // Determine which consumed artifacts are internal (produced by same DAG)
  // vs external (must come from another DAG)
  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    if (node.consumes) {
      const externalDeps = node.consumes
        .map(c => consumeArtifact(c))
        .filter(artifact => !produces.has(artifact));
      if (externalDeps.length > 0) {
        internalDeps.set(nodeId, new Set(externalDeps));
      }
    }
  }

  return {
    id: dag.id,
    produces,
    consumes,
    internalDeps,
  };
}

/**
 * Build dependency graph between DAGs
 * DAG A depends on DAG B if:
 * - A consumes artifact X
 * - B produces artifact X
 * - A doesn't produce X internally
 */
export function buildDAGDependencyGraph(dags: Graph<string>[]): DAGDependencyGraph {
  const contracts = new Map<string, DAGContract>();
  const dependencies = new Map<string, Set<string>>();

  // Analyze each DAG
  for (const dag of dags) {
    const contract = analyzeDAGContract(dag);
    contracts.set(dag.id, contract);
    dependencies.set(dag.id, new Set());
  }

  // Build inter-DAG dependencies
  for (const [dagId, contract] of contracts.entries()) {
    // For each external dependency in this DAG
    for (const [nodeId, externalArtifacts] of contract.internalDeps.entries()) {
      // Find which DAG produces these artifacts
      for (const artifact of externalArtifacts) {
        for (const [otherId, otherContract] of contracts.entries()) {
          if (otherId !== dagId && otherContract.produces.has(artifact)) {
            // DAG dagId depends on DAG otherId
            dependencies.get(dagId)!.add(otherId);
          }
        }
      }
    }
  }

  // Topologically sort DAGs
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const order: string[] = [];
  let hasCycle = false;

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    if (recursionStack.has(nodeId)) {
      hasCycle = true;
      return;
    }

    recursionStack.add(nodeId);

    // Visit all dependencies first (so they come before this DAG)
    for (const depId of dependencies.get(nodeId) || []) {
      dfs(depId);
    }

    recursionStack.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }

  // Start DFS from all nodes
  for (const dagId of contracts.keys()) {
    dfs(dagId);
  }

  return {
    dags: contracts,
    dependencies,
    order,
    hasCycle,
  };
}

/**
 * Find all transitive dependencies for a DAG
 * (direct dependencies + their dependencies + etc.)
 */
export function getTransitiveDependencies(
  dagId: string,
  depGraph: DAGDependencyGraph
): Set<string> {
  const visited = new Set<string>();
  const stack = [dagId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Add all direct dependencies
    const deps = depGraph.dependencies.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          stack.push(dep);
        }
      }
    }
  }

  visited.delete(dagId); // Don't include self
  return visited;
}

/**
 * Check if DAG A can run before DAG B
 * (A doesn't depend on B)
 */
export function canRunInParallel(
  dagA: string,
  dagB: string,
  depGraph: DAGDependencyGraph
): boolean {
  const depsA = depGraph.dependencies.get(dagA) || new Set();
  const depsB = depGraph.dependencies.get(dagB) || new Set();

  // A and B can run in parallel if neither depends on the other
  return !depsA.has(dagB) && !depsB.has(dagA);
}

/**
 * Group DAGs into batches that can execute in parallel
 * Each batch contains DAGs with no dependencies between them
 */
export function groupDAGsIntoBatches(depGraph: DAGDependencyGraph): string[][] {
  const batches: string[][] = [];
  const processed = new Set<string>();

  for (const dagId of depGraph.order) {
    if (processed.has(dagId)) continue;

    // Start a new batch with this DAG
    const batch = [dagId];
    processed.add(dagId);

    // Add other unprocessed DAGs that can run in parallel with this batch
    for (const otherDagId of depGraph.order) {
      if (processed.has(otherDagId)) continue;

      // Check if otherDagId can run with all DAGs in current batch
      const canParallelize = batch.every(batchDagId =>
        canRunInParallel(otherDagId, batchDagId, depGraph)
      );

      if (canParallelize) {
        batch.push(otherDagId);
        processed.add(otherDagId);
      }
    }

    batches.push(batch);
  }

  return batches;
}
