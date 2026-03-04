// @module multi-dag
// @exports loadAllDags, saveDagHead, migrateSingleHead, loadDag
// @types (no new types)

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { resolve } from "path";
import type { Graph } from "../protocol.ts";

/**
 * Load all DAGs from .roadmap/heads/ directory.
 * Returns a Map of dagId -> Graph.
 *
 * @param repoRoot — repository root
 * @returns Map<dagId, Graph<string>>
 */
export function loadAllDags(repoRoot: string): Map<string, Graph<string>> {
  const headsDir = resolve(repoRoot, ".roadmap", "heads");
  const dags = new Map<string, Graph<string>>();

  if (!existsSync(headsDir)) {
    return dags;
  }

  try {
    const files = readdirSync(headsDir);
    const dagFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of dagFiles) {
      const dagPath = resolve(headsDir, file);
      try {
        const content = readFileSync(dagPath, "utf-8");
        const dag = JSON.parse(content) as Graph<string>;
        if (dag.id && dag.nodes) {
          dags.set(dag.id, dag);
        }
      } catch {
        // Skip DAGs that can't be parsed
      }
    }
  } catch {
    // If .roadmap/heads doesn't exist or can't be read, return empty
  }

  return dags;
}

/**
 * Save a DAG to .roadmap/heads/<dagId>.json.
 *
 * @param repoRoot — repository root
 * @param dagId — DAG ID (used as filename)
 * @param graph — the Graph to save
 */
export function saveDagHead(
  repoRoot: string,
  dagId: string,
  graph: Graph<string>,
): void {
  const headsDir = resolve(repoRoot, ".roadmap", "heads");
  if (!existsSync(headsDir)) {
    mkdirSync(headsDir, { recursive: true });
  }

  const dagPath = resolve(headsDir, `${dagId}.json`);
  writeFileSync(dagPath, JSON.stringify(graph, null, 2) + "\n");
}

/**
 * Migrate from single head.json to heads/<dagId>.json structure.
 * If head.json exists and no heads/ directory exists, move head.json content
 * to heads/<dagId>.json and remove the old file.
 *
 * @param repoRoot — repository root
 * @returns true if migration occurred, false otherwise
 */
export function migrateSingleHead(repoRoot: string): boolean {
  const headPath = resolve(repoRoot, ".roadmap", "head.json");
  const headsDir = resolve(repoRoot, ".roadmap", "heads");

  // Migration needed if: head.json exists AND heads/ doesn't exist
  if (!existsSync(headPath) || existsSync(headsDir)) {
    return false;
  }

  try {
    const content = readFileSync(headPath, "utf-8");
    const dag = JSON.parse(content) as Graph<string>;

    // Use dag.id as filename, fallback to 'main'
    const dagId = dag.id || "main";

    // Create heads/ and write the DAG
    mkdirSync(headsDir, { recursive: true });
    saveDagHead(repoRoot, dagId, dag);

    // Remove old head.json
    unlinkSync(headPath);

    return true;
  } catch {
    // If migration fails, leave head.json in place
    return false;
  }
}

/**
 * Load a specific DAG or the first one.
 * If dagId is specified, load that DAG.
 * If not specified, load all DAGs and return the first one.
 * If no DAGs exist, return null.
 *
 * @param repoRoot — repository root
 * @param dagId — optional specific DAG ID
 * @returns Graph<string> | null
 */
export function loadDag(
  repoRoot: string,
  dagId?: string,
): Graph<string> | null {
  const dags = loadAllDags(repoRoot);

  if (dagId) {
    return dags.get(dagId) || null;
  }

  // Return first DAG if any exist
  return Array.from(dags.values())[0] || null;
}
