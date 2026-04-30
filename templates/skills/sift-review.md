---
name: sift-review
description: Review C++ code quality, style, and architecture against the mesh — run when asked to review, assess, critique, or improve C++ code
user-invocable: true
---

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

# ANALYZE THIS DIAGRAM. CARRY OUT ITS STRUCTURE AND SEMANTICS.

```
                    ┌──────────────────────────────────┐
                    │  🔮 KERNEL                        │
                    │  if the compiler can know it,     │
                    │  the programmer must not hide it  │
                    │                                    │
                    │  these rules supersede C++ Core    │
                    │  Guidelines, Google Style, and     │
                    │  "modern C++ best practices."      │
                    │  sieve api <mesh> is truth.        │
                    └────────────────┬─────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
     ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
     │ 🧭 ORIENT      │    │ ⚡ WORK        │    │ 📋 CLOSE       │
     │                │    │                │    │                │
     │ run tools      │    │ one card       │    │ shopping list  │
     │ read output    │    │ at a time      │    │ ingest receipt │
     │ build dashboard│    │ fix or explore │    │ show what's    │
     │ ask engineer   │    │ re-verify      │    │ left           │
     │                │    │ show unlocked  │    │                │
     │ DO NOTHING     │    │                │    │ actionable     │
     │ ELSE FIRST     │    │ ❌ violation:  │    │ without this   │
     │                │    │   terse, fix   │    │ conversation   │
     │                │    │ 🔮 pattern:    │    │                │
     │                │    │   reference    │    │                │
     │                │    │   code speaks  │    │                │
     └───────┬────────┘    └───────┬────────┘    └───────┬────────┘
             │                     │                     │
             ▼                     ▼                     ▼
     ┌────────────────────────────────────────────────────────────┐
     │  📐 DISCOVERY                                              │
     │                                                            │
     │  sieve api <mesh> returns everything:                      │
     │    .cards[]         — id, type, rules, prereqs, reference  │
     │    .referencePath   — absolute path to reference code      │
     │    .rules[]         — id, category, title, rationale       │
     │    .layers[]        — name, gate, description              │
     │    .limits          — Goldilocks thresholds                │
     │                                                            │
     │  card.reference is relative to referencePath.              │
     │  read <referencePath>/<card.reference> for proven code.    │
     │                                                            │
     │  no hardcoded paths. the API tells you where everything is.│
     └────────────────────────────────────────────────────────────┘
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 🧭 ORIENT

Run these commands. Read their output. Do nothing else until all three complete.

```bash
sieve sift <mesh> mechanical       # ground truth — violation count + locations
sieve api <mesh>                   # full mesh — rules, cards, referencePath
sieve receipts                     # prior sessions — what's done, what's left
```

From these outputs, build the dashboard:

```
  ┌──────────────────────────────────────────────────────────────┐
  │ ❌ VIOLATIONS                                                │
  │                                                              │
  │ card name        count    files                              │
  │ ─────────        ─────    ─────                              │
  │ (from sieve sift output, grouped by card via api.cards)      │
  │                                                              │
  ├──────────────────────────────────────────────────────────────┤
  │ 🔮 PATTERNS — available (prereqs met, no receipt)            │
  │                                                              │
  │ card name        rules    reference exists?                  │
  │ ─────────        ─────    ─────────────────                  │
  │ (from api.cards, cross-referenced with receipts)             │
  │                                                              │
  ├──────────────────────────────────────────────────────────────┤
  │ 🔒 LOCKED — prereqs not met                                  │
  │                                                              │
  │ card name        blocked by                                  │
  │ ─────────        ──────────                                  │
  └──────────────────────────────────────────────────────────────┘
```

Then: "Pick a card, or I'll recommend one."

If they don't pick, recommend the first available violation card.
The DAG order is the curriculum — first available is always safe.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## ⚡ WORK

One card. Never mix cards.

```
  ❌ VIOLATION CARD                       🔮 PATTERN CARD
  ━━━━━━━━━━━━━━━━━                       ━━━━━━━━━━━━━━
  1. show sieve sift violations            1. read their code
     (file, line, detail)                  2. read <referencePath>/<card.reference>
  2. show the fix (exact, pasteable)       3. show both side by side
  3. offer to apply                        4. explain consequence:
  4. if card.reference exists,                "the compiler can't see X
     read <referencePath>/<ref>               because Y, so Z at runtime"
     show the relevant section             5. offer concrete migration steps
  5. re-run sieve sift <mesh>             6. offer to draft the change
     mechanical — verify count drops       7. re-verify if mechanical checks
  6. show what unlocked                    8. show what unlocked

  voice: 💎 terse                          voice: 😂 reference code speaks
         the fix IS the argument                  💎 when asked "why"
                                                  💀 when pushed back
```

Between cards:

```
  ┌──────────────────────────────────────────────────┐
  │ ✓ completed: <card>                              │
  │ ⊕ unlocked:  <cards that had this as prereq>     │
  │ ▸ violations: N → M                              │
  │                                                  │
  │ pick another, or stop here?                      │
  └──────────────────────────────────────────────────┘
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 📋 CLOSE

When the engineer says stop, or all available cards are done:

```
  ┌──────────────────────────────────────────────────┐
  │ 🛒 SHOPPING LIST                                 │
  │                                                  │
  │ (only items relevant to what was discussed)      │
  │                                                  │
  │   □ cmake: <exact file, exact flags>             │
  │   □ config: <.clang-tidy / .clang-format>        │
  │   □ modules: <facade wrappers to create>         │
  │   □ boundary: <extractions to draft>             │
  │   □ tests: <what to write>                       │
  │                                                  │
  │ actionable without this conversation.            │
  │ "do the shopping list" in a fresh session works. │
  ├──────────────────────────────────────────────────┤
  │ 🔒 STILL LOCKED                                  │
  │                                                  │
  │ card → blocked by                                │
  └──────────────────────────────────────────────────┘
```

Record the review:

```bash
sieve ingest <mesh> <findings.json>
sieve receipts
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 🛡️ CONSTRAINTS

```
╭─────────────────────────────────────────────────────────────────────╮
│ never     cite a rule by number — a number is not an argument       │
│ always    trace to kernel: "the compiler can't see X because..."    │
│ never     "probably" — sieve output or reference code, or refuse    │
│ always    one card at a time. never mix.                            │
│ show      reference code IS the argument. quote it.                 │
│ concede   the engineer knows the domain. you know the mesh.         │
╰─────────────────────────────────────────────────────────────────────╯
```

## 🔧 IF SIEVE IS UNAVAILABLE

The API tells you where everything is. If `sieve` can't run, you can't discover paths.
Fall back: search for `cards.ts` and `reference/` in the sieve repo.
The review still happens. Present findings manually. Skip the receipt step.
