# Init Intent Gate Architecture — Design

## 1. Introduction

The **init intent gate** is a plan-mode node at the entry to any DAG that validates the clarity and specificity of the initial plan before execution begins. It ensures every node produced by the DAG has:

- **Concrete produces** — file paths, not placeholders or vague artifacts
- **Resolvable consumes** — every consumed file is produced by a predecessor or explicitly acknowledged as pending
- **Testable validate** — at least one measurable acceptance criterion
- **Clear scope** — one concern per node, no "and", no "also"

When a DAG is created or imported, the init gate runs early — either as a pre-gate investigation (when the DAG is initially loaded) or as part of the first batch (if expansion is needed). If clarity validation fails, `expandOnFail: true` triggers automatic child node generation via `generatePlanClarityExpansion()`, which decomposes vague nodes into concrete ones.

## 2. Init Gate Intent Statement

### Core Specification

```
"The plan is clear enough to execute:
 every node specifies concrete produces (file paths),
 resolvable consumes (dependencies exist or are acknowledged),
 testable validate rules (not empty, not aspirational),
 and singular scope (one concern per node)."
```

### Acceptance Criteria (Testable)

The intent passes at confidence ≥ 0.85 when:

1. **Concrete produces** — 100% of non-plan nodes have produces that:
   - Match regex `/^[a-zA-Z0-9._\-/]+\.(ts|js|json|md|sh|yaml|sql)$/` (file extension required)
   - Do not contain placeholders like `{X}`, `<X>`, `[X]`
   - Are relative paths, not `<implementation>` or `database` or `auth layer`

2. **Resolvable consumes** — 100% of consumed artifacts are either:
   - Produced by a predecessor node in the DAG
   - Wrapped in `{ artifact: '...', resolvedBy: 'node-id' }` (acknowledged pending)
   - Listed in DAG ambient (spec, config, type defs)
   - No unresolved "consumes X but nobody makes it" gaps

3. **Testable validate** — every node's `validate[]` is non-empty AND contains at least one of:
   - `artifact-exists` (file must exist post-execution)
   - `shell` (runnable lint/test command)
   - `build-produces` (compilation check)
   - `spec-conformance` (spec scenario mapping)
   - `launch-check` (integration/runtime test)
   - `intent` (behavioral judgment)
   - NOT just `manual-approval` (approval is reinforcement, not test)

4. **Clear scope** — every node description:
   - ≤ 1 sentence or 1 clause (split on " and ", " also ", " plus ")
   - Does not enumerate multiple concerns
   - Example good: `"Write JWT refresh token rotation"`
   - Example bad: `"Add JWT refresh and implement token cache"`

### Judgment Context (for LLM evaluator)

The `context` field guides the evaluator:

```typescript
context: [
  'src/roadmap.ts — the DAG spec this init gate guards',
  'Produces must be concrete file paths (src/auth.ts, not "auth logic")',
  'Consumes must be in predecessor produces or marked as pending',
  'Validate rules must be executable — not aspirational',
  'Scope must be singular — if you split on "and", split the node',
]
```

## 3. Evaluator Logic — validatePlanClarity()

### Signature

```typescript
export interface PlanClarityGap {
  nodeId: string;
  category: 'vague-produces' | 'unresolvable-consumes' | 'no-validate'
          | 'untestable-validate' | 'broad-scope';
  detail: string;
  evidence?: string;
  fixSuggestion?: string;
}

export interface PlanClarityResult {
  passed: boolean;
  confidence: number;          // 0.0–1.0
  gaps: PlanClarityGap[];
  nodesByIssue: Record<string, string[]>;  // category → [nodeId, ...]
  summary: string;
}

export function validatePlanClarity<T extends string>(
  g: Graph<T>,
  options?: {
    skipPlanNodes?: boolean;   // default: true (plan nodes exempt from scope check)
    strictScope?: boolean;      // default: false (warn only, not fail)
    allowAmbient?: boolean;     // default: true (ambient artifacts may be unproduced)
  },
): PlanClarityResult;
```

