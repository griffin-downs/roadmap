// Vitest globalSetup: esbuild-bundle CLI once before any test worker spawns.
// Eliminates ~1s/spawn from --experimental-strip-types in 13+ test files.

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI_BUILD_DIR = '/tmp/roadmap-test-cli';

export default async function setup(): Promise<void> {
  mkdirSync(CLI_BUILD_DIR, { recursive: true });

  await build({
    entryPoints: [
      { in: join(PROJECT_ROOT, 'bin/roadmap.ts'), out: 'roadmap' },
    ],
    outdir: CLI_BUILD_DIR,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    external: ['playwright-core', 'chromium-bidi'],
    banner: { js: `import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);` },
  });

  process.env.TEST_CLI_PATH = join(CLI_BUILD_DIR, 'roadmap.mjs');
}
