// @module evidence/completion-enforcer
// @exports syncCompletionWithProduces, validateCompletionSignature, repairMissingCompletions, enforceCompletionConsistency
// Completion record ↔ produces file consistency enforcement

import type { Graph } from '../protocol/types';
import type { CompletionRecordWithEvidence } from './completion-evidence';

/**
 * Validation gate: completion record exists and has passing checks if produces files exist.
 *
 * For each node that has produced files, there must be a completion record with:
 * - passing validation checks
 * - valid gitSha and treeSha
 * - checkpointId matching the work
 */
export function syncCompletionWithProduces(
  g: Graph<any>,
  produces: Map<string, Set<string>>, // nodeId -> set of produce paths that exist
  completionRecords: CompletionRecord[],
): {
  valid: boolean;
  misalignments: Array<{
    nodeId: string;
    issue: 'missing-record' | 'missing-produces' | 'incomplete-checks';
    detail: string;
  }>;
} {
  const misalignments: Array<any> = [];
  const completionMap = new Map(completionRecords.map(r => [r.nodeId, r]));
  const nodes = Object.values(g.nodes) as any[];

  for (const node of nodes) {
    const produces_set = produces.get(node.id);
    const completion = completionMap.get(node.id);
    const nodeProduces = node.produces || [];

    // If produces exist, completion record should too
    if (produces_set && produces_set.size > 0) {
      if (!completion) {
        misalignments.push({
          nodeId: node.id,
          issue: 'missing-record',
          detail: `Produces exist (${Array.from(produces_set).join(', ')}) but no completion record`,
        });
      } else if (!completion.validationChecks || !completion.validationChecks.every((c: any) => c.passed)) {
        misalignments.push({
          nodeId: node.id,
          issue: 'incomplete-checks',
          detail: `Produces exist but completion record has failing checks`,
        });
      }
    }

    // If completion record exists with passing checks, produces should exist
    if (completion && completion.validationChecks && completion.validationChecks.every((c: any) => c.passed)) {
      const missingProduces = nodeProduces.filter((p: any) => !produces_set || !produces_set.has(p));
      if (missingProduces.length > 0) {
        misalignments.push({
          nodeId: node.id,
          issue: 'missing-produces',
          detail: `Completion record shows passing, but produces missing: ${missingProduces.join(', ')}`,
        });
      }
    }
  }

  return {
    valid: misalignments.length === 0,
    misalignments,
  };
}

/**
 * Validation gate: completion record signature is valid.
 *
 * Checks:
 * - gitSha is a valid 40-char hex string
 * - treeSha is a valid 40-char hex string
 * - checkpointId matches pattern cp-{timestamp}
 * - completedAt is a valid ISO timestamp
 */