### Validation Logic (Pseudocode)

```
validatePlanClarity(g, options):
  gaps = []
  nodesByIssue = {}

  // Build predecessor produces + ambient set
  producedArtifacts = new Set()
  acknowledgedPending = new Map()  // artifact → resolvedBy node
  ambientArtifacts = new Set(g.ambient || [])

  for node in g.nodes:
    for artifact in node.produces:
      producedArtifacts.add(artifact)

  // Iterate nodes
  for node in g.nodes:
    if options.skipPlanNodes && node.mode === 'plan':
      continue

    // 1. Check produces are concrete
    gaps += checkConcreteProduces(node, ambientArtifacts)

    // 2. Check consumes are resolvable
    gaps += checkResolvableConsumes(node, producedArtifacts, acknowledgedPending, ambientArtifacts)

    // 3. Check validate is non-empty and testable
    gaps += checkValidateRules(node)

    // 4. Check scope is singular (unless plan node)
    if !options.skipPlanNodes || node.mode !== 'plan':
      gaps += checkSingularScope(node, options.strictScope)

  // Compute confidence: 1.0 if zero gaps, decreasing per category
  confidence = 1.0
  for gap in gaps:
    confidence -= 0.15  // each gap costs 0.15 (7 gaps = fail)

  return {
    passed: confidence >= 0.85 && gaps.length === 0,
    confidence: max(0.0, confidence),
    gaps,
    nodesByIssue: groupGapsBy(gaps, 'category'),
    summary: formatSummary(gaps),
  }

// Helpers
checkConcreteProduces(node, ambient):
  gaps = []
  for artifact in node.produces:
    if !artifact.matches(/^[a-z0-9._\-/]+\.(ts|js|json|md|sh|yaml|sql)$/i):
      gaps.push({
        nodeId: node.id,
        category: 'vague-produces',
        detail: `"${artifact}" is not a concrete file path`,
        evidence: `node.produces[...]`,
        fixSuggestion: 'Use explicit file extensions: src/auth.ts, not "auth"',
      })
    if artifact.contains('{') || artifact.contains('<') || artifact.contains('['):
      gaps.push({
        nodeId: node.id,
        category: 'vague-produces',
        detail: `"${artifact}" contains placeholder syntax`,
        evidence: `node.produces[...]`,
        fixSuggestion: 'Replace placeholders with concrete names: src/user-service.ts',
      })
  return gaps

checkResolvableConsumes(node, produced, pending, ambient):
  gaps = []
  unresolvedProducers = new Map()  // artifact → [nodeIds that could produce it]

  for consume in node.consumes:
    artifact = consumeArtifact(consume)
    resolvedBy = consumeResolvedBy(consume)

    if produced.has(artifact):
      continue  // ✓ predecessor produces it

    if resolvedBy && DAG.nodes[resolvedBy] exists:
      continue  // ✓ acknowledged pending

    if ambient.has(artifact):
      continue  // ✓ ambient (spec/config)

    // Check if ANY predecessor could produce it (misspelling?)
    candidates = [p.id for p in predecessors(node) if contains(p.desc, artifact)]

    gaps.push({
      nodeId: node.id,
      category: 'unresolvable-consumes',
      detail: `"${artifact}" is consumed but not produced by any predecessor`,
      evidence: `node.consumes[...] — producer candidates: ${candidates.join(', ')} or mark as resolvedBy`,
      fixSuggestion: candidates.length > 0
        ? `Add dep on: ${candidates[0]}`
        : 'Add producing node or mark { artifact: "...", resolvedBy: "..." }',
    })
  return gaps

checkValidateRules(node):
  gaps = []

  if node.validate.length === 0:
    gaps.push({
      nodeId: node.id,
      category: 'no-validate',
      detail: 'Node has no validation rules',
      evidence: 'validate: []',
      fixSuggestion: 'Add at least one: artifact-exists, shell, build-produces, spec-conformance, launch-check',
    })
    return gaps

  hasTestablRule = false
  for rule in node.validate:
    if rule.type in ['artifact-exists', 'shell', 'build-produces', 'spec-conformance', 'launch-check', 'intent']:
      hasTestablRule = true
      break

  if !hasTestablRule:
    gaps.push({
      nodeId: node.id,
      category: 'untestable-validate',
      detail: `Only has ${node.validate.map(r => r.type).join(', ')} — no executable rules`,
      evidence: `validate: [${node.validate.map(r => `{ type: '${r.type}' }`).join(', ')}]`,
      fixSuggestion: 'Add shell, artifact-exists, or launch-check rule',
    })

  return gaps

checkSingularScope(node, strict):
  gaps = []
  desc = node.desc.toLowerCase()

  splitWords = [' and ', ' also ', ' plus ', ' then ', ', then ']
  for separator in splitWords:
    if desc.contains(separator):
      concern = desc.split(separator)[0]
      gaps.push({
        nodeId: node.id,
        category: 'broad-scope',
        detail: `Node description contains "${separator}" — scope is not singular`,
        evidence: `desc: "${node.desc}"`,
        fixSuggestion: `Split into two nodes: one for "${concern}", one for the rest`,
      })
      break  // report first split only

  return gaps
```

