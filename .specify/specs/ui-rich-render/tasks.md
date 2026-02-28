---
description: "FR-UI-001 — Rich Render Overlay: always-on stderr render, dual-channel envelope v1.1, centralized render library"
dagId: ui-rich-render
---

# Tasks: FR-UI-001 — Rich Render Overlay

**Input**: src/lib/cli-envelope.ts (CliEnvelope, emit, emitError), src/lib/cli-human.ts (existing per-command formatters), bin/roadmap.ts
**Goal**: Every CLI command emits machine JSON to stdout + rich human render to stderr by default. Render is part of the envelope contract, not an opt-in flag.

## Phase 0: Init

- [P0] init: Existing codebase — cli-envelope.ts, cli-human.ts, bin/roadmap.ts, all command functions
  - produces: src/lib/cli-envelope.ts, src/lib/cli-human.ts, bin/roadmap.ts

## Phase 1: Schemas + Core Library (parallel)

- [P1] ui-envelope-v1_1: Add RenderV1 type and render field to CliEnvelope. RenderV1: { format: 'ansi' | 'plain'; mime: 'text/x-roadmap-ui'; title: string; body: string; sections?: Array<{id: string; title: string; body: string}> }. CliEnvelope gets optional render?: RenderV1. Add RENDER_MISSING = 'RENDER_MISSING' to ErrorCode. Add RenderV1 to exports. Do NOT change emit() signature yet — that happens in ui-command-integration.
  - depends: init
  - produces: src/lib/cli-envelope.ts
  - validate: shell:npx tsc --noEmit

- [P1] ui-render-core: Build src/lib/render/ library. Files: types.ts (RenderOpts, RenderModel union, Node AST), style.ts (STATUS_PALETTE, EMOJI map, ansiEnabled(opts)), layout.ts (wrapText, truncate, resolveWidth — min(ttyWidth,140) fallback 120), box.ts (boxTable, panel — box-drawing chars), bars.ts (progressBar with unicode blocks █░, sparkline), index.ts (public render(model, opts): {ansi?: string; plain: string} — dispatches on model.kind). No timestamps in any render output. plain is always escape-code-free.
  - depends: init
  - produces: src/lib/render/types.ts, src/lib/render/style.ts, src/lib/render/layout.ts, src/lib/render/box.ts, src/lib/render/bars.ts, src/lib/render/index.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: DAG + Error Renderers

- [P2] ui-dag-render: Add src/lib/render/dag.ts and src/lib/render/errors.ts. dag.ts: renderDagLayers(layers, opts) — layered batch view with status emoji (✅🟡⛔💤🧨) per node, progress bar header, HEAD sha header. renderCriticalPath(path, opts) — single highlighted chain. errors.ts: renderErrorPanel(error, opts) — boxed error with fix[] steps, code, message. Export from src/lib/render/index.ts. Extend RenderModel with kinds: 'orient', 'chart', 'error'.
  - depends: ui-render-core
  - produces: src/lib/render/dag.ts, src/lib/render/errors.ts, src/lib/render/index.ts
  - validate: shell:npx tsc --noEmit

## Phase 3: Command Integration

- [P3] ui-command-integration: Wire all commands through centralized render. Three changes to bin/roadmap.ts: (1) At CLI entrypoint, resolve RenderOpts once: { tty: process.stderr.isTTY ?? false, width: resolveWidth(), color: tty && !process.env.NO_COLOR, emoji: true }. (2) After every json() call, build RenderModel from result data, call render(model, renderOpts), embed render.plain in JSON envelope (stdout), print render.ansi or render.plain to stderr unless --quiet flag set. (3) If render field absent on non-quiet envelope: print to stderr "RENDER_MISSING" warning (do NOT exit 3 — that's too breaking; warn instead). Update existing cli-human.ts renderOrient / renderChart to return RenderModel-compatible output so they can feed into the new render pipeline. Commands that don't have a specific RenderModel kind use 'generic' with title + kv pairs from data.
  - depends: ui-envelope-v1_1, ui-dag-render
  - produces: bin/roadmap.ts, src/lib/cli-envelope.ts
  - validate: shell:npx tsc --noEmit

## Phase 4: Snapshot Tests

- [P4] ui-snapshot-tests: Write tests/ui-snapshot.test.ts. Test pattern: invoke bin/roadmap commands via execFileSync capturing both stdout and stderr. Assert: stdout parses as valid JSON with schema_version:1 and render.plain present. stderr contains 'text/x-roadmap-ui' marker string. ANSI-stripped render.plain is byte-identical to a golden string (inline snapshot). Stable: no timestamps, deterministic ordering. Cover: orient (with empty DAG), chart (with rkg-harvest-complete fixture or mock), env-audit, completion doctor. Minimum 12 test cases.
  - depends: ui-command-integration
  - produces: tests/ui-snapshot.test.ts
  - validate: shell:npx vitest run tests/ui-snapshot.test.ts

## Phase 5: Term

- [P5] term: FR-UI-001 complete — RenderV1 in envelope, render library (6 files), DAG + error renderers, all commands emit to stderr by default, 12+ snapshot tests passing. tsc clean.
  - depends: ui-snapshot-tests
  - produces: .roadmap/completed.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/ui-snapshot.test.ts
