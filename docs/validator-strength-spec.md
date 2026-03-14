# Validator Strength + API Enforcement Fix

## Problem

Two broken feedback loops:

1. **Agents write weak validators.** Specs ship with `artifact-exists` and `grep` for nodes that produce runnable artifacts (Vue components, CLI tools, APIs). Nothing in `make` or `renderPattern` pressures behavioral testing. The execution miner flags `weakEvidence` at terminal — too late. The spec should be rejected at `make` time.

2. **API enforcement gate passes when it shouldn't.** `CANONICAL_COMMANDS` is hardcoded and missing 5 routes (status, api, help, dag.log, spec.migrate). The gate says "ok: true" while real drift exists. `api --validate` isn't in the build script. Help text is static and unchecked.

## Design

### Validator Strength at Make Time

Add a `make` invariant: nodes with `mode: execute` whose produces contain runnable files (`.ts`, `.js`, `.vue`, `.svelte`, `bin/*`) must have at least one validator above tier 1 (grep/artifact-exists). Terminal nodes must have tier 3+ (unit test, launch-check, or shell that invokes the artifact).

Tiers:
- 0: artifact-exists
- 1: shell with only grep/echo
- 2: shell with build command (tsc, pnpm build)
- 3: shell with test runner (vitest, jest, pytest) or launch-check
- 4: shell that invokes a produced file directly
- 5: e2e / integration test

Classification is by parsing the shell command string. Not perfect, but catches the obvious cases.

### renderPattern VERIFY Line

Replace the generic `VERIFY: All produces exist and validators pass` with a line that describes what the validators actually check. Examples:

- `VERIFY: vitest run tests/gauge.test.ts (behavioral)`
- `VERIFY: file exists only — NO behavioral test`
- `VERIFY: pnpm build + grep (compilation, no runtime test)`

This makes weak validation visible to the executing agent, who may compensate.

### API Enforcement Fix

1. Derive CANONICAL_COMMANDS from the router at validation time — read the switch cases from a shared constant, not hardcoded.
2. Wire `api --validate` into `pnpm build` (post-esbuild step).
3. Export HELP_COMMANDS from help.ts so the gate can verify help ↔ schemas closure.
4. Make deriveSchemaKey a lookup table instead of string construction.