### Execution Points

1. **On DAG import** — `roadmap import --from speckit` runs validatePlanClarity before adding init gate
2. **On expand failure** — if init gate fails validation, `expandOnFail: true` calls `generatePlanClarityExpansion()`
3. **On validate** — `roadmap validate` can run just the init gate with `--node init-gate`
4. **On orient** — init gate can be pre-gate investigated before dependencies close

## 4. Expansion Triggers and Decomposition

When `validatePlanClarity()` detects gaps, `generatePlanClarityExpansion()` produces fix nodes. Each gap type triggers a specific expansion strategy:

### 4.1 Vague Produces → Decompose Artifact

**Trigger**: produces contains placeholder or is not a file path

**Example**:
```
node: {
  id: 'implement-auth',
  produces: ['auth'],  // ← vague
  ...
}
```

**Expansion Output**:
```
split-auth-impl (expandedFrom: 'implement-auth')
├── impl-auth-types (produces: ['src/lib/auth.types.ts'])
├── impl-auth-service (produces: ['src/lib/auth.service.ts'])
├── impl-auth-middleware (produces: ['src/middleware/auth.ts'])
└── impl-auth-tests (produces: ['tests/auth.integration.test.ts'])
```

**Metadata**:
```typescript
{
  nodeId: 'split-auth-impl',
  desc: 'Decompose vague auth artifact into concrete files',
  expandedFrom: 'init-gate',
  produces: [],  // plan node, no produces
  consumes: ['src/roadmap.ts'],  // reads original node spec
  mode: 'plan',
  validate: [
    {
      type: 'expanded',
      minNodes: 4,  // expect at least 4 children
    }
  ],
  _intentDiagnosis: {
    statement: 'produce "auth" is vague — requires decomposition',
    achievedConfidence: 0.4,
    threshold: 0.85,
    reasoning: 'Generic artifact names without file extensions lack execution clarity',
    evidence: ['roadmap.ts — line 42: produces: ["auth"]'],
    expansionDepth: 0,
  },
}
```

### 4.2 Unresolvable Consumes → Backlink to Producer

**Trigger**: consumed artifact not in any predecessor produces, not ambient, not acknowledged

**Example**:
```
node: {
  id: 'impl-auth-service',
  consumes: ['src/lib/types.ts'],  // ← not produced
  ...
}
```

**Expansion Output** (two scenarios):

**Scenario A: Producer exists but wasn't depended on**
```
add-missing-dep (expandedFrom: 'init-gate')
├── desc: 'Link impl-auth-service → impl-auth-types (produces: src/lib/types.ts)'
├── validate: [{ type: 'shell', command: 'grep -q "src/lib/types.ts" roadmap.ts' }]
```

