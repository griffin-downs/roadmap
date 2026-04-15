// @module persist-dag
// @exports persistDAG
//
// Canonical pair-write for .roadmap/head.json + .roadmap/heads/<dag.id>.json.
//
// Every writer that mutates the active DAG MUST go through this helper. The
// mtime-based auto-merge in cli-auto-merge.ts treats heads/<dag.id>.json as
// the source of truth and head.json as a derived cache; if a mutator writes
// only head.json, the next orient call will see heads/<dag.id>.json's mtime
// win and silently overwrite head.json, reverting the mutation.
//
// This helper closes the split-write by writing both files atomically
// (head first, then the heads/ mirror) so cache and source stay in sync.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../protocol.ts';

export function persistDAG(repoRoot: string, dag: Graph<string>): void {
  const roadmapDir = join(repoRoot, '.roadmap');
  const headPath = join(roadmapDir, 'head.json');
  const headsDir = join(roadmapDir, 'heads');

  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });

  const serialized = JSON.stringify(dag, null, 2) + '\n';
  writeFileSync(headPath, serialized);

  const dagId = dag.id;
  if (typeof dagId === 'string' && dagId.length > 0) {
    if (!existsSync(headsDir)) mkdirSync(headsDir, { recursive: true });
    writeFileSync(join(headsDir, `${dagId}.json`), serialized);
  }
}
