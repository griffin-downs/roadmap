// @module commands
// @exports compileBriefWithSpecKit
// @entry roadmap/commands

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateAgentBrief } from '../spec-kit/agent-brief.ts';
import type { AgentBrief } from '../spec-kit/types-brief.ts';
import type { CompiledBrief } from '../lib/compile-brief.ts';
import type { Orientation } from '../protocol.ts';

export interface SpecKitBriefResult {
  base: CompiledBrief;
  specKit?: AgentBrief;
  merged: string;
}

/**
 * Enhance a compiled brief with spec-kit context when available.
 * Checks for .roadmap/spec/<dagId>-spec.md — if present, generates
 * an agent brief section and appends it to the base brief markdown.
 */
export function compileBriefWithSpecKit(
  base: CompiledBrief,
  dagId: string,
  repoRoot: string,
  orientation: Orientation,
): SpecKitBriefResult {
  const specDir = join(repoRoot, '.roadmap', 'spec');
  const specFile = join(specDir, `${dagId}-spec.md`);

  if (!existsSync(specFile)) {
    return { base, merged: base.markdown };
  }

  const specKitBrief = generateAgentBrief({
    dagId,
    intent: base.assignment,
    orientation,
    specKitWorkspace: specDir,
    nodeProduces: base.whatYouProduce,
    nodeConsumes: base.whatYouConsume,
  });

  const specSection = [
    '',
    '## Spec-Kit Context',
    '',
    `Spec file: \`${specFile}\``,
    '',
    specKitBrief.markdown
      .replace(/^---[\s\S]*?---\n*/, '')  // strip YAML frontmatter (already in base)
      .replace(/^# Agent Brief:.*\n*/m, '')  // strip duplicate title
      .trim(),
  ].join('\n');

  const merged = base.markdown + '\n' + specSection + '\n';

  return { base, specKit: specKitBrief, merged };
}
