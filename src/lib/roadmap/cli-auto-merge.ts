// @module consolidation
// @exports loadDAGWithAutoMerge, shouldAutoMerge, MergeStrategy
// @types MergeStrategy, AutoMergeResult

import * as fs from 'fs';
import * as path from 'path';
import { Graph } from '../../protocol';
import { discoverDAGFiles, mergeMultiWay, MergeResult } from './dag-consolidator';
import { LazyGraphLoader, LoadStrategy } from './lazy-graph-loader.ts';

export interface AutoMergeResult {
  graph: Graph<string>;
  isMerged: boolean;
  sourceDAGs?: string[];
  mergeResult?: MergeResult;
}

/**
 * Load DAG with automatic merge
 * If multiple DAGs exist, transparently merge them
 * If head-index.json is stale, regenerate it
 * Caches result for performance
 *
 * This is the primary entry point for CLI commands (orient, chart, show, complete)
 */
export async function loadDAGWithAutoMerge(
  roadmapRoot: string,
  strategy: LoadStrategy = 'current-plus-next'
): Promise<AutoMergeResult> {
  const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');
  const indexPath = path.join(roadmapRoot, '.roadmap', 'head-index.json');

  try {
    // Check if we should auto-merge
    const shouldMerge = await shouldAutoMerge(roadmapRoot);

    if (!shouldMerge) {
      // Single DAG case: load normally
      const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
      return {
        graph,
        isMerged: false,
      };
    }

    // Multi-DAG case: discover, merge, cache result
    const dagFiles = await discoverDAGFiles(roadmapRoot);

    // If only one file found, load normally
    if (dagFiles.length <= 1) {
      const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
      return {
        graph,
        isMerged: false,
      };
    }

    // Perform merge
    const mergeResult = mergeMultiWay(dagFiles);

    // Update head.json with merged result
    fs.writeFileSync(
      headPath,
      JSON.stringify(mergeResult.merged, null, 2)
    );

    // Ensure index exists for lazy loading
    await ensureIndexExists(roadmapRoot, mergeResult);

    return {
      graph: mergeResult.merged,
      isMerged: true,
      sourceDAGs: mergeResult.sourceFiles,
      mergeResult,
    };
  } catch (err: any) {
    // Fallback: attempt to load existing head.json
    if (fs.existsSync(headPath)) {
      const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
      return {
        graph,
        isMerged: false,
      };
    }
    throw err;
  }
}

/**
 * Determine if auto-merge should run
 * Conditions:
 * 1. Multiple DAG files exist in .roadmap/
 * 2. head.json is missing or older than source DAGs
 * 3. head-index.json is missing or stale
 */
export async function shouldAutoMerge(roadmapRoot: string): Promise<boolean> {
  try {
    const dagFiles = await discoverDAGFiles(roadmapRoot);
    if (dagFiles.length <= 1) return false;

    const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');
    const indexPath = path.join(roadmapRoot, '.roadmap', 'head-index.json');

    // If head.json doesn't exist, definitely merge
    if (!fs.existsSync(headPath)) return true;

    // If index doesn't exist, merge (we'll generate it)
    if (!fs.existsSync(indexPath)) return true;

    // Check if any source DAG is newer than head.json
    const headStats = fs.statSync(headPath);
    for (const dagFile of dagFiles) {
      const sourceStats = fs.statSync(dagFile.path);
      if (sourceStats.mtime > headStats.mtime) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Ensure index.json exists
 * If missing or invalid, regenerate from merged DAG
 */
export async function ensureIndexExists(
  roadmapRoot: string,
  mergeResult?: MergeResult
): Promise<void> {
  const indexPath = path.join(roadmapRoot, '.roadmap', 'head-index.json');

  // If index exists and valid, do nothing
  if (fs.existsSync(indexPath)) {
    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(content);
      if (index.id && index.entries && Array.isArray(index.entries)) {
        return; // Index is valid
      }
    } catch {
      // Index is invalid, will regenerate
    }
  }

  // Generate index
  const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');
  if (!fs.existsSync(headPath)) {
    throw new Error('Cannot generate index: head.json missing');
  }

  const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
  const mergeRes = mergeResult || {
    merged: graph,
    phases: { [graph.id]: Object.keys(graph.nodes) },
    connections: [],
    sourceFiles: ['head.json'],
    timestamp: new Date().toISOString(),
  };

  // Build index from merge result
  const { extractMetadataIndex } = await import('./index-extractor.ts');
  const index = extractMetadataIndex(mergeRes);

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Get merged graph with lazy loading
 * Respects consolidation and applies load strategy
 */
export async function getGraphWithLazyLoad(
  roadmapRoot: string,
  strategy: LoadStrategy = 'current-plus-next'
): Promise<{ graph: Graph<string>; isMerged: boolean }> {
  // First, ensure consolidation is up-to-date
  await loadDAGWithAutoMerge(roadmapRoot, strategy);

  // Then use lazy loader
  const loader = new LazyGraphLoader(roadmapRoot);
  const result = await loader.loadGraph(strategy);

  if (!result.graph) {
    throw new Error('Failed to load graph with lazy loader');
  }

  return {
    graph: result.graph,
    isMerged: true, // After auto-merge, always consider it merged
  };
}

/**
 * Preload next batch for zero-latency CLI commands
 */
export async function preloadNextBatch(
  roadmapRoot: string,
  currentBatchNodeIds: string[]
): Promise<void> {
  try {
    const loader = new LazyGraphLoader(roadmapRoot);
    await loader.preloadForBatch(currentBatchNodeIds);
  } catch (err) {
    // Preload is optimization, don't fail if it doesn't work
    console.error('[roadmap] preload failed:', err);
  }
}
