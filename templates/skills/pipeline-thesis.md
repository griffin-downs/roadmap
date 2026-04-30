# pipeline-thesis

Refresher on the fleet pipeline's core thesis. Invoke when you need to re-ground
before making a decision about what work to do next, or when evaluating whether
a piece of work is aligned with the project's direction.

## The thesis in one sentence

The HMI extraction pipeline is a UI decompiler: binary in, web UI out, zero human
judgment at the target state.

## The endpoint in one sentence

Ghidra is a preprocessor that lowers (FUSION.exe + FUSION.pdb) into a TypeScript-
typed IR snapshot; every other step is TypeScript operating on that snapshot. The
TS types are the schema · commits are the versions · regen is the migration path.
See `fleet/docs/pipeline.md` §"The endpoint" for the full treatment.

## Read these

1. `fleet/CLAUDE.md` section "The pipeline is a UI decompiler · zero-judgment target"
2. `fleet/docs/pipeline.md` — the three-file mental model
3. `fleet/model/judgment-table.json` — current state of the ignorance list

## The question to ask

Before starting any work, ask:

```
  does this work SHRINK the judgment table?
  does this work IMPROVE extraction quality?
  does this work VALIDATE extraction via assay?
  does this work EXTEND the target vocabulary?

  if none of the above: this work is drift.
```

## Current state

Check `model/judgment-table.json` for the current entry count. Each entry is a
reverse engineering problem. The goal is zero entries (only deviations remain).

## Key principle

The judgment table is not where human wisdom lives. It's where pipeline ignorance
hides. Every entry is a TODO for the extractor, not a permanent fixture. When you
find yourself adding an entry, ask: "what would I need to extract from the binary
to eliminate this entry?"
