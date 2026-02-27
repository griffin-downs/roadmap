// @module intent-evaluator
// @exports makeIntentEvaluator, callLLMEvaluator, recordEvaluation, loadContextFiles
// @types IntentEvaluationRecord
// @entry roadmap

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IntentEvaluation, IntentEvaluatorFn } from '../protocol.ts';

export interface IntentEvaluationRecord extends IntentEvaluation {
  nodeId: string;
  statement: string;
  evaluator: 'self' | 'council';
  threshold: number;
  evaluatedAt: string;
  contextPaths: string[];
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildPrompt(
  statement: string,
  contextFiles: Array<{ path: string; content: string }>,
  evaluator: 'self' | 'council',
): string {
  const filesSection = contextFiles.length > 0
    ? contextFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')
    : '(no context files provided)';

  if (evaluator === 'self') {
    return `You are evaluating whether source code satisfies a behavioral intent statement.

Intent statement: "${statement}"

Source files:
${filesSection}

Evaluate whether the code satisfies the intent statement. Return ONLY a JSON object with no surrounding text or markdown:
{
  "confidence": <float 0.0–1.0>,
  "reasoning": "<one paragraph explaining your judgment>",
  "evidence": ["<file>:<line> — <explanation>", ...]
}

confidence 1.0 = the intent is fully and clearly satisfied
confidence 0.0 = the intent is clearly not satisfied
Be specific. Reference actual code locations. If context files are empty or missing, return confidence 0.0.`;
  }

  // Council: adversarial/skeptical pass
  return `You are a skeptical code reviewer. Your job is to find gaps and edge cases where the code FAILS to satisfy the intent statement.

Intent statement: "${statement}"

Source files:
${filesSection}

Look specifically for:
- Missing edge case handling
- Partial implementations
- Code that appears to satisfy the intent but has subtle bugs
- Conditions where the stated behavior would break

Be skeptical. Any doubt should lower your confidence. Return ONLY a JSON object with no surrounding text or markdown:
{
  "confidence": <float 0.0–1.0>,
  "reasoning": "<one paragraph: what you found or didn't find that concerns you>",
  "evidence": ["<file>:<line> — <explanation>", ...]
}

confidence 1.0 = even under scrutiny, the intent is fully satisfied
confidence 0.0 = clear evidence the intent is NOT satisfied
If context files are empty or missing, return confidence 0.0.`;
}

// ── LLM call ──────────────────────────────────────────────────────────────────

// Raw LLM response (no pass field — threshold applied by caller).
interface RawEvaluation {
  confidence: number;
  reasoning: string;
  evidence: string[];
}

// Extract JSON from model response — handles text/markdown wrapping.
function extractJSON(text: string): RawEvaluation {
  // Try to find JSON object in the response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.confidence !== 'number') throw new Error('Missing confidence field');
  return {
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
  };
}

export async function callLLMEvaluator(
  statement: string,
  contextFiles: Array<{ path: string; content: string }>,
  evaluator: 'self' | 'council',
  apiKey?: string,
): Promise<RawEvaluation> {
  const key = apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const prompt = buildPrompt(statement, contextFiles, evaluator);
  const model = evaluator === 'council' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(c => c.type === 'text')?.text ?? '';
  return extractJSON(text);
}

// ── File loading ──────────────────────────────────────────────────────────────

export function loadContextFiles(
  paths: string[],
  repoRoot: string,
): Array<{ path: string; content: string }> {
  const result: Array<{ path: string; content: string }> = [];
  for (const p of paths) {
    const fullPath = join(repoRoot, p);
    if (!existsSync(fullPath)) continue;
    try {
      result.push({ path: p, content: readFileSync(fullPath, 'utf-8') });
    } catch {
      // skip unreadable files
    }
  }
  return result;
}

// ── Recording ─────────────────────────────────────────────────────────────────

export function recordEvaluation(
  nodeId: string,
  record: IntentEvaluationRecord,
  repoRoot: string,
): void {
  const dir = join(repoRoot, '.roadmap', 'evaluations');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${nodeId}.jsonl`);
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8');
}

// ── Factory ───────────────────────────────────────────────────────────────────

// Creates the IntentEvaluatorFn callback for validateNode opts.
// Handles file loading, LLM call, threshold comparison, and audit recording.
export function makeIntentEvaluator(
  nodeId: string,
  repoRoot: string,
  opts?: { apiKey?: string; evaluatorFn?: typeof callLLMEvaluator },
): IntentEvaluatorFn {
  return async (
    statement: string,
    contextPaths: string[],
    evaluator: 'self' | 'council',
    _repoRoot: string,
    confidenceThreshold: number,
  ): Promise<IntentEvaluation> => {
    const root = _repoRoot || repoRoot;
    const contextFiles = loadContextFiles(contextPaths, root);
    const llmCall = opts?.evaluatorFn ?? callLLMEvaluator;
    const raw = await llmCall(statement, contextFiles, evaluator, opts?.apiKey);
    const pass = raw.confidence >= confidenceThreshold;

    const evaluation: IntentEvaluation = { pass, confidence: raw.confidence, reasoning: raw.reasoning, evidence: raw.evidence };

    const record: IntentEvaluationRecord = {
      ...evaluation,
      nodeId,
      statement,
      evaluator,
      threshold: confidenceThreshold,
      evaluatedAt: new Date().toISOString(),
      contextPaths,
    };
    recordEvaluation(nodeId, record, root);

    return evaluation;
  };
}