**Scenario B: No producer — add new node**
```
impl-auth-types (expandedFrom: 'init-gate')
├── desc: 'Write auth type definitions required by auth-service'
├── produces: ['src/lib/types.ts']
├── consumes: [...]
├── validate: [{ type: 'artifact-exists', target: 'src/lib/types.ts' }]
```

### 4.3 No Validate → Create Acceptance Criterion

**Trigger**: node.validate.length === 0

**Example**:
```
node: {
  id: 'write-db-schema',
  produces: ['schema.sql'],
  validate: [],  // ← empty
  ...
}
```

**Expansion Output**:
```
add-validate-write-db-schema (expandedFrom: 'init-gate')
├── desc: 'Define validation for write-db-schema node'
├── mode: 'plan'
├── produces: []
├── consumes: ['schema.sql']
├── validate: [{ type: 'expanded', minNodes: 1 }]
└── children:
    └── validate-db-schema (expandedFrom: add-validate-write-db-schema)
        ├── produces: []
        ├── validate: [
            { type: 'shell', command: 'sqlite3 :memory: < schema.sql' },
            { type: 'artifact-exists', target: 'schema.sql' }
          ]
```

### 4.4 Untestable Validate → Expand to Executable Rules

**Trigger**: validate rules exist but none are executable (only manual-approval)

**Example**:
```
node: {
  id: 'review-ui',
  validate: [
    { type: 'manual-approval', target: 'ui-screenshot.png', reviewer: 'designer' }
  ],
}
```

**Expansion Output**:
```
add-tests-review-ui (expandedFrom: 'init-gate')
├── mode: 'plan'
├── validate: [{ type: 'expanded', minNodes: 1 }]
└── children:
    └── test-ui-review (expandedFrom: add-tests-review-ui)
        ├── desc: 'Define shell/launch-check test for UI review'
        ├── validate: [
            { type: 'shell', command: 'npm run test -- ui.test.ts' }
          ]
```

### 4.5 Broad Scope → Split Node

**Trigger**: node description contains " and ", " also ", ", then"

**Example**:
```
node: {
  id: 'add-auth-and-cache',
  desc: 'Add JWT auth and implement token cache',  // ← two concerns
  produces: ['src/auth.ts', 'src/cache.ts'],
  ...
}
```

**Expansion Output**:
```
split-auth-and-cache (expandedFrom: 'init-gate')
├── mode: 'plan'
├── produces: []
├── validate: [{ type: 'expanded', minNodes: 2 }]
└── children:
    ├── add-jwt-auth (expandedFrom: split-auth-and-cache)
    │   ├── desc: 'Add JWT auth'
    │   └── produces: ['src/auth.ts']
    └── impl-token-cache (expandedFrom: split-auth-and-cache)
        ├── desc: 'Implement token cache'
        └── produces: ['src/cache.ts']
```

## 5. Integration Points

### 5.1 CLI Commands

#### `roadmap init <dag-id>`
Add init gate to an existing DAG (creates wrapper graph).

```bash
roadmap init my-feature --note "Add clarity gate to roadmap"
```

Behavior:
1. Load `.roadmap/head.json` (DAG)
2. Create new graph with init gate at `init`, original graph's `init` becomes next node
3. init gate depends on nothing; original init depends on init gate
4. Write updated `.roadmap/head.json`
5. Run validatePlanClarity() against all execute nodes
6. If fails: prompt to expand or review

#### `roadmap create [--with-gate]`
Create new DAG, optionally with init gate.

```bash
roadmap create my-roadmap --with-gate --note "Create with clarity gate"
```

#### `roadmap import --from speckit [...] --add-gate`
Import spec-kit tasks, optionally add init gate.

```bash
roadmap import --from speckit tasks.md --add-gate --note "Import from spec-kit with clarity validation"
```

### 5.2 Programmatic API

