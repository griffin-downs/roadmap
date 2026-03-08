// @module consolidation
// @exports LazyGraphLoader, loadGraphForBatch, getGraphMetadata, LoadStrategy
// @types LazyGraphLoader, LoadStrategy, GraphLoadResult

import * as fs from 'fs';
import * as path from 'path';
import type { Graph } from '../../protocol.ts';
import { node } from '../../core/access.ts';
import type { HeadIndex } from './index-extractor.ts';

export type LoadStrategy = 'minimal' | 'current-batch' | 'current-plus-next' | 'full';

export interface GraphLoadResult {
  metadata: HeadIndex;
  graph?: Graph<string>;
  strategy: LoadStrategy;
  loadedAt: string;
  bytesLoaded: number;
}

/**
 * Lazy graph loader: always load index, conditionally load full specs
 * Reduces startup latency and memory pressure for large consolidated DAGs
 */
export class LazyGraphLoader {
  private indexPath: string;
  private headPath: string;
  private cachedIndex: HeadIndex | undefined = undefined;
  private cachedGraph: Graph<string> | undefined = undefined;
  private lastGraphStrategy: LoadStrategy | undefined = undefined;
  private roadmapRoot: string;

  constructor(roadmapRoot: string) {
    this.roadmapRoot = roadmapRoot;
    this.indexPath = path.join(roadmapRoot, '.roadmap', 'head-index.json');
    this.headPath = path.join(roadmapRoot, '.roadmap', 'head.json');
  }

  /**
   * Load index (always, cached)
   * Index is lightweight and provides:
   * - node id, phase, produces, consumes, deps
   * - critical path computation
   * - artifact tracing (who produces what)
   */
  async loadIndex(): Promise<HeadIndex> {
    if (this.cachedIndex) {
      return this.cachedIndex;
    }

    if (!fs.existsSync(this.indexPath)) {
      throw new Error(`Index not found: ${this.indexPath}`);
    }

    const content = await fs.promises.readFile(this.indexPath, 'utf8');
    const index = JSON.parse(content) as HeadIndex;
    this.cachedIndex = index;
    return index;
  }

  /**
   * Load full graph with strategy:
   * - 'minimal': index only (fastest, no full DAG)
   * - 'current-batch': current batch nodes + their upstream
   * - 'current-plus-next': current + next batch
   * - 'full': entire consolidated DAG
   */
  async loadGraph(strategy: LoadStrategy = 'current-plus-next'): Promise<GraphLoadResult> {
    const startTime = Date.now();
    const index = await this.loadIndex();

    // If already loaded and strategy hasn't changed to 'full', return cached
    if (
      this.cachedGraph &&
      this.lastGraphStrategy === strategy &&
      strategy !== 'full'
    ) {
      return {
        metadata: index,
        graph: this.cachedGraph,
        strategy,
        loadedAt: new Date().toISOString(),
        bytesLoaded: JSON.stringify(this.cachedGraph).length,
      };
    }

    let graph: Graph<string> | undefined;

    if (strategy === 'minimal') {
      // Return index only, no full graph
      return {
        metadata: index,
        strategy,
        loadedAt: new Date().toISOString(),
        bytesLoaded: JSON.stringify(index).length,
      };
    }

    if (strategy === 'current-plus-next') {
      // Determine current position from filesystem state
      const currentBatch = this.determineCurrentBatch(index);
      const nextBatch = this.getNextBatch(index, currentBatch);
      const nodesToLoad = new Set<string>();

      // Add current batch
      currentBatch.forEach((nodeId) => nodesToLoad.add(nodeId));

      // Add next batch
      nextBatch.forEach((nodeId) => nodesToLoad.add(nodeId));

      // Add all upstream dependencies
      for (const nodeId of nodesToLoad) {
        this.addUpstreamDeps(nodeId, nodesToLoad, index);
      }

      graph = await this.loadPartialGraph(Array.from(nodesToLoad));
    } else if (strategy === 'current-batch') {
      const currentBatch = this.determineCurrentBatch(index);
      const nodesToLoad = new Set<string>(currentBatch);

      for (const nodeId of currentBatch) {
        this.addUpstreamDeps(nodeId, nodesToLoad, index);
      }

      graph = await this.loadPartialGraph(Array.from(nodesToLoad));
    } else if (strategy === 'full') {
      graph = await this.loadFullGraph();
    }

    this.cachedGraph = graph;
    this.lastGraphStrategy = strategy;

    return {
      metadata: index,
      graph,
      strategy,
      loadedAt: new Date().toISOString(),
      bytesLoaded: graph ? JSON.stringify(graph).length : 0,
    };
  }

