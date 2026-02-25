/**
 * Project type detection from filesystem + package.json
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectType } from './project-metadata.schema.ts';

interface DetectionResult {
  type: ProjectType;
  confidence: number;  // 0-1
}

export async function detectProjectType(repoRoot: string): Promise<DetectionResult> {
  try {
    // Read package.json
    const pkgContent = await readFile(join(repoRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);

    // Detect by dependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.react && deps.vite) return { type: 'typescript-react-vite', confidence: 0.95 };
    if (deps.react && deps.webpack) return { type: 'typescript-react-webpack', confidence: 0.9 };
    if (deps.next) return { type: 'typescript-react-next', confidence: 0.95 };
    if (deps.express || deps.fastify) return { type: 'typescript-node', confidence: 0.9 };

    // Default to generic if TypeScript-ish
    if (pkg.type === 'module' || deps.typescript) {
      return { type: 'typescript-node', confidence: 0.7 };
    }

    return { type: 'generic', confidence: 0.5 };
  } catch {
    return { type: 'generic', confidence: 0.3 };
  }
}

export async function detectProjectTypeWithFallback(repoRoot: string): Promise<ProjectType> {
  const result = await detectProjectType(repoRoot);
  return result.type;
}
