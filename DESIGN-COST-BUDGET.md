# Cost Budget Enforcement for Plan Mode Expansion

## Overview

Intent-driven expansion (`generateIntentExpansion`) can recursively decompose failing intent statements into fix nodes. Without budget enforcement, expansions can spiral into unbounded trees, consuming compute and LLM tokens. This design enforces cost tracking and escalation gates to bound expansion cost while preserving diagnostics for visibility.

**Deliverable scope:** Design only. No code changes. Governs future implementation of cost estimation, tracking, budget checks, and escalation in `src/lib/intent-expansion.ts` and related modules.

---

## 1. Cost Model

### 1.1 Unit: USD (LLM Token Cost)

**Rationale:** Token-based cost is stable, proportional, and auditable. Alternatives (wall-clock time, lines of code) are indirect. USD is the canonical unit for LLM-driven work.

**Cost formula (per node):**
```
costUSD = (tokensGenerated × costPerToken)
```

Where:
- `costPerToken` depends on model allocation (Opus vs Haiku mix)
- `tokensGenerated` estimated from node complexity (see 1.3)

Example (using current rates):
- Opus: $0.015 / 1k tokens → 0.00015 USD per token
- Haiku: $0.00025 / 1k tokens → 0.00000025 USD per token

### 1.2 Per-Node Cost Estimation

Each fix node's cost is derived from:

1. **Baseline token count**: ~500 tokens per node (from `cost-estimator.ts: TOKENS_PER_NODE_K = 0.5`)
2. **Scope multiplier**: Adjusts for node context size
   - `produces` size: number of artifacts the node generates
   - `consumes` size: number of inputs it reads
   - Scope = base × (1 + 0.1 × (producesCount + consumesCount))
3. **Depth penalty**: Expansion depth adds complexity
   - Depth 0 (first expansion): multiplier = 1.0
   - Depth 1 (fix-of-fix): multiplier = 1.2
   - Depth 2: multiplier = 1.4
   - Rationale: deeper expansions require more context to reason about

**Cost calculation:**
```
fixNodeCostUSD(node, depth, modelAllocation) {
  baseTokens = 500
  scopeTokens = baseTokens × (1 + 0.1 × (node.produces.length + node.consumes.length))
  depthMultiplier = 1.0 + (0.2 × depth)
  tokens = scopeTokens × depthMultiplier
  return computeCostUSD(tokensK = tokens / 1000, modelAllocation)
}
```

**Model allocation** (`modelAllocation: TemplateParams['modelAllocation']`):
- `'opus-all'`: 100% Opus → ~$0.0000225 per token
- `'opus-emit+haiku-fix'`: 60% Opus, 40% Haiku → ~$0.00001125 per token
- `'haiku-emit+opus-judge'`: 70% Haiku, 30% Opus → ~$0.0000059 per token

Pulled from `src/lib/cost-estimator.ts: computeCostUSD()`.

### 1.3 Parent-to-Child Cost Inheritance