```typescript
import { validatePlanClarity, generatePlanClarityExpansion } from 'roadmap/init-gate';
import type { PlanClarityResult } from 'roadmap/init-gate';

// Validation
const result: PlanClarityResult = validatePlanClarity(g);
if (!result.passed) {
  console.log(`Gaps: ${result.summary}`);
  for (const [category, nodeIds] of Object.entries(result.nodesByIssue)) {
    console.log(`  ${category}: ${nodeIds.join(', ')}`);
  }
}

// Expansion (called by validateNode when intent rule fails)
const fixes = generatePlanClarityExpansion(g, result);
// fixes = [
//   { nodeId: 'split-auth-impl', expandedFrom: 'init-gate', children: [...] },
//   { nodeId: 'add-missing-dep', expandedFrom: 'init-gate', ... },
// ]
```

### 5.3 validateDAG Integration

Update `validateDAG()` in validate-dag.ts:

```typescript
export async function validateDAG<T extends string>(g: Graph<T>): Promise<DAGError[]> {
  const errors: DAGError[] = [];

  // Existing checks
  if (!g.init || !g.term) errors.push(...);
  if (detectCycles(g).length) errors.push(...);

  // NEW: init gate check
  const initGateError = validateInitGatePresence(g);
  if (initGateError) errors.push(initGateError);

  return errors;
}

export function validateInitGatePresence<T extends string>(g: Graph<T>): DAGError | null {
  // Every DAG must have an init node with an intent rule (clarity gate)
  const initNode = g.nodes[g.init];
  if (!initNode) return {
    type: 'missing-init-gate',
    message: 'Init node not found in DAG',
    fix: 'Ensure graph.init points to a valid node',
  };

  const hasIntentGate = initNode.validate?.some(
    (r) => r.type === 'intent' && r.statement?.includes('clear')
  );

  if (!hasIntentGate) {
    return {
      type: 'missing-init-gate',
      message: 'Init node missing clarity intent gate',
      fix: 'Add intent rule with statement about plan clarity and expandOnFail: true',
    };
  }

  return null;
}
```

## 6. Depth Limits and Escalation

### 6.1 Expansion Depth Control

Init gate expansion uses recursive depth limiting:

```typescript
export const INIT_GATE_CONVERGENCE_LIMITS: ConvergenceLimits = {
  maxExpansionDepth: 2,    // two levels: init-gate → plan nodes → execute nodes
  stallThreshold: 0.10,    // require 10% confidence improvement per level
  maxExpansionCost: 10.0,  // USD budget cap
};
```

**Rationale**:
- **Depth 0**: init gate validates raw DAG
- **Depth 1**: plan nodes created for vague produces, unresolvable consumes, scope splits
- **Depth 2**: each plan node expands into execute nodes with concrete produces
- **Depth 3+**: escalate — indicates plan was too ill-formed

### 6.2 Stall Detection

If confidence improvement between levels < 0.10, escalate with diagnosis:

```
Stalled: depth 1→2 improved confidence by 0.06 (threshold 0.10)
  Level 1: confidence = 0.52
  Level 2: confidence = 0.58
Likely cause: plan description is too vague to decompose further
Recommendation: Review original plan intent, rewrite nodes from scratch
```

### 6.3 Escalation Result Structure

```typescript
export interface InitGateEscalation {
  status: 'escalated';
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded';
  depth: number;
  confidence: number;
  historyByLevel: Array<{
    depth: number;
    gaps: PlanClarityGap[];
    fixNodeCount: number;
    costEstimate: number;
  }>;
  diagnosis: string;
  recommendedAction: 'rewrite-plan' | 'simplify-scope' | 'split-roadmap';
}
```

## 7. Testing Strategy

### 7.1 Unit Tests (src/lib/init-gate.test.ts)

#### validatePlanClarity() tests:

