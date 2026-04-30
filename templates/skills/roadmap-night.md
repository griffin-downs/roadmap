---
name: roadmap-night
description: Run /roadmap-auto unattended. Gather scope once upfront, persist it as a policy, then delegate so the engine resolves mid-run ambiguities against the stated policy instead of pausing for clarification. Use when the user is going to bed or otherwise won't be available to answer questions during the run.
user-invocable: true
---

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

# `/roadmap-night` — `/roadmap-auto` with the questions asked upfront

```
  ┌──────────────────────────────────────────────┐
  │  the engine is /roadmap-auto                  │
  │  the pre-flight is the whole point            │
  │                                                │
  │  one conversation upfront · then away         │
  │  the policy resolves every mid-run ambiguity   │
  └──────────────────────────────────────────────┘

     read trajectory         ask four things          delegate
   prior DAGs · trail     explore · avoid ·         /roadmap-auto
   recent receipts        stop · ambiguity          runs under policy
          │                     │                       │
          ▼                     ▼                       ▼
  suggest dimensions       persist policy          summary written
  before asking            to a run-local file     at close
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 1 · Read the trajectory first · speak second

Before asking the user anything, look at what rounds in this repo have
looked like before:

- the archived DAGs — their size, their shape, their root intents
- the trail — which nodes got reused, which got stuck, which got skipped
- recent commits — whether the rhythm is execution-heavy (lots of code
  touches) or design-heavy (lots of receipts, few code touches)
- the current DAG's root description — what this round thinks it is

Use all of that to propose dimensions before asking. The user should be
editing a suggestion, not drafting from scratch.

If the trajectory shows anything alarming — a DAG far larger than prior
rounds, a root intent carried unchanged from the previous round, a recent
round closed in orbit-break — surface that in the suggestion prose, so
the user sees it when deciding whether to run the night at all.

## 2 · Ask four things · all at once · never again

Present four dimensions as a single structured question. Prefill each
with the trajectory-informed suggestion.

```
  explore     what the run is allowed to touch
              paths · repos · tools · operations

  avoid       what the run must not touch or invoke
              expensive regens · physical devices · human-review artifacts ·
              anything the user would want to approve by hand

  stop        when the run should end itself
              after N real-code commits · after a wall-clock budget ·
              at first orbit signal · at DAG term · whichever comes first

  ambiguity   what to do when a node's scope is unclear
              write a design receipt and carry forward with a named successor ·
              OR pause and surface with an exit receipt ·
              OR skip and let the next session decide
```

Save the user's answers to a single run-local policy file the agent can
re-read at any point. The file lives beside the current DAG head, records
which DAG it was authored for, and expires when that DAG terminates.

## 3 · Delegate to `/roadmap-auto` · carry the policy

After the pre-flight, the work itself is `/roadmap-auto`. The only
difference is that the policy travels with every dispatch brief as part
of the kernel-carry context: every agent dispatched — main-context or
background — sees the explore list, the avoid list, the ambiguity rule,
and the one-line scope hint the user wrote.

When a node's work would cross into the avoid list, the agent refuses
the node, writes a short pause receipt naming the boundary it would have
crossed, and does not advance. When a node's scope is ambiguous, the
agent applies the ambiguity rule rather than surfacing to the user.

The engine still does everything it normally does — orient, dispatch,
commit, advance, term. The pre-flight simply pre-answers questions the
engine would otherwise ask the user mid-run.

Between batches, check the stop conditions. If any is met — real-delta
cap reached, wall-clock exhausted, orbit signal tripped — write the
close summary and exit cleanly. Do not chain into another night.

## 4 · Close · leave a morning-readable summary

At DAG term OR at any stop-trigger, write a short summary next to the
policy file. It answers three questions the user will have when they
come back:

- what did the run actually change (list of real-code commits · one line
  each · what they touched)
- which nodes advanced under which disposition (executed · design-only ·
  GBD-with-carrier, where GBD is "Green-By-Disposition" — the node
  closes with enumerated residuals and a named next-round owner rather
  than hard-numeric closure; see `/roadmap-auto` for the four conditions)
- what fired the stop · or whether the run closed cleanly at term

End the summary with one line for the next session: either "resume
normal `/roadmap-auto` with the user present" or "next round needs a
narrower spec — see successor." Nothing longer.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Suggestions worth making in the pre-flight

Things the user might not think to name — surface them proactively
while presenting the four questions:

- if the trajectory shows the last round landed far more receipts than
  code changes, suggest a low real-delta stop-count so the night doesn't
  rack up another hundred design docs
- if the current DAG's root desc names work the repo historically runs
  only in synchronous sessions (regens, physical devices, paper polish),
  suggest adding those to avoid, or refuse to start the night and say so
- if prior rounds show a recurring P0 that never executes, warn that
  it's likely to carry through this round too unless scoped out
- if the current DAG is unusually wide for this repo, suggest narrowing
  before running — overnight autonomous loops produce low signal on wide
  DAGs because the ceremony rate exceeds the execution rate

The suggestions are part of the question prompt prose — visible to the
user when they decide — not silent defaults.

## What `/roadmap-night` refuses

```
  ✗ starting without a policy file authored this turn
  ✗ asking the user anything after the pre-flight
  ✗ advancing a node whose produces would fall inside avoid
  ✗ chaining itself · night must not call night
  ✗ replacing /roadmap-term · the usual close still runs
```

## What it keeps

```
  ✓ everything /roadmap-auto does · the engine is untouched
  ✓ design-round DAGs close cleanly · the policy doesn't block them
  ✓ agents dispatched as usual · they just see the policy
  ✓ a clear artifact at close that answers "what happened"
```

## The test

If the user would want to approve a node by hand, the node belongs in
avoid. If they'd shrug and say "yeah that's fine, write it up," the
node belongs in explore. The pre-flight exists so that sort is done
once, at the start, awake — not repeatedly, mid-run, asleep.

## Chain

```
  /roadmap-night
    → pre-flight · trajectory read · four-question ask · policy persist
      → /roadmap-auto · normal engine · policy carried in briefs
        → /roadmap-term · normal close
          → summary written · boot prompt for next session

  night never chains into night · policy is per-DAG · next run is a
  fresh pre-flight because the trajectory has shifted
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💎 *one conversation before sleep beats a hundred interruptions during it*
