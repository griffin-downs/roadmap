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
| adv-reconcile | done | tests/adv-reconcile.test.ts |
| adv-orient | done | tests/adv-orient.test.ts |
| reorient | **gate** | .boot/session-receipt.json (gitignored — created by boot.ts) |
| adv-property | **next** | tests/adv-property.test.ts |
| adv-types | next (parallel) | tests/adv-types.test-d.ts |
| fix-reconcile | unblocked | docs/decisions/reconcile-gap.md |
| fix-orient | unblocked | docs/decisions/orient-empty-produces.md |
| consumer-integration | blocked | tests/consumer-integration.test.ts |
| term | blocked | — |

### Execution modes

**Semi-autonomous** — execute one phase group, stop, present results and offer options.
**Fully autonomous** — execute all phase groups to `term` without stopping.

Phase groups (for semi mode stopping points):

| group | nodes | stop condition |
|-------|-------|---------------|
| A | adv-property + adv-types | both test files written, both red |
| B | fix-reconcile + fix-orient | both fixes applied, all 10 previously-red tests now green, decision docs written |
| C | consumer-integration + term | integration test written and passing, roadmap at term |

On completing a group (semi) or reaching term (full), present:
```
Phase complete: <group name>
Capabilities gained: <what is now DELIVERED>
Tests: <before count> → <after count>
Remaining groups: <list>

Options:
[1] Continue to next group (<group name>)
[2] Run all remaining groups autonomously to term
[3] Stop here
```

Stop immediately (both modes) on:
- Unexpected dirty tree (files modified that don't belong to current node)
- Test failure that isn't one of the known-red adv-* tests
- `tsc --noEmit` errors after a change
Report what was found and wait.

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

**DAG merge operations** — next protocol.ts expansion after current roadmap completes.
Git branch operations as DAG combinators: merge, branch, rebase, cherry-pick, squash.
reconcile() already finds join points; merge() makes them structural.
Key constraint: merged graph needs a single init/term — needs a strategy for ID conflicts.
See MEMORY.md for full design notes.

**reorientation.md** — 3-layer pre-roadmap gap analysis (Conceptual / Normative / Operational)
for this library. The components survey shared in the session that produced adv-reconcile and
adv-orient is this document — write it up before the next roadmap expansion.

### When `term` is reached

`term` in the current roadmap.ts = end of adversarial hardening (phase 1 of 8 layers).
The library is NOT complete. Do not stop.

Next step: expand roadmap.ts to cover the next layer. Before doing so:
1. Write `reorientation.md` — 3-layer analysis (Conceptual / Normative / Operational)
   capturing the components survey. This document justifies the phase order of the expansion.
2. Expand using the DAG expansion protocol (SKILL.md): define new INIT (current term),
   define new TERM (next layer complete), EXPAND → FLIP → RECONCILE → RECURSE until
   `check()` returns done.

The 8-layer stack in order (each layer's term = next layer's init):
1. Protocol correctness — current roadmap.ts ← you are here
2. Plan format convention (index/tracking/structure/phase/execution/orientation templates)
3. φ embedding + gate runner (parallel)
4. orientation.md generation from orient() output
5. Autonomous execution protocol (formalized meta-prompt)
6. Full adversarial framework (ADV-RM vectors, DO.Q queue)
7. DO.B perpetual dogfood loop
8. COEL lifecycle formalization

### Phase-end protocol (after completing each node)

1. Run `node --experimental-strip-types roadmap.ts` — must exit 0
2. Run `tsc --noEmit` — must pass
3. Run orient() snippet (Position section above) — confirm position advanced
4. Update position table in this file: mark node done, advance "next" marker
5. Commit: `git commit -m "feat: <node-id> — <one line description>"`

### If you identify new work that should block the current phase

Recursive phase expansion protocol:
1. Add a new node with `deps` pointing to its prerequisites
2. Add the current phase's node to the new node's `deps` (or update deps if inserting upstream)
3. Run `define(g)` — catches cycles
4. Run `check(g)` — all nodes must remain reachable init→term
5. Run `verify(g)` — all consumes must be satisfiable
6. Advance: the new node becomes current position

Example: if work W must happen before `adv-property`:
```typescript
'blocker-W': { id: 'blocker-W', deps: ['init'], produces: ['W-artifact'], ... }
'adv-property': { ..., deps: ['blocker-W'] }  // was: deps: ['init']
```

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
