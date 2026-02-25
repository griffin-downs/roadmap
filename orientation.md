## Orientation — roadmap adversarial hardening

> Load at session start. Update capabilities table after each completed node.

---

### Identity

Executing the **roadmap-adversarial** roadmap: spec-first adversarial tests drive
constructive bug fixes. Two lanes. Reconcile point: adv-property → consumer-integration.

```
node --experimental-strip-types roadmap.ts   # check() + verify() + reconcile() output
tsc --noEmit                                 # type-check
npm test                                     # full suite
```

### Position

Run `orient()` to find current position:

```typescript
import { orient } from './src/protocol.ts';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const o = orient(roadmap, (a) => existsSync(join('/home/griffin/src/roadmap', a)));
console.log(o.position, o.produces, o.remaining);
```

Or read the table below (updated after each completed node):

| node | status | produces |
|------|--------|----------|
| init | done | src/protocol.ts, tests/protocol.test.ts, roadmap.ts, SKILL.md |
| adv-reconcile | **done** | tests/adv-reconcile.test.ts |
| adv-orient | **done** | tests/adv-orient.test.ts |
| adv-property | **next** | tests/adv-property.test.ts |
| adv-types | next (parallel) | tests/adv-types.test-d.ts |
| fix-reconcile | unblocked | docs/decisions/reconcile-gap.md |
| fix-orient | unblocked | docs/decisions/orient-empty-produces.md |
| consumer-integration | blocked | tests/consumer-integration.test.ts |
| term | blocked | — |

### What you must not break

**`tests/adv-reconcile.test.ts` and `tests/adv-orient.test.ts` are intentionally red.**
5 failures each is correct. Do not fix them. Do not suppress them. They are the spec.
`npm test` will show 10 failures. That is the expected pre-fix state.

**Do not apply the protocol fixes until `adv-property` and `adv-types` are written.**
All four adv-* specs define the correctness surface. Fixes land after all four are red.

**`tests/protocol.test.ts:406` asserts the buggy orient() behavior and passes.**
Title: "node with empty produces blocks orient permanently (documents edge case)".
Do not touch it until `fix-orient` lands. When it does: update title + flip assertion to `toBe('term')`.

**Run files individually until fixes land:**
```bash
npx vitest run tests/adv-reconcile.test.ts   # 5 fail, 3 pass — correct
npx vitest run tests/adv-orient.test.ts      # 5 fail, 3 pass — correct
npx vitest run tests/protocol.test.ts        # all pass — correct
```

### Constraints

- **Adversarial tests before constructive fixes.** Spec first, fix second.
- **Guards first, no else chains, one nesting level max.**
- **DON'T run tests more than once in a row.** Diagnose, don't retry blind.

### Pending work

**`adv-property`** — property-based tests for protocol invariants:
- For all valid graphs: `order()` topo position agrees with `orient()` done/remaining split
- `check({ done: true })` implies `verify()` returns `[]`
- `orient()` position is always in `order()` sequence
- Use parametric cases (vary graph shape), not a property library. Follow `probe()` pattern.

**`adv-types`** — type-level adversarial tests (`tests/adv-types.test-d.ts`):
- Invalid dep refs (node not in graph) must be tsc errors
- id/key mismatch (`id: 'a'` in key `b`) must be tsc error
- Use `@ts-expect-error` annotations. Verify with `tsc --noEmit`.
- Check vitest type-testing: `import { expectTypeOf } from 'vitest'` may be available.

**`fix-reconcile`** — one-liner at `src/protocol.ts:171`, then `docs/decisions/reconcile-gap.md`:
```typescript
const m = bn.consumes.filter(c => !fn.produces.includes(c));
```

**`fix-orient`** — one-liner at `src/protocol.ts:228`, then `docs/decisions/orient-empty-produces.md`:
```typescript
if (!node.produces.length || node.produces.every(exists)) {
```

### Known bugs (fixes ready, specs written — apply after adv-property + adv-types)

| bug | location | fix |
|-----|----------|-----|
| reconcile missing = symmetric diff | `src/protocol.ts:171` | `bn.consumes.filter(c => !fn.produces.includes(c))` |
| orient empty-produces stall | `src/protocol.ts:228` | `!node.produces.length \|\| node.produces.every(exists)` |

### Identified future work (not in current roadmap.ts)

**Git state cache** — agents spend O(N) git commands on reorientation to answer "am I clean?"
and "what is this dirty work?" Fix: `.regent/git-state.json` written by post-commit + session-start
hooks, read in one operation. Contains: clean bool, head commit, dirty files with phase annotation,
last checkpoint, roadmap position. Phase annotation (`"phase": "adv-reconcile"`) maps each dirty
file to its roadmap node so the agent knows what the work belongs to without investigating.
New layer between orient() and the execution protocol. Add to roadmap.ts as a future phase node.

**reorientation.md** — 3-layer pre-roadmap gap analysis (Conceptual / Normative / Operational)
for this library. The components survey shared in the session that produced adv-reconcile and
adv-orient is this document — write it up before the next roadmap expansion.

### Capabilities

| capability | status |
|-----------|--------|
| DAG types + 6 pure functions | DELIVERED — src/protocol.ts |
| 37 unit tests | DELIVERED — tests/protocol.test.ts |
| Self-referential adversarial roadmap | DELIVERED — roadmap.ts |
| Expansion protocol skill | DELIVERED — SKILL.md |
| Adversarial spec: reconcile gap | DELIVERED — tests/adv-reconcile.test.ts (5 fail = correct) |
| Adversarial spec: orient stall | DELIVERED — tests/adv-orient.test.ts (5 fail = correct) |
| Property-based tests | pending |
| Type-level tests | pending |
| Bug fixes + decision docs | pending |
| Consumer integration test | pending |
