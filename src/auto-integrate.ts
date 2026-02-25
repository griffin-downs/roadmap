// @module auto-integrate
// @exports integrateProject
// @types (uses project-metadata.schema types)
// @entry roadmap (internal — used by CLI)

import { readProjectMetadata } from './project-metadata.schema.ts';
import { requireProjectMetadata } from './project-detector.ts';
import { discoverBuildProcess } from './build-discoverer.ts';
import { discoverDependencies } from './dependency-resolver.ts';
import type { ProjectMetadata } from './project-metadata.schema.ts';

export interface IntegrationPlan {
  metadata: ProjectMetadata;
  buildProcess: string;
  dependencies: string[];
  timeEstimate: number;  // seconds
}

export async function planIntegration(repoRoot: string): Promise<IntegrationPlan> {
  // Metadata is required (no auto-detection)
  await requireProjectMetadata(repoRoot);

  const metadata = await readProjectMetadata(repoRoot);
  if (!metadata) {
    throw new Error('Metadata missing after validation');
  }

  const build = await discoverBuildProcess(repoRoot);
  const deps = await discoverDependencies(repoRoot);

  return {
    metadata,
    buildProcess: build?.command || metadata.buildCommand || 'npm run build',
    dependencies: deps.map(d => d.repo),
    timeEstimate: 5,  // seconds
  };
}

export async function executeIntegration(repoRoot: string): Promise<void> {
  const plan = await planIntegration(repoRoot);
  console.log(`Integration plan: ${plan.timeEstimate}s, ${plan.dependencies.length} deps`);

  // TODO: Write roadmap.ts to disk
  // TODO: Boot executor
}