**Fix nodes created by `generateIntentExpansion()`:**
- Inherit parent node's `produces`, `consumes`, `ambient`
- Cost is **independent** of parent cost (children don't "pay twice")
- Each fix node tracks its own estimated cost
- Cumulative cost = sum of all fix nodes in expansion tree

**Note:** Children's confidence-driven fixes *could* be cheaper or more expensive than parent, depending on their scope. Estimation remains per-node, not inherited.

---

## 2. Tracking: Cost Aggregation Across Expansion Levels

### 2.1 Data Structure: ExpansionCostHistory

Track cost progression through recursion levels:

```typescript
interface CostHistory {
  depth: number;           // expansion level (0 = first, 1 = fix-of-fix, ...)
  fixNodeCount: number;    // how many fix nodes at this depth
  perNodeEstimate: number; // USD estimate per node (average)
  levelTotal: number;      // USD for all nodes at this depth
  cumulativeTotal: number; // sum from depth 0 to current
  timestamp?: string;      // ISO-8601 when estimated
}
```

### 2.2 Integration into ExpansionResult

Extend `ExpansionResult` (in `src/lib/intent-expansion.ts`):

```typescript
export interface ExpansionResult {
  status: 'expanding' | 'escalated';  // 'escalated' if budget exceeded
  fixNodes: FixNodeSpec[];
  depth: number;
  costHistory?: CostHistory[];         // NEW: cost progression
  cumulativeCost?: number;             // NEW: total USD for this expansion tree
  budgetRemaining?: number;            // NEW: USD left in budget
}
```

### 2.3 Tracking in `generateIntentExpansion()`

**Before** generating fix nodes:

```typescript
1. Receive: parentId, failures[], depth, limits (including maxExpansionCost)
2. For each failure → estimateCostPerNode(parentProduces, parentConsumes, depth)
3. Sum costs: levelTotal = Σ(estimateCostPerNode for each failure)
4. Check budget gate (see 3.1)
   - If sum > remaining budget → return escalated result
   - Else → proceed to fix node generation
5. Track: cumulativeCost += levelTotal
6. Return: fixNodes[] + costHistory[] + budgetRemaining
```

**Key variables to track:**
- `maxExpansionCost` from ConvergenceLimits (default: undefined = no limit)
- `cumulativeCost` (starts at 0, accumulates per level)
- `budgetRemaining = maxExpansionCost - cumulativeCost`

---

## 3. Integration: When to Check Budget

### 3.1 Budget Check Points

**Point 1: Before generating fix nodes (early gate)**

```typescript
if (maxExpansionCost !== undefined && cumulativeCost + levelTotal > maxExpansionCost) {
  // Return escalation, don't create fix nodes
  return buildEscalation(parentId, statement, history, 'budget-exceeded')
}
```

**Point 2: At each recursion level (if expansion continues)**

If fix nodes themselves fail and trigger further expansion, re-check before expanding again.

**Point 3: Convergence check (end of expansion tree)**

If expansion terminates (converged or escalated), validate total cost ≤ budget (audit).

### 3.2 Where maxExpansionCost is Defined

**Option A (preferred): Per-intent-rule**

```typescript
{
  type: 'intent',
  statement: 'auth works correctly',
  confidence: 0.9,
  expandOnFail: true,
  maxExpansionCost: 0.50,  // USD budget cap for this intent
}
```

- Rule-level budgets allow fine-grained control per intent
- Allows expensive intents (e.g., full integration tests) higher budgets
- Allows cheap intents (e.g., "logs are clean") tight budgets

**Option B: Global fallback**

```typescript
{
  maxExpansionDepth: 3,      // existing
  stallThreshold: 0.05,      // existing
  maxExpansionCost: 5.00,    // NEW: USD cap for all expansions in this session
}
```

**Precedence:**
1. intent.rule.maxExpansionCost (if defined)
2. limits.maxExpansionCost (fallback)
3. undefined (no budget limit)

### 3.3 Default Budget (if not specified)

- Default: `undefined` (no limit)
- Allows expansions to proceed until depth or stall limits
- Recommended: intent rule should explicitly set budget for production use
- Alternative: roadmap orchestrator sets global limits via ConvergenceLimits

---

## 4. Escalation Behavior

### 4.1 Escalation Status Extension

Modify `EscalationResult` (in `src/protocol.ts`):

```typescript
export interface EscalationResult {
  status: 'escalated';
  node: string;
  statement: string;
  history: Array<{ depth: number; confidence: number }>;
  diagnosis: string;
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded';
  // NEW fields below:
  budgetInfo?: {
    maxBudget: number;        // USD cap
    cumulativeCost: number;   // USD spent
    levelCost: number;        // USD required for next level
    shortfall: number;        // (cumulativeCost + levelCost) - maxBudget
  };
}
```

### 4.2 Escalation Behavior

**On budget exceeded:**

```typescript
buildEscalation(nodeId, statement, history, 'budget-exceeded')
```

Extended with:
```typescript
{
  ...escalation,
  budgetInfo: {
    maxBudget: limits.maxExpansionCost,
    cumulativeCost,
    levelCost,
    shortfall,
  }
}
```

**Effect:**

- Expansion stops immediately
- No fix nodes generated
- Parent node still exists (not rolled back)
- User must decide: increase budget, relax intent threshold, or escalate to human review

### 4.3 User Override Mechanism

**Via `AskUserQuestion`** (if roadmap harness supports it):

```typescript
if (budgetExceeded) {
  return {
    status: 'escalated',
    escalation: escalationResult,
    userPrompt: {
      question: 'Expansion budget exceeded for "auth works correctly". Spent $X, need $Y more. Continue?',
      options: [
        { label: 'Increase budget', value: 'increase-budget', amount: 'float' },
        { label: 'Lower confidence threshold', value: 'relax-threshold', target: '0.0-1.0' },
        { label: 'Escalate to human', value: 'human-review' },
        { label: 'Cancel expansion', value: 'cancel' },
      ],
    }
  }
}
```

Currently no `AskUserQuestion` in roadmap harness; escalation only surfaces via trail diagnostics.

---

## 5. History & Visibility

### 5.1 Cost Progression in Trail

Extend `_intentDiagnosis` (in `FixNodeSpec`) to include cost context:

```typescript
_intentDiagnosis: {
  statement: string;
  achievedConfidence: number;
  threshold: number;
  reasoning: string;
  evidence: string[];
  expansionDepth: number;
  // NEW:
  estimatedCost: number;      // USD for this fix node
  costRatio: number;          // ratio: thisNodeCost / maxBudgetRemaining
}
```

### 5.2 Expansion Tree Cost Summary

When expansion completes (converged or escalated), log summary:

```typescript
{
  nodeId: string;
  statement: string;
  status: 'converged' | 'escalated';
  totalDepth: number;
  totalFixNodes: number;
  totalCost: number;         // USD sum of all fix nodes
  budgetRemaining?: number;  // if budget was set
  costHistory: CostHistory[];
}
```

Written to trail or `.roadmap/expansions/<nodeId>.json` for audit.

### 5.3 Visibility in Roadmap Chart

Extend chart output to flag budget usage:

```
📋 design-auth [plan]
  ├─ design-auth-fix-0 (cost: $0.08, depth: 1)
  ├─ design-auth-fix-1 (cost: $0.12, depth: 1)
  └─ [escalated: budget exceeded] (spent $0.20 / $0.25 available)
```

---

## 6. Model Allocation Integration

Cost estimation depends on model allocation strategy. Tie to:

1. **TemplateParams.modelAllocation** (from `src/lib/gallery.ts`)
   - `'opus-all'` → most expensive, highest quality
   - `'opus-emit+haiku-fix'` → medium cost, hybrid
   - `'haiku-emit+opus-judge'` → cheapest, lower quality

2. **Expansion budget scaling by strategy:**
   - Conservative (Haiku-heavy): higher max budget acceptable (many cheap attempts)
   - Aggressive (Opus-all): lower max budget (fewer expensive attempts)

3. **Recommendation:**
   - Set `maxExpansionCost` relative to strategy
   - E.g., `'haiku-emit+opus-judge'` → maxExpansionCost: $2.00
   - E.g., `'opus-all'` → maxExpansionCost: $0.50

---

## 7. Implementation Sequence (for future work)

### Phase 1: Cost Estimation

1. Add `fixNodeCost()` function in `src/lib/intent-expansion.ts`
   - Takes: FixNodeSpec, depth, modelAllocation
   - Returns: costUSD (number)
2. Pull cost constants from `src/lib/cost-estimator.ts`
3. Unit tests: verify cost scales with depth, scope, model allocation

### Phase 2: Tracking & Aggregation

1. Extend `ExpansionResult` with `costHistory[]` and `cumulativeCost`
2. Modify `generateIntentExpansion()` to track costs before returning
3. Wire cost accumulation through recursion levels
4. Unit tests: verify cumulative cost = sum of per-node costs

### Phase 3: Budget Gates

1. Add budget check before fix node generation
2. Return escalation if budget exceeded
3. Wire escalation reason → `'budget-exceeded'`
4. Unit tests: verify gate fires at correct threshold

### Phase 4: Diagnostics & Audit

1. Extend `_intentDiagnosis` with cost fields
2. Add cost summary to trail entries
3. Extend chart to show budget usage
4. Integration tests: full expansion → cost audit

### Phase 5: Model Allocation Bindings

1. Wire TemplateParams.modelAllocation → cost estimation
2. Recommend budget per strategy
3. Update gallery templates with cost-aware budgets

---

## 8. Type Changes (Summary)

### In `src/protocol.ts`:

```typescript
// Extend existing ConvergenceLimits
interface ConvergenceLimits {
  maxExpansionDepth: number;
  stallThreshold: number;
  maxExpansionCost?: number;    // USD cap (already present, stays)
}

// Extend intent rule type
type ValidationRule = ... | {
  type: 'intent';
  statement: string;
  confidence: number;
  evaluator: 'self' | 'council';
  context?: string[];
  expandOnFail?: boolean;
  maxExpansionDepth?: number;
  maxExpansionCost?: number;    // NEW: USD budget for this intent
}

// Extend escalation result
interface EscalationResult {
  ...
  budgetInfo?: {
    maxBudget: number;
    cumulativeCost: number;
    levelCost: number;
    shortfall: number;
  };
}
```

### In `src/lib/intent-expansion.ts`:

```typescript
// New type
interface CostHistory {
  depth: number;
  fixNodeCount: number;
  perNodeEstimate: number;
  levelTotal: number;
  cumulativeTotal: number;
  timestamp?: string;
}

// Extend FixNodeSpec
interface FixNodeSpec {
  ...
  _intentDiagnosis: {
    ...
    estimatedCost?: number;   // USD
    costRatio?: number;       // ratio to budget
  };
}

// Extend ExpansionResult
interface ExpansionResult {
  status: 'expanding' | 'escalated';
  fixNodes: FixNodeSpec[];
  depth: number;
  costHistory?: CostHistory[];
  cumulativeCost?: number;
  budgetRemaining?: number;
}

// New function signature
export function fixNodeCost(
  node: FixNodeSpec,
  depth: number,
  modelAllocation: TemplateParams['modelAllocation'],
): number;

// Modified function signature (no breaking change, new optional param)
export function generateIntentExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentAmbient: readonly string[] | undefined,
  parentValidate: readonly ValidationRule[],
  failures: IntentFailure[],
  depth: number,
  limits?: Partial<ConvergenceLimits>,
  modelAllocation?: TemplateParams['modelAllocation'],  // NEW: optional, default 'opus-all'
  cumulativeCost?: number,                               // NEW: optional, default 0
): ExpansionResult;
```

---

## 9. Edge Cases & Decisions

### 9.1: Fractional Node Splits

**Q:** If levelTotal exceeds remaining budget by 5%, do we:
- A) Generate all nodes (allow overage)
- B) Generate subset of nodes (partial fix)
- C) Escalate (all-or-nothing)

