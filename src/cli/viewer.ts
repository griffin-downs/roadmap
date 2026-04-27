// @module cli/viewer
// @description `roadmap viewer` subcommand stub. Spawns viewer dev server pointed at host repo's .roadmap/.
// @exports run
// Scope (r1.5 stub): minimal scaffolding only. Subsequent r1.5 nodes (viewer-extract-scaffold,
// viewer-port-*, viewer-build-*) populate ./viewer/ with the actual Vite/Vue app. Until then
// this command surfaces a clear NOT_READY envelope so calling it pre-scaffold fails loudly
// rather than silently spawning against an empty directory (§Fail-hard · no legacy support).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { emit } from '../lib/cli-envelope.ts';
import type { OutputOpts } from '../lib/cli-envelope.ts';

interface ViewerFlags {
  help: boolean;
  preview: boolean;
  port?: number;
  hostRepo: string;
}

function parseFlags(args: string[], repoRoot: string): ViewerFlags {
  const flags: ViewerFlags = { help: false, preview: false, hostRepo: process.cwd() };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--preview') flags.preview = true;
    else if (a === '--port') flags.port = Number(args[++i]);
    else if (a === '--host-repo') flags.hostRepo = args[++i];
  }
  // host repo defaults to caller's $PWD (already from process.cwd above);
  // viewer source itself lives at <roadmap-engine repo>/viewer/.
  void repoRoot;
  return flags;
}

function printHelp(opts: OutputOpts): void {
  emit({ ok: true, cmd: 'viewer', data: {
    command: 'viewer',
    description: 'Start the roadmap viewer dev server pointed at the current host repo .roadmap/.',
    usage: 'roadmap viewer [--preview] [--port <n>] [--host-repo <path>]',
    flags: {
      '--preview': 'Serve pre-built dist/ via vite preview instead of dev mode',
      '--port <n>': 'Override default port',
      '--host-repo <path>': 'Override host repo (defaults to $PWD)',
    },
    note: 'r1.5 stub — viewer/ scaffold lands in viewer-extract-scaffold node.',
  } }, opts);
}

export async function run(args: string[], repoRoot: string, _note: string, opts: OutputOpts): Promise<void> {
  const flags = parseFlags(args, repoRoot);
  if (flags.help) return printHelp(opts);

  const viewerDir = join(repoRoot, 'viewer');
  const viewerPkg = join(viewerDir, 'package.json');
  if (!existsSync(viewerPkg)) {
    emit({ ok: false, cmd: 'viewer', error: {
      code: 'VIEWER_NOT_SCAFFOLDED',
      message: `viewer/ not yet scaffolded at ${viewerDir}`,
      fix: ['Wait for r1.5 viewer-extract-scaffold node to land', 'Then re-run: roadmap viewer'],
      hint: 'This is the r1.5 stub. Subcommand registered, app not yet present.',
    } }, opts);
    process.exit(1);
  }

  const mode = flags.preview ? 'preview' : 'dev';
  const env: NodeJS.ProcessEnv = { ...process.env, HOST_REPO: flags.hostRepo };
  if (flags.port) env.PORT = String(flags.port);

  const child = spawn('pnpm', ['--dir', viewerDir, mode], { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
}
