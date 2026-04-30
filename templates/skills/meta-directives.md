---
description: Invoke to read the 8 agent meta-directives in full depth · the "little genius mode" patterns derived from actual broken sessions. Use when dispatching an agent that needs the WHY behind a rule, when a dispatched agent asks "why does this matter," or when you're about to take a shortcut that one of these directives exists to prevent. Each directive is a scar from a specific failure — the depth story names the canonical instance and why the rule outlived it.
---

# meta-directives · little genius mode

Eight agent meta-directives. Each is derived from a pattern that actually broke
in session work. If you're dispatching an agent, include these in the brief. If
you ARE an agent, run through them before claiming done.

## The eight

```
  1. SHOW DON'T ASSERT            observe what you produce
  2. READ BEFORE WRITE            grep · read · then write
  3. SURFACE BLOCKERS LOUDLY      stop · name the block · return
  4. COMMIT MESSAGES ARE NOTES    future you · explain the why
     TO FUTURE YOU
  5. CROSS-CHECK REALITY          state belief · verify · update
  6. THE COCKPIT IS GROUND TRUTH  don't remember · check the dashboard
  7. PROBE BEFORE ANCHOR          the named archetype may not be
                                  populated · verify first
  8. PROVE BEFORE RETIRE          dominance proven, then delete
```

## 1 · SHOW DON'T ASSERT

If you produce something you can observe, observe it. Screenshots get READ with
multimodal vision. JSON gets parsed. Commands get run and their output checked.
Dev servers get hit with curl. "The file exists" is a FLOOR, not a ceiling.
"Tests pass" is necessary, not sufficient — did the thing actually do what you
claimed? If you can't look at the output of your own work, you don't know if
it's correct.

## 2 · READ BEFORE WRITE

Before creating a file, grep for the feature in the repo. Before writing a
display component, read the closest canonical example in
stratum/.../components/display/. Before defining a type, check if it's already
exported from stratum-shared. Stratum has 97 tokens, 10+ components, a
design-system.json, and a CLAUDE.md rulebook — reading them takes 2 minutes and
prevents 2 hours of reinvention.

## 3 · SURFACE BLOCKERS LOUDLY

If you're stuck, STOP. Do not fake. Do not hand-wave. Do not silently skip.
Return to the orchestrator with: "I hit X, I tried Y, I'm blocked on Z."
Pausing is cheaper than fake progress. A loud failure surfaces information the
session needs; a quiet failure poisons downstream work.

## 4 · COMMIT MESSAGES ARE NOTES TO FUTURE YOU

Every non-trivial commit explains the WHY, not just the WHAT. "fixed null bug"
is weak. "fixed null bug — was checking null but empty-string case returned
undefined via Array.find on kebab-case ID" is strong. Future agents read git
log to learn from your scars. When you hit a known trap (Tailwind v4
config-less, vite async middleware race, Samsung keyguard, Android 16 dumpsys
change, .ts import extension), the commit message is the warning sign for the
next agent.

## 5 · CROSS-CHECK REALITY

Before acting, STATE what you believe is true. Then verify it. When your mental
model diverges from reality, STOP and update — do not power through. Surprising
divergences are the highest-information moments in any session. The time I
assumed `hmi-feature-annotated.json` was string-keyed workflows when it was
actually an array is the kind of bug that propagates silently through 474
actions.

## 6 · THE COCKPIT IS GROUND TRUTH

The fleet dashboard reads live state from every service. Don't remember what's
running — check `/services`. Don't guess at roadmap position — check
`/roadmap`. Don't infer the device state — check `/device`. Don't count actions
by hand — check `/hmi`. The cockpit exists so you stop guessing. When in doubt,
open localhost:5173 before making a decision.

## 7 · PROBE BEFORE ANCHOR

Before any plan-mode node anchors on an archetype name from the spec, verify
that archetype is the POPULATED member — not a thin container whose real UX
lives one level deeper. Open `hmi-extract.json`. Open `wiring/[Page].json`.
Check the constructor in `ghidra-constructors.json`. If `connections:[]` and
constructor < ~10 lines: the named archetype is empty. Enumerate all members,
rank by connection count + geometry area, and re-anchor on the highest-ranked
populated member. Then repeat: check if that member's authored component
already wires the mechanism the spec describes — if so, scope narrows to what's
MISSING, not the whole mechanism. A spec that names X without completing this
probe is a pre-redirect waiting to happen. See
`docs/doctrine/pre-anchor-template.md` for the full decision tree and worked
example.

## 8 · PROVE BEFORE RETIRE

**The most important one. The one you cite most often.**

Never delete an extraction path because a replacement exists. Delete it because
dominance is proven — the new path matches or exceeds on every page, no
regressions, consumers migrated.

The prove-then-retire contract:

```
  (a) parity gate green on every page    not just the test page
  (b) all downstream consumers reading    grep verifies
      the new output
  (c) smoke regen confirms no widget      10-page smoke
      regressions
  (d) THEN delete the old path            commit diff = deletion only
```

The pattern that recurs: "replacement works on FnPgRovMk3, therefore retire."
That is hope, not proof.

Canonical instance: the `fleet-pipeline-pcode-migration` DAG ran 12-item parity
checklists; 0/12 passed at merge-retire time. The path held. Nothing was
deleted on hope. Prove dominance across the full page set, then retire cleanly.
See `docs/findings/pcode-migration-walkthrough.md` §before-state and
`docs/audit/pcode/b5-merge-retire.md` for the canonical instance.

Every round-2+3 CAP where retirement was deferred cited this rule. It is
load-bearing doctrine.

## The discipline behind all eight

```
  trust what you can verify
  verify what you can't trust
  when you can't do either · surface it
```

The agents that feel like little geniuses are the ones that refuse to power
past uncertainty. The ones that feel dumb are the ones that hand-wave through
surprising moments.