**Decision:** **C (all-or-nothing).** Budget is a hard gate. If next level can't fit, stop expansion. Rationale: partial fixes create inconsistent state; better to escalate and let user decide.

### 9.2: Concurrent Expansion Branches

**Q:** If a parent node has 3 intent failures (→ 3 fix nodes), do we budget each separately or together?

**Decision:** **Together.** `levelTotal = Σ(cost for all fix nodes at this level)`. If sum > remaining budget, escalate entire level. Rationale: fixes are interdependent; partial deployment creates inconsistency.

### 9.3: Zero Cost (Free Intents)

**Q:** Some intents might have zero LLM cost (e.g., deterministic shell validators that auto-fix). Should they consume budget?

**Decision:** No. Cost = 0 for nodes that don't generate LLM tokens. Budget check still applies (0 ≤ remaining always passes). Rationale: deterministic fixes are "free" from compute perspective; distinguish from LLM-driven fixes.

### 9.4: Post-Escalation Retry

**Q:** After escalation for budget, can user increase budget and retry the same expansion?

**Decision:** Not in current design. User must:
1. Increase intent confidence threshold (accept lower quality)
2. Or increase maxExpansionCost in intent rule
3. Re-run node completion with new settings

Rationale: No soft-retry mechanism; expansion is deterministic given constraints.