```typescript
describe('validatePlanClarity', () => {
  // Concrete produces
  it('passes when all produces are concrete file paths', () => {
    const g = graph({...});
    const result = validatePlanClarity(g);
    expect(result.passed).toBe(true);
  });

  it('fails when produces lack file extensions', () => {
    const g = graph({
      nodes: {
        n: { produces: ['database'], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'vague-produces' })
    );
  });

  it('fails when produces contain placeholders', () => {
    const g = graph({
      nodes: {
        n: { produces: ['src/{module}.ts'], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'vague-produces' })
    );
  });

  // Resolvable consumes
  it('passes when consumes are in predecessor produces', () => {
    const g = graph({
      nodes: {
        a: { produces: ['types.ts'], ... },
        b: { consumes: ['types.ts'], deps: ['a'], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps.filter(g => g.category === 'unresolvable-consumes')).toHaveLength(0);
  });

  it('fails when consumes are unresolvable', () => {
    const g = graph({
      nodes: {
        b: { consumes: ['missing.ts'], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'unresolvable-consumes' })
    );
  });

  it('passes when consumes use resolvedBy', () => {
    const g = graph({
      nodes: {
        b: { consumes: [{ artifact: 'future.ts', resolvedBy: 'c' }], ... },
        c: { produces: ['future.ts'], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps.filter(g => g.category === 'unresolvable-consumes')).toHaveLength(0);
  });

  // Validate rules
  it('fails when validate is empty', () => {
    const g = graph({
      nodes: {
        n: { validate: [], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'no-validate' })
    );
  });

  it('fails when validate only has manual-approval', () => {
    const g = graph({
      nodes: {
        n: { validate: [{ type: 'manual-approval', target: 'x' }], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'untestable-validate' })
    );
  });

  it('passes when validate has artifact-exists', () => {
    const g = graph({
      nodes: {
        n: { validate: [{ type: 'artifact-exists', target: 'out.ts' }], ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps.filter(g => g.category === 'untestable-validate')).toHaveLength(0);
  });

  // Scope
  it('detects broad scope in description', () => {
    const g = graph({
      nodes: {
        n: { desc: 'Add auth and cache', ... }
      }
    });
    const result = validatePlanClarity(g);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ category: 'broad-scope' })
    );
  });

  it('ignores scope check for plan nodes if skipPlanNodes: true', () => {
    const g = graph({
      nodes: {
        n: { desc: 'Plan auth and cache', mode: 'plan', ... }
      }
    });
    const result = validatePlanClarity(g, { skipPlanNodes: true });
    expect(result.gaps.filter(g => g.category === 'broad-scope')).toHaveLength(0);
  });
});
```

#### generatePlanClarityExpansion() tests:

```typescript
describe('generatePlanClarityExpansion', () => {
  it('creates split nodes for vague produces', () => {
    const g = graph({
      nodes: {
        n: { id: 'impl-auth', produces: ['auth'], ... }
      }
    });
    const gaps = [
      { nodeId: 'impl-auth', category: 'vague-produces', ... }
    ];
    const fixes = generatePlanClarityExpansion(g, gaps);

    expect(fixes).toContainEqual(
      expect.objectContaining({
        nodeId: expect.stringMatching(/^split-/),
        mode: 'plan',
        expandedFrom: 'init-gate',
        validate: expect.arrayContaining([
          expect.objectContaining({ type: 'expanded' })
        ])
      })
    );
  });

  it('creates backlink nodes for unresolvable consumes', () => {
    const g = graph({
      nodes: {
        b: { consumes: ['missing.ts'], ... }
      }
    });
    const gaps = [
      { nodeId: 'b', category: 'unresolvable-consumes', ... }
    ];
    const fixes = generatePlanClarityExpansion(g, gaps);

    expect(fixes.some(f => f.nodeId.startsWith('add-missing-dep'))).toBe(true);
  });

  it('respects depth limits', () => {
    const g = graph({...});
    const limits: ConvergenceLimits = {
      maxExpansionDepth: 1,
      stallThreshold: 0.1,
    };
    const result = generatePlanClarityExpansion(g, gaps, limits);

    expect(result.status).toBe('escalated');
    expect(result.reason).toBe('depth-exceeded');
  });

  it('detects stall and escalates', () => {
    const g = graph({...});
    const result = generatePlanClarityExpansion(g, gaps, {
      maxExpansionDepth: 3,
      stallThreshold: 0.15,  // high bar
    });

    if (result.status === 'escalated' && result.reason === 'stalled') {
      expect(result.depth).toBeLessThan(3);
      expect(result.diagnosis).toMatch(/stall/i);
    }
  });
});
```

