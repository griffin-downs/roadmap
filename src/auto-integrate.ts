/**
 * Unified "roadmap integrate" command
 * Auto-detects metadata, generates roadmap, validates, boots
 */

import { readProjectMetadata, validateProjectMetadata } from './project-metadata.schema.ts';
import { detectProjectType } from './project-detector.ts';
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
  // Try to read metadata
  let metadata = await readProjectMetadata(repoRoot);

  if (!metadata) {
    // Auto-detect
    const typeResult = await detectProjectType(repoRoot);
    const buildResult = await discoverBuildProcess(repoRoot);
    const deps = await discoverDependencies(repoRoot);

    metadata = {
      projectType: typeResult.type,
      init: [],  // TODO: auto-discover
      term: [],  // TODO: auto-discover
      buildCommand: buildResult?.command,
    };
  }

  const build = await discoverBuildProcess(repoRoot);
  const deps = await discoverDependencies(repoRoot);

  return {
    metadata,
    buildProcess: build?.command || 'npm run build',
    dependencies: deps.map(d => d.repo),
    timeEstimate: 5,  // seconds
  };
}

export async function executeIntegration(repoRoot: string): Promise<void> {
  const plan = await planIntegration(repoRoot);
  // TODO: generate roadmap.ts, validate, boot
  console.log(`Integration plan: ${plan.timeEstimate}s, ${plan.dependencies.length} deps`);
}
