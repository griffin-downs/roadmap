// @module orient-forward
// @exports scanPendingSpecs, PendingSpec, scanSiblingDags, SiblingDag

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * PendingSpec — A spec file that hasn't been executed yet, or a follow-on spec
 * declared by a completed DAG's `next` pointer that hasn't been created yet.
 */
export interface PendingSpec {
  path: string;
  dagId: string;
  desc?: string;
  status?: 'not-created'; // only set for follow-on specs declared via `next` but not yet on disk
}

/**
 * SiblingDag — A head.*.json DAG file (parallel DAG in the same repo).
 */
export interface SiblingDag {
  path: string;
  dagId: string;
  nodeCount: number;
}

/**
 * Collect all DAG IDs that have ever been loaded into heads/.
 * Used to exclude already-executed specs from pendingSpecs.
 */
function loadedDagIds(repoRoot: string): Set<string> {
  const ids = new Set<string>();
  const headsDir = resolve(repoRoot, ".roadmap", "heads");

  if (!existsSync(headsDir)) return ids;

  try {
    for (const file of readdirSync(headsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const dag = JSON.parse(readFileSync(resolve(headsDir, file), "utf-8"));
        if (dag?.id) ids.add(dag.id);
      } catch { /* skip unparseable */ }
    }
  } catch { /* heads dir unreadable */ }

  return ids;
}

/**
 * Scan .roadmap directory for unloaded specs.
 *
 * A spec is pending only if its dag_id has never been loaded into heads/.
 * Specs whose dag_id matches any entry in heads/ are already executed — skip them.
 *
 * Also surfaces follow-on specs declared via `spec.next` on the current DAG's spec
 * that don't exist on disk yet.
 *
 * @param repoRoot — repository root (contains .roadmap/)
 * @param currentHeadDagId — current DAG ID from head.json
 * @returns Array of pending specs
 */
export function scanPendingSpecs(
  repoRoot: string,
  currentHeadDagId: string,
): PendingSpec[] {
  const roadmapDir = resolve(repoRoot, ".roadmap");
  const knownDagIds = loadedDagIds(repoRoot);
  const pending: PendingSpec[] = [];

  try {
    const files = readdirSync(roadmapDir);
    const specFiles = files.filter(
      (f) => f.endsWith("-spec.json") && f !== "spec-origin.json",
    );

    for (const file of specFiles) {
      const specPath = resolve(roadmapDir, file);
      try {
        const spec = JSON.parse(readFileSync(specPath, "utf-8"));
        if (typeof spec !== "object" || spec === null || !("dag_id" in spec)) continue;

        const dagId = spec.dag_id;

        if (dagId === currentHeadDagId) {
          // This is the current DAG's spec — check for follow-on work via `next`
          if (typeof spec.next === "string") {
            const nextPath = resolve(repoRoot, spec.next);
            if (!existsSync(nextPath)) {
              pending.push({
                path: spec.next,
                dagId: spec.next.replace(/.*\//, '').replace(/-spec\.json$/, '').replace(/\.json$/, ''),
                desc: spec.nextDesc || `Follow-on: ${spec.next}`,
                status: 'not-created',
              });
            }
          }
          continue;
        }

        // Skip if this dagId has already been loaded/executed
        if (knownDagIds.has(dagId)) continue;

        pending.push({
          path: `.roadmap/${file}`,
          dagId,
          desc: spec.dag_desc || undefined,
        });
      } catch { /* skip unparseable */ }
    }
  } catch { /* .roadmap unreadable */ }

  return pending;
}

/**
 * Scan .roadmap directory for sibling DAGs (head.*.json files).
 *
 * Returns all head.*.json files except the current DAG.
 * Useful for discovering parallel work when a sub-DAG completes.
 *
 * @param repoRoot — repository root (contains .roadmap/)
 * @param currentDagId — current DAG ID to exclude from results
 * @returns Array of sibling DAGs with metadata
 */
export function scanSiblingDags(
  repoRoot: string,
  currentDagId: string,
): SiblingDag[] {
  const roadmapDir = resolve(repoRoot, ".roadmap");
  const siblings: SiblingDag[] = [];

  try {
    const files = readdirSync(roadmapDir);
    const headFiles = files.filter(
      (f) =>
        (f.startsWith("head") && f.endsWith(".json") && f !== "head.json") ||
        (f.startsWith("head.") && f.endsWith(".json")),
    );

    for (const file of headFiles) {
      const dagPath = resolve(roadmapDir, file);
      try {
        const dag = JSON.parse(readFileSync(dagPath, "utf-8"));

        if (
          typeof dag === "object" &&
          dag !== null &&
          typeof dag.id === "string" &&
          typeof dag.nodes === "object"
        ) {
          if (dag.id !== currentDagId) {
            siblings.push({
              path: `.roadmap/${file}`,
              dagId: dag.id,
              nodeCount: Object.keys(dag.nodes).length,
            });
          }
        }
      } catch { /* skip unparseable */ }
    }
  } catch { /* .roadmap unreadable */ }

  return siblings;
}
