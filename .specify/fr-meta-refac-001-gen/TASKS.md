# TASKS for FR-META-REFAC-001-Generated Refactor

## Batch 1: Schema Consolidation
- consolidate-schema: merge audit-schema.ts + perf-schema.ts → src/lib/schema.ts

## Batch 2: CLI Wrapping
- wrap-audit-cli: add 'roadmap audit' command
- wrap-expand-cli: add 'roadmap expand <script>' command

## Batch 3: Test Refactoring
- split-integration-tests: separate fast/slow cases

## Batch 4: Layout Cleanup
- move-io-purity: move src/lib/* IO ops → src/io/*

## Terminal Intent Gates
- intent-init: plan clarity verified
- intent-term: all changes integrate + zero regression
- mine-run: agent findings recorded
- audit-surface: layout audit passed
- perf-budget: vitest budget <15s achieved
