// @module commands
// @exports specKitInit, SpecKitInitOptions, SpecKitInitResult
// @entry roadmap/commands

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateAgentBrief } from '../spec-kit/agent-brief.ts';
import type { AgentBrief } from '../spec-kit/types-brief.ts';
import type { Orientation } from '../protocol.ts';

export interface SpecKitInitOptions {
  dagId: string;
  intent: string;
  repoRoot: string;
  orientation?: Orientation;
}

export interface SpecKitInitResult {
  dagId: string;
  specDir: string;
  specFile: string;
  briefFile: string;
  brief: AgentBrief;
}

const SKELETON_SECTIONS = [
  '## Domain Concepts',
  '',
  '<!-- entities, relationships, state transitions -->',
  '',
  '## Acceptance Scenarios',
  '',
  '<!-- Given/When/Then scenarios -->',
  '',
  '## Constraints',
  '',
  '<!-- tech stack, config, structure -->',
  '',
  '## Edge Cases',
  '',
  '<!-- stated and unstated -->',
  '',
];

/**
 * Initialize a spec-kit workspace for a DAG.
 * Creates .roadmap/spec/<dag-id>/ and seed files.
 */
export function specKitInit(options: SpecKitInitOptions): SpecKitInitResult {
  const { dagId, intent, repoRoot } = options;

  const specDir = join(repoRoot, '.roadmap', 'spec');
  if (!existsSync(specDir)) mkdirSync(specDir, { recursive: true });

  // Seed spec file with intent + skeleton
  const specFile = join(specDir, `${dagId}-spec.md`);
  if (!existsSync(specFile)) {
    const content = [
      `# ${dagId}`,
      '',
      `## Intent`,
      '',
      intent,
      '',
      ...SKELETON_SECTIONS,
    ].join('\n');
    writeFileSync(specFile, content);
  }

  // Build orientation stub if not provided (untracked project)
  const orientation: Orientation = options.orientation ?? {
    position: ['untracked'],
    level: 0,
    batchRemaining: [],
    batchComplete: false,
    preGate: [],
    done: [],
    produces: [],
    consumes: [],
    remaining: [],
  };

  // Generate agent brief
  const brief = generateAgentBrief({
    dagId,
    intent,
    orientation,
    specKitWorkspace: specDir,
  });

  // Write brief file
  const briefFile = join(specDir, `${dagId}-brief.md`);
  writeFileSync(briefFile, brief.markdown);

  return { dagId, specDir, specFile, briefFile, brief };
}

// Help text for CLI --help
export const SPEC_KIT_INIT_HELP = `roadmap spec-kit init <dag-id> --intent "..."

Initialize a spec-kit workspace for a DAG.

Options:
  <dag-id>              DAG identifier (positional, required)
  --intent "..."        Intent statement for the spec (required)
  --note "..."          Trail note (required by roadmap protocol)

Creates:
  .roadmap/spec/<dag-id>-spec.md    Spec skeleton with intent
  .roadmap/spec/<dag-id>-brief.md   Agent brief for spec-kit workflow

Example:
  roadmap spec-kit init fr-auth-001 --intent "Add JWT refresh token rotation"
`;