  /**
   * Determine current batch from filesystem state
   * Current batch is first batch where any node artifacts are missing
   */
  private determineCurrentBatch(index: HeadIndex): string[] {
    // This would integrate with the protocol's orient() logic
    // For now, return empty (orchestrator will provide current batch context)
    return [];
  }

  /**
   * Get next batch after current
   */
  private getNextBatch(index: HeadIndex, currentBatch: string[]): string[] {
    if (currentBatch.length === 0) return [];

    const phases = Object.entries(index.phaseMap);
    let foundCurrent = false;

    for (const [phaseId, nodeIds] of phases) {
      const allNodesInBatch = nodeIds.every((id) => currentBatch.includes(id));
      if (allNodesInBatch) {
        foundCurrent = true;
        continue;
      }

      if (foundCurrent) {
        return nodeIds;
      }
    }

    return [];
  }

  /**
   * Add all upstream dependencies of a node to the load set
   */
  private addUpstreamDeps(
    nodeId: string,
    loadSet: Set<string>,
    index: HeadIndex
  ): void {
    const entry = index.entries.find((e) => e.id === nodeId);
    if (!entry) return;

    for (const dep of entry.deps) {
      if (!loadSet.has(dep)) {
        loadSet.add(dep);
        this.addUpstreamDeps(dep, loadSet, index);
      }
    }
  }

  /**
   * Load partial graph with only specified nodes
   */
  private async loadPartialGraph(nodeIds: string[]): Promise<Graph<string>> {
    const fullGraph = await this.loadFullGraph();
    const nodeSet = new Set(nodeIds);

    // Create partial graph with only requested nodes
    const partialNodes: { [key: string]: any } = {};
    for (const nodeId of nodeIds) {
      if (nodeId in fullGraph.nodes) {
        partialNodes[nodeId] = node(fullGraph, nodeId);
      }
    }

    return {
      id: fullGraph.id,
      desc: fullGraph.desc,
      init: fullGraph.init,
      term: fullGraph.term,
      nodes: nodes as any,
      spec: fullGraph.spec,
    };
  }

  /**
   * Load full consolidated DAG from head.json
   */
  private async loadFullGraph(): Promise<Graph<string>> {
    if (!fs.existsSync(this.headPath)) {
      throw new Error(`Head graph not found: ${this.headPath}`);
    }

    const content = await fs.promises.readFile(this.headPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Preload graph for batch execution
   * Preemptively load graph before batch starts for zero latency on orient/advance
   */
  async preloadForBatch(batchNodeIds: string[]): Promise<void> {
    const index = await this.loadIndex();
    const nodesToLoad = new Set<string>(batchNodeIds);

    // Add upstream deps
    for (const nodeId of batchNodeIds) {
      this.addUpstreamDeps(nodeId, nodesToLoad, index);
    }

    this.cachedGraph = await this.loadPartialGraph(Array.from(nodesToLoad));
    this.lastGraphStrategy = 'current-plus-next';
  }

  /**
   * Estimate memory cost of loading given strategy
   */
  estimateMemoryCost(strategy: LoadStrategy): number {
    // Index is ~50KB for typical DAGs
    let baseSize = 50 * 1024;

    if (strategy === 'minimal') {
      return baseSize;
    }

    // Full graph is typically 100-300KB depending on DAG size
    // Current batch + next is ~30% of full
    const fullGraphSize = 150 * 1024;

    if (strategy === 'current-batch') {
      return baseSize + fullGraphSize * 0.15;
    }

    if (strategy === 'current-plus-next') {
      return baseSize + fullGraphSize * 0.3;
    }

    return baseSize + fullGraphSize;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.cachedIndex = undefined;
    this.cachedGraph = undefined;
    this.lastGraphStrategy = undefined;
  }
}

/**
 * Convenience function: load graph for current batch with recommended strategy
 */
export async function loadGraphForBatch(
  roadmapRoot: string,
  strategy: LoadStrategy = 'current-plus-next'
): Promise<GraphLoadResult> {
  const loader = new LazyGraphLoader(roadmapRoot);
  return loader.loadGraph(strategy);
}

/**
 * Get metadata (index) only
 */
export async function getGraphMetadata(roadmapRoot: string): Promise<HeadIndex> {
  const loader = new LazyGraphLoader(roadmapRoot);
  return loader.loadIndex();
}
