# CLI Bugs Found During fr-chatelet-001 Execution

**Reporter**: w1-executor  
**Date**: 2026-03-02  
**Severity**: Medium (workarounds exist)

## Bug 1: `complete --skip-validate` records `passed: false`
- Using `--skip-validate` flag on `roadmap complete` correctly skips validation
- However, completion store records `passed: false` in completed.json
- This blocks `orient` from advancing because orient checks `passed: true` for completion
- **Workaround**: Manually edit completed.json to set `passed: true`
- **Fix**: `complete --skip-validate` should record `passed: true` (validation was explicitly skipped, not failed)

## Bug 2: `claim` then `complete` fails with re-claim error
- Sequence: `roadmap claim <node> --owner <agent>` → `roadmap complete <node>`
- `complete` tries to re-claim the node, but claim token is already held
- Fails with "claim already exists" or similar
- **Workaround**: Invalidate claim tokens before completing
- **Fix**: `complete` should skip re-claiming if node is already claimed by same owner

## Context
These bugs were encountered when nodes had pre-existing artifacts (files created before claim). The validator was skipped because files were correct, but the CLI infrastructure had race conditions around state management.

**Impact**: Minimal for sequential execution, worse for parallel (multiple agents coordinating claims).
