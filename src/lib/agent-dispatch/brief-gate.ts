// @module brief-gate
// @exports validateBrief
// @types BriefValidation

import type { Brief } from '../brief.ts';

export interface BriefValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validate brief contract before dispatch
 *
 * Given: brief before dispatch
 * When: coordinator validates contract
 * Then: return validation result
 */
export function validateBrief(
  brief: Brief,
  consumes: { file: string; available: boolean }[]
): BriefValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: produces non-empty
  if (!brief.produces || brief.produces.length === 0) {
    errors.push('produces cannot be empty');
  }

  // Rule 2: consumes available from predecessors
  for (const { file, available } of consumes) {
    if (!available) {
      warnings.push(`consumed file ${file} may not be available yet`);
    }
  }

  // Rule 3: description present and ≤150 chars
  if (!brief.description) {
    errors.push('description is required');
  } else if (brief.description.length > 150) {
    errors.push(`description too long (${brief.description.length} > 150 chars)`);
  }

  // Rule 4: pattern present and ≤150 chars
  if (!brief.pattern) {
    errors.push('pattern is required');
  } else if (brief.pattern.length > 150) {
    errors.push(`pattern too long (${brief.pattern.length} > 150 chars)`);
  }

  // Rule 5: mode is 'execute' or 'plan'
  if (brief.mode !== 'execute' && brief.mode !== 'plan') {
    errors.push(`invalid mode: ${brief.mode}`);
  }

  // Rule 6: handoffJournal available for chain
  if (!brief.handoffJournal || brief.handoffJournal.length === 0) {
    // No prior handoffs is OK for first node
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
