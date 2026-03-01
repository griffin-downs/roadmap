// @module strategy
// @exports HINT_TOKENS, detectHint, shouldLatch
// @types HintResult
// @entry roadmap

export const HINT_TOKENS = [
  'hallucinate',
  'swarm',
  'parallel',
  'lookahead',
  'fidelity',
  'mass parallel',
  'validate later',
] as const;

export interface HintResult {
  latched: boolean;
  matchedTokens: string[];
}

export function detectHint(text: string): HintResult {
  const lower = text.toLowerCase();
  const matchedTokens = HINT_TOKENS.filter(token => lower.includes(token));
  return { latched: matchedTokens.length > 0, matchedTokens };
}

export function shouldLatch(note: string): boolean {
  return detectHint(note).latched;
}
