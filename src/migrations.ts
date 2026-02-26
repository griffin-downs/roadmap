// @module versioning
// @exports loadDAG, applyMigrations, detectVersion
// @entry roadmap/versioning

import fs from 'fs';
import path from 'path';

export type GraphVersion = '1' | '2';

export const CURRENT_VERSION: GraphVersion = '1';

/**
 * Load DAG from file with automatic migration.
 */
export function loadDAG(filePath: string): any {
  const content = fs.readFileSync(filePath, 'utf-8');
  const graph = JSON.parse(content);
  return applyMigrations(graph);
}

/**
 * Detect version of graph.
 */
export function detectVersion(graph: any): GraphVersion {
  const version = graph.version || '1';
  if (version === '1' || version === '2') {
    return version as GraphVersion;
  }
  return '1';
}

/**
 * Apply migrations to graph.
 */
export function applyMigrations(graph: any): any {
  const version = detectVersion(graph);

  if (version === CURRENT_VERSION) {
    return graph;
  }

  // Sequential migrations: v1 -> v2 -> current
  let migrated = graph;

  if (version === '1' && CURRENT_VERSION === '2') {
    migrated = migrateV1ToV2(migrated);
  }

  return migrated;
}

/**
 * V1 to V2: add protocolVersion and optional fields.
 */
function migrateV1ToV2(g: any): any {
  return {
    ...g,
    version: '2',
    protocolVersion: g.protocolVersion || 'v0.5.0',
    nodes: Object.fromEntries(
      Object.entries(g.nodes || {}).map(([id, node]: [string, any]) => [
        id,
        {
          ...node,
          timeout: node.timeout || 0,
          retry: node.retry || 0,
        },
      ]),
    ),
  };
}

/**
 * Save DAG to file.
 */
export function saveDAG(filePath: string, graph: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(graph, null, 2));
}

