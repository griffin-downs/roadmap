<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-start

Start a roadmap-governed session. Run this before any state-mutating work.

## Arguments
- `intent` (required): What you're doing and why. This becomes the orient --note.

## Steps
1. Run: `$ROADMAP_BIN orient --note "$intent"`
2. Parse the JSON output: extract `position[]`, `level`, `batchRemaining[]`, `batchComplete`, `preGate[]`, `produces[]`, `consumes[]`, `done`.
3. Run: `$ROADMAP_BIN chart`
4. Return the chart output verbatim — do not summarize, paraphrase, or truncate.

## Contract
- **Position comes from orient, not memory.** This call is canonical. Never infer position from file reads, previous sessions, or context.
- **If orient returns `position: "untracked"`**, the breadcrumb still records globally. Proceed — you are in trail-only mode.
- **After this skill completes, you know:** position[] (current batch nodes), level (batch index), produces[] (what to write), consumes[] (what to read), batchRemaining[] (incomplete nodes in batch), preGate[] (plan nodes workable before deps close).
- **Chart output is reprinted verbatim.** Every character, every line. The chart is the user's truth surface — summarizing it destroys information.
- **One orient per session start.** Do not call orient repeatedly to "check" — use `orient --check` (silent, no trail) for position checks during work.