### 7.2 Integration Tests (tests/init-gate-integration.test.ts)

```typescript
describe('init gate end-to-end', () => {
  it('validates and expands a vague plan', async () => {
    // 1. Create vague DAG
    const vagueDAG = graph({
      init: 'a', term: 'd',
      nodes: {
        a: { produces: ['config'], ... },
        b: { consumes: ['config'], produces: ['auth'], ... },
        c: { consumes: ['auth'], produces: ['middleware'], ... },
        d: { consumes: ['middleware'], ... }
      }
    });

    // 2. Create init gate
    const withGate = addInitGate(vagueDAG);

    // 3. Validate clarity
    const clarity = validatePlanClarity(withGate);
    expect(clarity.passed).toBe(false);
    expect(clarity.gaps.length).toBeGreaterThan(0);

    // 4. Expand
    const expanded = generatePlanClarityExpansion(withGate, clarity.gaps);
    expect(expanded.status).toBe('expanding');
    expect(expanded.fixNodes.length).toBeGreaterThan(0);

    // 5. Integrate fix nodes
    const clarifiedDAG = mergeInitGateExpansion(withGate, expanded);

    // 6. Re-validate
    const clarity2 = validatePlanClarity(clarifiedDAG);
    expect(clarity2.confidence).toBeGreaterThan(clarity.confidence);
  });

  it('escalates when plan is too ill-formed', async () => {
    const terribleDAG = graph({
      nodes: {
        n: {
          desc: 'Do everything: auth and cache and API and UI and tests',
          produces: ['magic'],
          validate: []
        }
      }
    });

    const result = generatePlanClarityExpansion(
      terribleDAG,
      [],
      { maxExpansionDepth: 2, stallThreshold: 0.2 }
    );

    expect(result.status).toBe('escalated');
    expect(['depth-exceeded', 'stalled']).toContain(result.reason);
  });
});
```

### 7.3 Scenario Tests

Cover these acceptance scenarios:

| Scenario | Input | Expected Output | Test File |
|----------|-------|-----------------|-----------|
| All clear | Concrete produces, resolvable consumes, executable validate, singular scope | `confidence >= 0.95, gaps = []` | init-gate.test.ts |
| One vague produce | `produces: ['database']` | `gaps: [{ category: 'vague-produces' }]` | init-gate.test.ts |
| One unresolvable consume | `consumes: ['missing.ts']` | `gaps: [{ category: 'unresolvable-consumes' }]` | init-gate.test.ts |
| No validate | `validate: []` | `gaps: [{ category: 'no-validate' }]` | init-gate.test.ts |
| Only manual-approval | `validate: [{ type: 'manual-approval' }]` | `gaps: [{ category: 'untestable-validate' }]` | init-gate.test.ts |
| Broad scope | `desc: "Add auth and cache"` | `gaps: [{ category: 'broad-scope' }]` | init-gate.test.ts |
| Multiple gaps, one node | All issues above in one node | Expansion produces multiple fix nodes | init-gate-integration.test.ts |
| Expanding vague produces | `produces: ['auth']` | Split into 4+ files (types, service, middleware, test) | init-gate-integration.test.ts |
| Expanding unresolvable consumes | `consumes: ['missing.ts']` | New producing node added; original node linked | init-gate-integration.test.ts |
| Expanding broad scope | `desc: "Add auth and cache"` | Two sibling nodes, each with singular concern | init-gate-integration.test.ts |
| Escalation on depth | Plan too vague after 2 expansions | `status: 'escalated', reason: 'depth-exceeded'` | init-gate-integration.test.ts |
| Escalation on stall | Confidence improves by < 0.10 per level | `status: 'escalated', reason: 'stalled'` | init-gate-integration.test.ts |

## 8. Data Flow and Provenance

### Init Gate Node Structure

