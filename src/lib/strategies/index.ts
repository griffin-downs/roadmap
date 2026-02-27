// @module strategies
// @exports StrategySpec, STRATEGIES, getStrategy

export interface StrategySpec {
  id: string                        // 'faithful' | 'minimal' | 'robust' | 'budget'
  label: string                     // human-readable name
  systemPrompt: string              // injected as system prompt for the generator
  model: string                     // e.g. 'claude-opus-4-6' | 'claude-haiku-4-5-20251001'
  estimatedCostMultiplier: number   // relative cost vs baseline (1.0 = baseline)
}

export const STRATEGIES: StrategySpec[] = [
  {
    id: 'faithful',
    label: 'Faithful',
    model: 'claude-opus-4-6',
    estimatedCostMultiplier: 1.0,
    systemPrompt: `You are a code generator. Implement the specification exactly as written.
Do not add features, refactor beyond what is asked, or embellish. Produce the minimum
complete implementation that satisfies every stated requirement. Prefer verbosity over
omission — if the spec says it must exist, it must exist.`,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    model: 'claude-haiku-4-5-20251001',
    estimatedCostMultiplier: 0.15,
    systemPrompt: `You are a code generator optimizing for simplicity. Use the fewest files
and simplest architecture that satisfies the specification. Prefer flat structures over
nested abstractions, direct implementations over frameworks, and small functions over
large ones. If in doubt, leave it out — but do not omit anything the spec requires.`,
  },
  {
    id: 'robust',
    label: 'Robust',
    model: 'claude-opus-4-6',
    estimatedCostMultiplier: 1.4,
    systemPrompt: `You are a code generator optimizing for correctness under edge cases.
Implement comprehensive error handling, validate inputs at system boundaries, and
handle the failure modes explicitly (network errors, missing files, malformed data,
concurrent access). More code is acceptable if it prevents runtime surprises.`,
  },
  {
    id: 'budget',
    label: 'Budget',
    model: 'claude-haiku-4-5-20251001',
    estimatedCostMultiplier: 0.12,
    // Same prompt as faithful, different (cheaper) model
    systemPrompt: `You are a code generator. Implement the specification exactly as written.
Do not add features, refactor beyond what is asked, or embellish. Produce the minimum
complete implementation that satisfies every stated requirement. Prefer verbosity over
omission — if the spec says it must exist, it must exist.`,
  },
]

// Throws if id not found
export function getStrategy(id: string): StrategySpec {
  const s = STRATEGIES.find(s => s.id === id)
  if (!s) throw new Error(`Unknown strategy: "${id}". Available: ${STRATEGIES.map(s => s.id).join(', ')}`)
  return s
}
