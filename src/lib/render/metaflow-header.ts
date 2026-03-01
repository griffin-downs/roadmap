// @module render/metaflow-header
// @exports renderMetaflowHeader

import type { ActiveRun } from '../metaflow/state/active-run.ts';
import type { StepId } from '../metaflow/types.ts';
import type { RenderOpts } from './types.ts';

const BORDER_CHAR = '━';

export function renderMetaflowHeader(
  run: ActiveRun,
  stepId: StepId,
  treeSha: string,
  opts: RenderOpts,
): string {
  const width = opts.width || 34;
  const border = BORDER_CHAR.repeat(width);
  const shaShort = treeSha.slice(0, 12);
  return [
    border,
    `MetaFlow Run: ${run.runId}`,
    `Stage: ${run.stage}`,
    `Step: ${stepId}`,
    `TreeSha: ${shaShort}`,
    border,
  ].join('\n');
}