### 9.5: Budget Inheritance in Nested Expansion

**Q:** If a fix-of-fix escalates due to budget, does parent expansion also escalate?

**Decision:** **No special handling.** Parent receives escalated result as child's output. Parent's budget gate (if any) still applies. Budget is per-expansion-tree, not nested. If child exhausts budget and escalates, parent sees escalation in child's ExpansionResult but doesn't automatically cascade.

---

## 10. Success Criteria (for future implementation)

- [ ] Cost estimation matches actual token usage within 10% (post-hoc audit)
- [ ] Budget gate fires at correct threshold (unit tests: >99% precision)
- [ ] Escalation reason = 'budget-exceeded' traces to trail diagnostics
- [ ] Chart shows cost progression per level and cumulative
- [ ] All cost calculations deterministic (same inputs → same cost)
- [ ] No partial expansions; budget gate is all-or-nothing
- [ ] Integration tests verify cost tracking across 3+ recursion levels
- [ ] Cost history preserved in _intentDiagnosis for audit trail

---

## 11. References

**Existing Cost Infrastructure:**
- `src/lib/cost-estimator.ts`: Token cost functions, model allocation
- `src/lib/gallery.ts`: TemplateParams, GalleryCandidate with costUSD
- `src/lib/strategies/index.ts`: Strategy definitions with estimatedCostMultiplier

**Intent Expansion:**
- `src/lib/intent-expansion.ts`: generateIntentExpansion, ConvergenceLimits
- `tests/intent-expansion.test.ts`: Test patterns for expansion logic
- `tests/intent-expansion-e2e.test.ts`: End-to-end scenarios

**Integration Points:**
- `bin/roadmap.ts`: CLI invocations of intent-driven expansion
- `src/lib/intent-evaluator.ts`: LLM judgment evaluation
- `.roadmap/head.json`: DAG with intent rules and expansion history

---

## 12. Questions for Stakeholder Review

1. **Cost unit:** Should we track USD, tokens, or both? (Recommend: USD only, internal token tracking as intermediate.)
2. **Default budget:** Should global default be `undefined` (no limit) or should roadmap.ts specify per-repo? (Recommend: undefined, let intent rules be explicit.)
3. **User override flow:** If budget exceeded and user wants to continue, what's the UX? (Recommend: update intent rule in DAG, re-run; no interactive override.)
4. **Model allocation binding:** Should cost estimation always receive modelAllocation param, or should it be context-injected? (Recommend: param-explicit; easier to test.)
5. **Audit log granularity:** Should cost history be per-fix-node or per-level? (Recommend: per-level; per-node in _intentDiagnosis.)
