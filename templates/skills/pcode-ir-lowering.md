---
description: Invoke to read the Pcode + IR-lowering doctrine — the phase-transition story (fleet-pipeline-pcode-migration lessons) + the endpoint vision (Ghidra as preprocessor, TypeScript as the pipeline). Companion to /pipeline-thesis. Use when working on Ghidra extractors, touching the Java/TypeScript boundary, contemplating a schema change, or reading pipeline.ts's 20-step orchestration. Explains why the Java side is a pure transcriber with no semantic interpretation, and why every TS filter is one commit away from becoming schema.
---

# pcode-ir-lowering

The Pcode extraction + IR-lowering doctrine. Companion to /pipeline-thesis.

## The thesis in one sentence

Ghidra is a preprocessor that lowers `(FUSION.exe + FUSION.pdb)` into a
TypeScript-typed IR snapshot · every other step is TypeScript operating on
that snapshot · TS types are the schema · commits are the versions · regen is
the migration path.

## Phase-transition doctrine (from fleet-pipeline-pcode-migration · 2026-04-20)

Three things that became permanent doctrine from the migration:

### DOMINATE BEFORE MIGRATE

The new extraction path must prove superset coverage on every page before the
old path is touched. `I1.P1` (widget-set superset) and `I1.P2` (field count ≥)
are the blocking gates. `P3` (parent known) is warn-only until the extractor
is calibrated. The gate boundary is not "replacement works on the hardest
page" — it is "replacement dominates across the full page set, no
regressions."

### PROVE BEFORE RETIRE (meta-#8)

Retire follows proof, never precedes it. 0/12 checklist items at merge-retire
time → held the path. See `docs/audit/pcode/b5-merge-retire.md` for the
canonical instance. Every round-2/round-3 CAP cites this rule.

### JAVA IS A TRANSCRIBER

Ghidra Java scripts serialize the decompiler's in-memory graph. No semantic
interpretation in Java. No classification, no inference, no hierarchy
resolution. Those live in TypeScript. The boundary is semantically empty so
schema evolution is cost-free.

## The endpoint · two phases

```
  lower(FUSION.exe + FUSION.pdb)  →  TypeScript IR    (Ghidra · ONCE per binary)
  interpret(TypeScript IR)         →  CSS + wiring    (TypeScript · every run)
```

The reason we re-run Ghidra N times today is that Ghidra does not cache its
decompiled IR (HighFunction · refined Pcode · type-propagated SSA) — it
rebuilds that form on every script invocation. ~45s of JVM + program-load tax
per script, times N scripts, is the friction. The structural answer is to run
Ghidra once, faithfully transcribe its in-memory graph to JSON shaped by
TypeScript types, and have every downstream step read the JSON.

```
  model/ir/types.ts        the schema · TypeScript types are the spec
  ghidra_scripts/DumpIR    one Java script · walks the decompiled graph
                           and transcribes · no semantic interpretation
                           in Java · just faithful serialization
  model/raw/ir-snapshot/   the flat-table dump · FKs between objects ·
                           cycle-safe · deterministic IDs
  model/ir/loader.ts       typed reader · runtime schema validation
  every other extractor    TypeScript filter over the snapshot · seconds
```

## Schema versioning is a non-problem

The types live in the repo · commits are versions. If a field is missing, add
it to `types.ts`, add it to `DumpIR.java`, regen the snapshot, commit. No
migration layer · no compat shim · no deprecation path. The generator IS the
spec. Old snapshots are disposable because regeneration from the same (binary,
Ghidra version, TS types) is byte-identical.

## Java is a transcriber · not an interpreter

The dumb-component rule generalized to the Java/TypeScript boundary: if Ghidra
has a field, include it · if not, don't invent one. Every semantic
interpretation (hierarchy inference · archetype classification · call-site
devirt · coordinate-parent-resolution) lives in TypeScript. Keeping the
boundary semantically empty is what makes schema evolution cost-free.

## Why this matters structurally · realized in r24

The old pipeline was ~20 steps because each extractor was a separate Ghidra
invocation amortizing its fixed tax. r24 collapsed it: one Ghidra run (154s ·
last of r24) · the snapshot is an artifact · every downstream step is pure TS
over `model/ir/query.ts`. CI is Ghidra-free. Iteration loop moved from
"re-run Ghidra · 5 min" to "load corpus · 63s · tsx query · <1s". The
pipeline-thesis ("binary is the database") now has its cleanest form:
the database is queryable without booting Ghidra.

## What it does not replace

Ghidra's decompiler is still the semantic engine — we just run it once per
binary version and cache its output. When FUSION bumps version we re-run the
lowering · when a TypeScript extractor rule changes we do not. This is the
pipeline-thesis's version-portability invariant rendered free.

## Migration path · landed in r24

Migration landed in fleet r24 (`fleet-r24-ir-snapshot-exhaustive-and-classifier-pivot`).
Ghidra runs ONCE per binary via `ghidra_scripts/DumpIR.java`. Snapshot is
~1.46GB at `model/raw/ir-snapshot/latest.json`. Streaming loader + 15 typed
verbs at `model/ir/query.ts`. 36/36 unit tests pass on real corpus. The
classifier pivot (role-resolver · qtType-first) is load-bearing in production:
312 IR-routed widgets · FnPgRov::m_video empirically resolves RmSfMux →
VideoMux (was VideoLayoutDisplay via regex). What was aspirational in
r1–r23 is mechanical in r24.

