// @module terminal-audit/validator
// @description Terminal audit validator — computed sections + gap detection + targeted prompts
// @exports AuditPrompt, AuditResponse, TerminalAuditContext, TerminalAuditResult, runAudit, evaluateResponses, validateTerminalAudit

import type { Graph } from '../../protocol.ts';
import type { CompletionRecordWithEvidence } from '../evidence/completion-evidence.ts';
import { computeReport, type ComputedReport } from './computed.ts';
import { detectGaps, type DetectedGap, type DetectionResult } from './detected.ts';

// --- Types ---

export interface AuditPrompt {
  id: string;
  type: DetectedGap['type'];
  artifact: string;
  question: string;
}

export interface AuditResponse {
  promptId: string;
  answer: string;
}

/** Phase 1 output: mechanical analysis + generated prompts for gaps */
export interface TerminalAuditContext {
  computed: ComputedReport;
  detected: DetectionResult;
  prompts: AuditPrompt[];
}

/** Phase 2 output: full audit result after evaluating responses */
export interface TerminalAuditResult {
  computed: ComputedReport;
  detected: DetectionResult;
  prompts: AuditPrompt[];
  responses: AuditResponse[];
  unaddressed: AuditPrompt[];
  passed: boolean;
  reason?: string;
}

// --- Phase 1: Run audit (mechanical) ---

/**
 * Run terminal audit: compute report + detect gaps + generate prompts.
 * If no gaps detected, prompts array is empty and the audit auto-passes
 * (no agent input required).
 */
export function runAudit(
  dag: Graph<string>,
  records: Map<string, CompletionRecordWithEvidence>,
  exists: (artifact: string) => boolean,
): TerminalAuditContext {
  const computed = computeReport(dag, records, exists);
  const detected = detectGaps(dag);
  const prompts = generatePrompts(detected.gaps);
  return { computed, detected, prompts };
}

// --- Phase 2: Evaluate responses ---

/**
 * Evaluate agent responses against audit prompts.
 * Each prompt must have a matching response with non-empty answer.
 * Returns passed=true only when all gaps are addressed.
 */
export function evaluateResponses(
  context: TerminalAuditContext,
  responses: AuditResponse[],
): TerminalAuditResult {
  const responseMap = new Map<string, AuditResponse>();
  for (const r of responses) responseMap.set(r.promptId, r);

  const unaddressed: AuditPrompt[] = [];
  for (const prompt of context.prompts) {
    const response = responseMap.get(prompt.id);
    if (!response || !isSubstantive(response.answer)) {
      unaddressed.push(prompt);
    }
  }

  const passed = unaddressed.length === 0;
  const reason = passed
    ? undefined
    : `${unaddressed.length} gap(s) not addressed: ${unaddressed.map(p => p.id).join(', ')}`;

  return {
    computed: context.computed,
    detected: context.detected,
    prompts: context.prompts,
    responses,
    unaddressed,
    passed,
    reason,
  };
}

// --- Combined: single-call validation ---

/**
 * Full terminal audit in one call.
 * - If no gaps: auto-passes, responses ignored.
 * - If gaps + no responses: fails with prompts the agent must answer.
 * - If gaps + responses: evaluates whether each gap is addressed.
 */
export function validateTerminalAudit(
  dag: Graph<string>,
  records: Map<string, CompletionRecordWithEvidence>,
  exists: (artifact: string) => boolean,
  responses?: AuditResponse[],
): TerminalAuditResult {
  const context = runAudit(dag, records, exists);

  // No gaps → auto-pass
  if (context.prompts.length === 0) {
    return {
      computed: context.computed,
      detected: context.detected,
      prompts: [],
      responses: [],
      unaddressed: [],
      passed: true,
    };
  }

  // Gaps exist but no responses → fail with prompts
  if (!responses || responses.length === 0) {
    return {
      computed: context.computed,
      detected: context.detected,
      prompts: context.prompts,
      responses: [],
      unaddressed: context.prompts,
      passed: false,
      reason: `${context.prompts.length} gap(s) detected — provide responses via --evaluate-file`,
    };
  }

  return evaluateResponses(context, responses);
}

// --- Prompt generation ---

const PROMPT_TEMPLATES: Record<DetectedGap['type'], (gap: DetectedGap) => string> = {
  'uncovered-consume': (gap) =>
    `Node "${gap.nodeId}" consumes "${gap.artifact}" but no validator checks it exists. ` +
    `How is this dependency guaranteed to be satisfied?`,
  'untested-produce': (gap) =>
    `Node "${gap.nodeId}" produces "${gap.artifact}" but no shell validator tests it. ` +
    `What validates the correctness of this artifact?`,
};

function generatePrompts(gaps: DetectedGap[]): AuditPrompt[] {
  return gaps.map((gap, i) => ({
    id: `gap-${i}-${gap.type}`,
    type: gap.type,
    artifact: gap.artifact,
    question: PROMPT_TEMPLATES[gap.type](gap),
  }));
}

// Non-empty and not a placeholder
function isSubstantive(answer: string): boolean {
  const trimmed = answer.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return false;
  return trimmed.length >= 10;
}