export function validateCompletionSignature(
  record: CompletionRecord,
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!record.gitSha || !/^[a-f0-9]{40}$/.test(record.gitSha)) {
    errors.push(`Invalid gitSha: "${record.gitSha}" (expected 40-char hex)`);
  }

  if (!record.treeSha || !/^[a-f0-9]{40}$/.test(record.treeSha)) {
    errors.push(`Invalid treeSha: "${record.treeSha}" (expected 40-char hex)`);
  }

  if (!record.checkpointId || !/^cp-\d{14}$/.test(record.checkpointId)) {
    errors.push(`Invalid checkpointId: "${record.checkpointId}" (expected cp-{14 digits})`);
  }

  if (!record.completedAt || isNaN(Date.parse(record.completedAt))) {
    errors.push(`Invalid completedAt: "${record.completedAt}" (expected ISO timestamp)`);
  }

  if (!record.nodeId || record.nodeId.length === 0) {
    errors.push(`Missing or empty nodeId`);
  }

  if (!record.owner || record.owner.length === 0) {
    errors.push(`Missing or empty owner`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Repair helper: back-fill completion records when produces exist but record is missing.
 *
 * Creates a completion record for nodes where:
 * - Produces files exist
 * - No completion record yet
 * - All validation rules pass (or can be skipped)
 *
 * Returns newly created records (not merged into completionRecords yet — caller decides on write).
 */
export function repairMissingCompletions(
  g: Graph<any>,
  produces: Map<string, Set<string>>,
  completionRecords: CompletionRecord[],
  currentGitSha: string,
  currentTreeSha: string,
  owner: string = 'repair-agent',
): {
  repaired: CompletionRecord[];
  unrepairable: Array<{ nodeId: string; reason: string }>;
} {
  const repaired: CompletionRecord[] = [];
  const unrepairable: Array<{ nodeId: string; reason: string }> = [];
  const completionMap = new Map(completionRecords.map(r => [r.nodeId, r]));
  const nodes = Object.values(g.nodes) as any[];

  for (const node of nodes) {
    if (completionMap.has(node.id)) continue; // already has record

    const produces_set = produces.get(node.id);
    if (!produces_set || produces_set.size === 0) continue; // no produces

    // Repair: create a completion record
    const timestamp = new Date().toISOString();
    const cpId = `cp-${timestamp.replace(/\D/g, '').slice(0, 14)}`;

    const record: CompletionRecord = {
      nodeId: node.id,
      completedAt: timestamp,
      owner,
      checkpointId: cpId,
      validationChecks: [
        {
          rule: 'artifact-exists',
          passed: true,
          evidence: `auto-repaired: produces exist (${Array.from(produces_set).join(', ')})`,
        },
      ],
      gitSha: currentGitSha,
      treeSha: currentTreeSha,
    };

    const sig = validateCompletionSignature(record);
    if (!sig.valid) {
      unrepairable.push({
        nodeId: node.id,
        reason: `Cannot create valid signature: ${sig.errors.join('; ')}`,
      });
    } else {
      repaired.push(record);
    }
  }

  return { repaired, unrepairable };
}

/**
 * Compound enforcement: validate and optionally repair completion consistency.
 *
 * Modes:
 * - 'validate': Check only, return errors
 * - 'repair': Validate, report issues, return repaired records (caller writes them)
 */
export function enforceCompletionConsistency(
  g: Graph<any>,
  produces: Map<string, Set<string>>,
  completionRecords: CompletionRecord[],
  currentGitSha: string,
  currentTreeSha: string,
  mode: 'validate' | 'repair' = 'validate',
  owner: string = 'enforcement-agent',
): {
  valid: boolean;
  syncIssues: Array<{
    nodeId: string;
    issue: 'missing-record' | 'missing-produces' | 'incomplete-checks';
    detail: string;
  }>;
  signatureErrors: Array<{
    nodeId: string;
    errors: string[];
  }>;
  repairedRecords?: CompletionRecord[];
  unrepairedRecords?: Array<{ nodeId: string; reason: string }>;
} {
  const syncCheck = syncCompletionWithProduces(g, produces, completionRecords);
  const signatureErrors: Array<{ nodeId: string; errors: string[] }> = [];

  for (const record of completionRecords) {
    const sig = validateCompletionSignature(record);
    if (!sig.valid) {
      signatureErrors.push({ nodeId: record.nodeId, errors: sig.errors });
    }
  }

  const result = {
    valid: syncCheck.valid && signatureErrors.length === 0,
    syncIssues: syncCheck.misalignments,
    signatureErrors,
  };

  if (mode === 'repair' && (!syncCheck.valid || signatureErrors.length > 0)) {
    const repair = repairMissingCompletions(
      g,
      produces,
      completionRecords,
      currentGitSha,
      currentTreeSha,
      owner,
    );
    return {
      ...result,
      repairedRecords: repair.repaired,
      unrepairedRecords: repair.unrepairable,
    };
  }

  return result;
}

/**
 * Diagnostic helper: detailed explanation of completion consistency issues.
 */
export function diagnoseCompletionIssues(
  g: Graph<any>,
  produces: Map<string, Set<string>>,
  completionRecords: CompletionRecord[],
): {
  summary: string;
  issues: Array<{
    nodeId: string;
    type: string;
    description: string;
    suggestion: string;
  }>;
} {
  const syncCheck = syncCompletionWithProduces(g, produces, completionRecords);
  const issues: Array<any> = [];

  for (const misalign of syncCheck.misalignments) {
    let suggestion = '';
    switch (misalign.issue) {
      case 'missing-record':
        suggestion = `Run 'roadmap complete ${misalign.nodeId}' to create the completion record`;
        break;
      case 'missing-produces':
        suggestion = `Check if '${misalign.nodeId}' was properly executed; reproduce the work to generate produces`;
        break;
      case 'incomplete-checks':
        suggestion = `Fix the validation failures for '${misalign.nodeId}' and re-complete`;
        break;
    }
    issues.push({
      nodeId: misalign.nodeId,
      type: misalign.issue,
      description: misalign.detail,
      suggestion,
    });
  }

  return {
    summary: issues.length
      ? `${issues.length} completion consistency issue(s) detected`
      : 'Completion records are consistent with produces',
    issues,
  };
}
