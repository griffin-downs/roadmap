// @module sgk/run-manifest
// @exports RunManifest, createRunManifest, readRunManifest, runManifestExists
// @entry roadmap

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RunManifest {
  schema_version: 1;
  type: 'run-manifest';
  runId: string;
  dagId: string;
  scenario: string;
  headSha: string;
  treeSha?: string;
  repoRoot: string;
  teamId?: string;
  workerCount: number;
  createdAt: string;
  strategyState: 'pending' | 'selected' | 'active' | 'closed';
  policyHashes: {
    kernelSha: string;
    registrySha: string;
  };
}

export function createRunManifest(
  runId: string,
  dagId: string,
  scenario: string,
  opts: {
    headSha: string;
    treeSha?: string;
    repoRoot: string;
    teamId?: string;
    workerCount: number;
    kernelSha: string;
    registrySha: string;
  },
): RunManifest {
  const manifest: RunManifest = {
    schema_version: 1,
    type: 'run-manifest',
    runId,
    dagId,
    scenario,
    headSha: opts.headSha,
    treeSha: opts.treeSha,
    repoRoot: opts.repoRoot,
    teamId: opts.teamId,
    workerCount: opts.workerCount,
    createdAt: new Date().toISOString(),
    strategyState: 'pending',
    policyHashes: {
      kernelSha: opts.kernelSha,
      registrySha: opts.registrySha,
    },
  };

  const dir = join(opts.repoRoot, '.roadmap', 'runs', runId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'RUN.json'), JSON.stringify(manifest, null, 2) + '\n');

  return manifest;
}

export function readRunManifest(runId: string, base?: string): RunManifest {
  const root = base ?? process.cwd();
  const path = join(root, '.roadmap', 'runs', runId, 'RUN.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function runManifestExists(runId: string, base?: string): boolean {
  const root = base ?? process.cwd();
  return existsSync(join(root, '.roadmap', 'runs', runId, 'RUN.json'));
}
