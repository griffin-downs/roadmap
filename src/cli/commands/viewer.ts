// @module cli/commands/viewer
// @description `roadmap viewer` first-class subcommand. Spawns viewer dev/preview
//              server pointed at the host repo's .roadmap/. Wired into bin/roadmap.ts
//              command registry alongside make/orient/advance/init.
// @exports run
//
// Flags:
//   --preview            run vite preview against viewer/dist (instead of dev mode)
//   --port <n>           override default port
//   --host-repo <path>   override host repo (defaults to $PWD)
//
// HOST_REPO is exported into the spawned child so realtimeBridge + readers
// resolve the host's .roadmap/ rather than the engine repo's own.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { emit } from '../../lib/cli-envelope.ts';
import type { OutputOpts } from '../../lib/cli-envelope.ts';

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
    examples: [
      'roadmap viewer',
      'roadmap viewer --port 5174',
      'roadmap viewer --preview --host-repo /home/griffin/src/fleet',
    ],
  } }, opts);
}

export async function run(args: string[], repoRoot: string, _note: string, opts: OutputOpts): Promise<void> {
  const flags = parseFlags(args, repoRoot);
  if (flags.help) return printHelp(opts);

  const viewerDir = join(repoRoot, 'viewer');
  const viewerPkg = join(viewerDir, 'package.json');
  if (!existsSync(viewerPkg)) {
    emit({ ok: false, cmd: 'viewer', error: {
      code: 'VIEWER_MISSING',
      message: `viewer/package.json not found at ${viewerPkg}`,
      fix: [
        'Reinstall the engine: viewer/ should ship with the package',
        'If running from a checkout, run: pnpm install at the repo root',
      ],
      hint: 'Engine ships viewer/ as a sibling Vite app; missing means broken install.',
    } }, opts);
    process.exit(1);
  }

  const mode = flags.preview ? 'preview' : 'dev';
  const env: NodeJS.ProcessEnv = { ...process.env, HOST_REPO: flags.hostRepo };
  if (flags.port) env.PORT = String(flags.port);

  const child = spawn('pnpm', ['--dir', viewerDir, mode], { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
}