```typescript
const initGateNode: NodeSpec<any, 'init-gate'> = {
  id: 'init-gate',
  desc: 'Validate plan clarity: concrete produces, resolvable consumes, testable validate, singular scope',
  mode: 'plan',  // plan node — completion is expansion children
  produces: [],
  consumes: ['src/roadmap.ts'],  // reads DAG spec
  ambient: [
    '.specify/pre-spec.md',      // context for clarity judgment
    'docs/MODULE-MAP.md',         // reference for artifact naming conventions
  ],
  deps: [],  // init, no dependencies
  validate: [
    {
      type: 'intent',
      statement: `The plan is clear enough to execute:
        every node specifies concrete produces (file paths),
        resolvable consumes (dependencies exist or are acknowledged),
        testable validate rules (not empty, not aspirational),
        and singular scope (one concern per node).`,
      confidence: 0.85,
      evaluator: 'self',  // LLM-evaluated
      expandOnFail: true,  // auto-expand on failure
      context: [
        'src/roadmap.ts — the DAG spec this init gate guards',
        'Produces must be concrete file paths (src/auth.ts, not "auth logic")',
        'Consumes must be in predecessor produces or marked as pending',
        'Validate rules must be executable — not aspirational',
        'Scope must be singular — if you split on "and", split the node',
      ],
      maxExpansionDepth: 2,
    }
  ],
  idempotent: true,
};
```

### Fix Node Provenance (expandedFrom)

Every node generated by init gate expansion carries:

```typescript
{
  expandedFrom: 'init-gate',
  _intentDiagnosis: {
    statement: 'vague produces — requires decomposition',
    achievedConfidence: 0.4,
    threshold: 0.85,
    reasoning: 'Generic artifact names without file extensions lack execution clarity',
    evidence: ['roadmap.ts:42 — produces: ["auth"]'],
    expansionDepth: 0,  // first expansion from init gate
  }
}
```

Allows tracing back: what gap triggered this node? Why was it created?

## 9. References and Integration

### File Structure

```
src/lib/
├── init-gate.ts                 # Core validation + expansion
├── init-gate-evaluator.ts       # LLM judgment handler (intent-evaluator.ts extends)
└── init-gate.test.ts            # Unit tests

tests/
└── init-gate-integration.test.ts  # End-to-end scenarios

docs/
├── INIT-INTENT-GATE-DESIGN.md   # This file
└── INIT-GATE-API.md             # Public API reference
```

### Related Modules

- `src/lib/intent-expansion.ts` — defines `generateIntentExpansion()`, convergence logic
- `src/lib/intent-evaluator.ts` — LLM judgment flow; init gate reuses IntentJudgment type
- `src/lib/validate-dag.ts` — terminal intent gate validation; init gate is inverse (entry vs. exit)
- `src/lib/propagate.ts` — after init gate expansion, propagate upstream constraints
- `bin/roadmap.ts` — CLI commands (init, import, create, validate)

### Convergence with Existing Systems

1. **Intent-driven expansion** (protocol.ts, intent-expansion.ts) — init gate uses same ConvergenceLimits, escalation protocol
2. **Plan mode** (protocol.ts v0.6.0) — init gate is a plan node; expansion children are execute nodes
3. **Pre-gate investigation** (orient.ts) — init gate surfaces as pre-gate workable before deps close (though it has no deps)
4. **Brief.mode** — agents receive init-gate intent in sealed brief, know it's 'plan' mode
5. **Spec conformance** — init gate description maps to FR-INTENT-EXPANSION acceptance criteria
6. **Terminal intent gate** (validate-dag.ts) — init gate is symmetrical entry point; validates "we're ready" not "we're done"

---

**Status**: Design phase. Ready for implementation and test-driven development.

**Next steps**:
1. Implement core validatePlanClarity() + tests
2. Implement generatePlanClarityExpansion() + tests
3. Integrate with CLI (roadmap init, import --add-gate)
4. Run end-to-end scenario tests
5. Document API in INIT-GATE-API.md
6. Commit to roadmap as phase 18 nodes
