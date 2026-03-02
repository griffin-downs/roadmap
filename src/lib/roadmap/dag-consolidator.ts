// @module consolidation
// @exports discoverDAGFiles, loadDAGFiles, mergeMultiWay, ConsolidationError
// @types DAGFile, MergeResult, PhaseConnection

import * as fs from 'fs';
import * as path from 'path';
import { merge, define } from '../../protocol.ts';
import type { Graph } from '../../protocol.ts';

export interface DAGFile {
  path: string;
  name: string; // e.g., "typescript-cleanup-001.json"
  content: Graph<string>;
}

export interface PhaseConnection {
  from: string; // source DAG id
  to: string;   // target DAG id
  reason: string; // why they connect (artifact overlap, explicit metadata)
}

export interface MergeResult {
  merged: Graph<string>;
  phases: { [dagId: string]: string[] }; // mapping of phase id to node ids
  connections: PhaseConnection[];
  sourceFiles: string[];
  timestamp: string;
}

export class ConsolidationError extends Error {
  code: string;
  context: Record<string, any>;

  constructor(
    code: string,
    message: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'ConsolidationError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Discover all DAG files in .roadmap/ directory
 * Filters out: head.json, head-index.json, temporary files, non-DAG files
 */
export async function discoverDAGFiles(roadmapRoot: string): Promise<DAGFile[]> {
  const roadmapDir = path.join(roadmapRoot, '.roadmap');

  if (!fs.existsSync(roadmapDir)) {
    throw new ConsolidationError(
      'ROADMAP_DIR_NOT_FOUND',
      `Roadmap directory not found: ${roadmapDir}`
    );
  }

  const files = fs.readdirSync(roadmapDir);
  const dagFiles: DAGFile[] = [];

  // Deterministic order for reproducible merges
  const sortedFiles = files.filter((f) => f.endsWith('.json')).sort();

  for (const file of sortedFiles) {
    // Skip system files
    if (
      file === 'head.json' ||
      file === 'head-index.json' ||
      file === 'git-state.json' ||
      file === 'hook-config.json' ||
      file === 'iter.json' ||
      file === 'recovery-state.json' ||
      file === 'PLAN_SELECTED.json' ||
      file === 'strategy.json' ||
      file === 'rates.json' ||
      file === 'spec-origin.json' ||
      file === 'migration-receipt.json' ||
      file === 'retired.json' ||
      file === 'test-head.json' ||
      file.endsWith('.backup.json') ||
      file.startsWith('.')
    ) {
      continue;
    }

    const filePath = path.join(roadmapDir, file);

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Validate it's a DAG (has required shape)
      if (
        content &&
        typeof content === 'object' &&
        'id' in content &&
        'desc' in content &&
        'init' in content &&
        'term' in content &&
        'nodes' in content &&
        typeof content.nodes === 'object'
      ) {
        dagFiles.push({
          path: filePath,
          name: file,
          content,
        });
      }
    } catch (err) {
      // Skip files that don't parse or aren't DAGs
      continue;
    }
  }

  if (dagFiles.length === 0) {
    throw new ConsolidationError(
      'NO_DAGS_FOUND',
      `No DAG files found in ${roadmapDir}`
    );
  }

  return dagFiles;
}

/**
 * Find connection points between two DAGs
 * Returns true if A.term should connect to B.init
 */
function findConnection(
  dagA: Graph<string>,
  dagB: Graph<string>
): { exists: boolean; reason: string } {
  // Get term and init nodes
  const termNodeA = dagA.nodes[dagA.term];
  const initNodeB = dagB.nodes[dagB.init];

  if (!termNodeA || !initNodeB) {
    return { exists: false, reason: 'missing term or init node' };
  }

  // Check for artifact overlap: A produces what B consumes
  const aProduces = new Set(termNodeA.produces || []);
  const bConsumes = new Set(initNodeB.consumes || []);

  const overlap = Array.from(aProduces).filter((p) => bConsumes.has(p));
  if (overlap.length > 0) {
    return {
      exists: true,
      reason: `artifact overlap: ${overlap.join(', ')}`,
    };
  }

  return { exists: false, reason: 'no artifact overlap' };
}

/**
 * Merge multiple DAGs into a single unified graph
 * Automatically detects phase boundaries and creates inter-DAG edges
 */
export function mergeMultiWay(dagFiles: DAGFile[]): MergeResult {
  if (dagFiles.length === 0) {
    throw new ConsolidationError(
      'EMPTY_MERGE',
      'No DAGs provided to merge'
    );
  }

  // Single DAG case: no merge needed
  if (dagFiles.length === 1) {
    const dag = dagFiles[0];
    return {
      merged: dag.content,
      phases: { [dag.content.id]: Object.keys(dag.content.nodes) },
      connections: [],
      sourceFiles: [dag.name],
      timestamp: new Date().toISOString(),
    };
  }

  // Multi-way merge: sequentially merge pairs
  let currentMerged = dagFiles[0].content;
  const connections: PhaseConnection[] = [];
  const phases: { [dagId: string]: string[] } = {};
  const sourceFiles = [dagFiles[0].name];

  phases[currentMerged.id] = Object.keys(currentMerged.nodes);

  for (let i = 1; i < dagFiles.length; i++) {
    const nextDAG = dagFiles[i];
    sourceFiles.push(nextDAG.name);
    phases[nextDAG.content.id] = Object.keys(nextDAG.content.nodes);

    // Detect connection
    const connection = findConnection(currentMerged, nextDAG.content);

    if (connection.exists) {
      // Create edge from currentMerged.term to nextDAG.init
      connections.push({
        from: currentMerged.id,
        to: nextDAG.content.id,
        reason: connection.reason,
      });

      // Perform merge: add edge between term and init
      const termNode = currentMerged.nodes[currentMerged.term];
      const initNode = nextDAG.content.nodes[nextDAG.content.init];

      // Prepare merge connection specs
      const artifact = termNode.produces && termNode.produces[0] ? termNode.produces[0] : '';
      const connSpecs: Array<{ g1Node: string; g2Node: string; artifact: string }> = [
        {
          g1Node: termNode.id,
          g2Node: initNode.id,
          artifact,
        },
      ];

      try {
        const merged = merge(currentMerged, nextDAG.content, connSpecs);
        currentMerged = merged;
      } catch (err) {
        throw new ConsolidationError(
          'MERGE_FAILED',
          `Failed to merge ${currentMerged.id} and ${nextDAG.content.id}: ${err}`,
          { sourceDAGs: [currentMerged.id, nextDAG.content.id] }
        );
      }
    } else {
      // No direct connection, just merge graphs without edge
      // This is less ideal but allows modular DAGs
      const connSpecs: Array<{ g1Node: string; g2Node: string; artifact: string }> = [
        {
          g1Node: currentMerged.term,
          g2Node: nextDAG.content.init,
          artifact: '',
        },
      ];

      try {
        const merged = merge(currentMerged, nextDAG.content, connSpecs);
        currentMerged = merged;
      } catch (err) {
        throw new ConsolidationError(
          'MERGE_FAILED',
          `Failed to merge ${currentMerged.id} and ${nextDAG.content.id}: ${err}`,
          { sourceDAGs: [currentMerged.id, nextDAG.content.id] }
        );
      }
    }
  }

  // Validate merged graph
  try {
    define(currentMerged);
  } catch (err) {
    throw new ConsolidationError(
      'MERGED_GRAPH_INVALID',
      `Merged graph is invalid: ${err}`,
      { error: err }
    );
  }

  return {
    merged: currentMerged,
    phases,
    connections,
    sourceFiles,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Load all DAG files from disk
 */
export async function loadDAGFiles(dagFiles: DAGFile[]): Promise<Graph<string>[]> {
  return dagFiles.map((f) => f.content);
}

/**
 * Integration: discover, load, and merge all DAGs
 */
export async function consolidateAllDAGs(roadmapRoot: string): Promise<MergeResult> {
  const dagFiles = await discoverDAGFiles(roadmapRoot);
  const result = mergeMultiWay(dagFiles);
  return result;
}

