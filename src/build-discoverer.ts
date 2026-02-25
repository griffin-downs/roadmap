/**
 * Build process discovery from package.json scripts
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BuildDiscovery {
  command: string;
  produces: string[];
  timeoutMs: number;
}

export async function discoverBuildProcess(repoRoot: string): Promise<BuildDiscovery | null> {
  try {
    const pkgContent = await readFile(join(repoRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);

    // Look for common build scripts
    if (pkg.scripts?.build) {
      return {
        command: pkg.scripts.build,
        produces: ['dist/'],
        timeoutMs: 30000,
      };
    }

    if (pkg.scripts?.compile) {
      return {
        command: pkg.scripts.compile,
        produces: ['lib/', 'dist/'],
        timeoutMs: 30000,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function discoverAllPhases(repoRoot: string): Promise<Record<string, string | null>> {
  try {
    const pkgContent = await readFile(join(repoRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const phases: Record<string, string | null> = {
      build: pkg.scripts?.build || null,
      test: pkg.scripts?.test || null,
      lint: pkg.scripts?.lint || null,
      typecheck: pkg.scripts?.typecheck || null,
    };

    return phases;
  } catch {
    return {};
  }
}