## Realized corpus · where it lives · how to query

```
model/raw/ir-snapshot/latest.json    1.46GB · flat-table · FK-linked · deterministic IDs
model/raw/ir-snapshot/_manifest.json self-audit · coverage per category · gaps named
model/ir/types.ts                    zod schema · fail-hard isIRSnapshot guard
model/ir/loader.ts                   streaming (stream-json) · ~63s cold · peak ~3GB RSS
model/ir/indexes.ts                  classByName · fnByAddr · stringByAddr · refsFrom ·
                                     callsFrom · callsTo · metaByClass · vtableByOwner
model/ir/query.ts                    ir.class · .member · .function · .metaObject ·
                                     .strings.* · .callsFrom · .callsTo · .connects ·
                                     .vtable · .widgetTree · .functionBody · .resources ·
                                     .dataTypes.enum · .manifest · .qtTypeOf
model/bin/role-resolver.ts           qtType-first · ctorPeers · label-last · RoleResolution
model/ir/type-archetype-map.ts       small editable canonical map (7 entries at r24 landing ·
                                     r25 expansion carrier named)
```

**Consumer rule:** future rounds add QUERIES to `ir.*`, never new extractors.
If a question isn't callable, extend the API · don't fork the corpus.

## The prune obligation

When the IR lowering lands, every description in the repo that still frames
the pipeline as "20 steps" or "N Ghidra scripts" becomes stale and actively
misleading. The successor spec MUST include an explicit prune-stale-content
phase. Leaving old and new side-by-side is how doctrine rots. The prune is
non-negotiable · owned by the successor's terminal · not a cleanup
afterthought.

## Round-3 application

The null-semantics cascade (round-3 B1 trunk) fully respects Java-transcriber
rule. `ExtractWidgetHierarchy.java` was extended to do SSA walking — but that
is transcription (walking Ghidra's SSA graph · faithfully serializing its
decisions). Classification, consolidation, and detector reframes all landed
in TypeScript. The boundary held.

## The question to ask

Before touching Ghidra Java or TypeScript in model/bin/:

```
  Is this SEMANTIC INTERPRETATION or MECHANICAL SERIALIZATION?
    · interpretation → TypeScript (model/bin/)
    · serialization → Java (ghidra_scripts/)

  If a change to ghidra_scripts/*.java would need to know "what this
  widget means" — it belongs in TypeScript · not Java.

  If a change to model/bin/*.ts would need to know "what Ghidra's
  HighFunction API exposes" — fine · but never import Ghidra types.
  Consume the transcribed JSON.
```

## Known pipeline traps (recurring · not intuition-covered)

```
  copyGhidraOutput path-mismatch (STRUCTURAL BUG · not a feature)
  ──────────────────────────────────────────────────────────────
  Java extractors write to inconsistent paths. Some write to /tmp/<name>
  (historical convention). Some write directly to model/raw/<name>
  (ExtractWidgetHierarchy.java: resolveOutputPath · line 1107). pipeline.ts
  copyGhidraOutput currently accepts either as a temporary accommodation
  (commit 1a3933e) to unblock round-3 after a power-off cleared /tmp.

  THIS IS A BUG, NOT A FEATURE. Per fleet doctrine "Fail hard · no legacy
  support," the accept-either pattern is tech debt. Proper fix is:

    1. every Java extractor writes to model/raw/<name> · deterministic
    2. pipeline.ts copyGhidraOutput checks ONLY model/raw/<name> · crashes
       hard with clear error if missing
    3. /tmp/ as output location is retired · no dual-path logic

  Round-N scope (whenever pipeline work lands next): enumerate Java
  scripts that still write to /tmp/ · migrate each · then delete the
  accept-either branch in pipeline.ts.

  RECURRENCE TRIGGER until fixed: power-off or system restart clears
  /tmp/ · pipeline appears to work but state is inconsistent. Recognize
  the signature · file the proper-fix ticket · don't paper over.
```

## SSA chain folding · same-leaf base invariant

When folding `PcodeOperand` subtrees (r11 · `model/bin/ir/ssa-fold.ts`),
chained pointer arithmetic collapses by SUMMING offsets — BUT only
when every link in the chain rebases against the same SSA leaf (the
function's `this` root). Different leaves = different objects · the
sum is nonsense · fold to `unresolvable`.

```
  PTRSUB(PTRSUB(leaf, 4984), const 120) → {member, offset: 5104}
  PTRSUB(PTRSUB(other, 4984), const 120) → {unresolvable}

  real corpus instance · site 0x1401544d0#0x140154658 operand[0]
  (fleet/docs/audit/round-11/a-ssa-fold.md)
```

PTRADD chain extension (symmetric rule · array-stride arithmetic)
lands in r12 · carrier `fleet-r12-rect-algebra-lift / a-ssa-fold-ptradd`.

## Read these

1. `fleet/CLAUDE.md` §"The pipeline is a UI decompiler"
2. `fleet/docs/pipeline.md` — the three-file mental model + the endpoint
3. `fleet/docs/findings/pcode-migration-walkthrough.md` — the migration walkthrough
4. `fleet/docs/audit/pcode/b5-merge-retire.md` — PROVE-BEFORE-RETIRE canonical instance

## One-line doctrine

> Ghidra transcribes. TypeScript interprets. Commits version. Regen migrates.
