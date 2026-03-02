# Chatelet Intake Directory

Intake and processing layer for spec-kit specifications into roadmap DAGs.

## Contents

- `*.intake` — raw spec-kit intake JSON (not version controlled)
- `*.schema.json` — derived JSON schemas from spec scenarios
- `*.d.ts` — generated TypeScript type definitions

## Workflow

1. **Import** — `roadmap import --from speckit <tasks.md>` reads chatelet tasks
2. **Intake** — Specification objects stored in `.chatelet/` during processing
3. **Validate** — `validate` rules check conformance to spec scenarios
4. **Archive** — Terminal `.intake` files moved to git history via `roadmap trail --archive`

## Usage

This directory is created and managed by the chatelet enrichment phase. Direct manipulation is not recommended — use roadmap commands instead.

See `/home/griffin/src/roadmap/src/lib/chatelet/` for implementation details.
