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
  return JSON.parse(roadmapCli(cmd, opts));
}
