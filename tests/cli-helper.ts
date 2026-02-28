// Shared CLI runner for tests. Uses esbuild-bundled CLI from globalSetup
// when available, falls back to --experimental-strip-types.

import { execSync } from 'node:child_process';

const CLI_PATH = process.env.TEST_CLI_PATH;

export function roadmapCli(cmd: string, opts: { cwd?: string } = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const command = CLI_PATH
    ? `node ${CLI_PATH} ${cmd}`
    : `node --experimental-strip-types bin/roadmap.ts ${cmd}`;
  return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function roadmapCliJson(cmd: string, opts: { cwd?: string } = {}): any {
  const raw = JSON.parse(roadmapCli(cmd, opts));
  // Unwrap JSON envelope: { schema_version, ok, cmd, data } → data
  if (raw && typeof raw === 'object' && 'schema_version' in raw) {
    if ('data' in raw) return raw.data;
    if ('error' in raw) return raw; // preserve error envelope for error-testing
  }
  return raw;
}

/** Returns the full JSON envelope without unwrapping. */
export function roadmapCliRaw(cmd: string, opts: { cwd?: string } = {}): any {
  return JSON.parse(roadmapCli(cmd, opts));
}
