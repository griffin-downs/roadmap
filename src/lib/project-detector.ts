/**
 * Metadata-first approach: project type comes from .roadmap.json
 *
 * No detection heuristics. If .roadmap.json exists, use it.
 * If not, require explicit project description.
 */

import { readProjectMetadata } from './project-metadata.schema.ts';
import type { ProjectType } from './project-metadata.schema.ts';
export type { ProjectType };

export async function getProjectType(repoRoot: string): Promise<ProjectType | null> {
  // Read .roadmap.json if it exists
  const metadata = await readProjectMetadata(repoRoot);
  return metadata?.projectType || null;
}

export async function requireProjectMetadata(repoRoot: string): Promise<void> {
  const metadata = await readProjectMetadata(repoRoot);

  if (!metadata) {
    throw new Error(
      `No .roadmap.json found in ${repoRoot}.\n` +
      `For accurate integration, create .roadmap.json with:\n` +
      `  - projectType: "your-project-type" (e.g., "typescript-cpp-monorepo")\n` +
      `  - init: [...] (current artifacts)\n` +
      `  - term: [...] (desired artifacts)\n` +
      `  - buildCommand: "..." (how to build)\n`
    );
  }
}
