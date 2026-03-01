// @module git-index
// @exports makeWorkerIndex, WorkerIndexBinding
// @entry roadmap

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface WorkerIndexBinding {
  workerId: string;
  indexPath: string;
  env: { GIT_INDEX_FILE: string };
}

/** Create an isolated git index for a swarm worker to prevent index races. */
export function makeWorkerIndex(repoRoot: string, workerId: string): WorkerIndexBinding {
  const dir = join(repoRoot, '.roadmap', 'idx');
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, `${workerId}.idx`);
  return { workerId, indexPath, env: { GIT_INDEX_FILE: indexPath } };
}
