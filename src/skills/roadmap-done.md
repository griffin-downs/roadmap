<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-done

Submit completed work for a node. Commits produces and runs validation.

## Arguments
- `node` (required): Node ID to complete.
- `message` (required): What was produced. Becomes the commit message trailer.

## Steps
1. Run: `$ROADMAP_BIN show $node` — get `produces[]` from the JSON output.
2. For each path in `produces[]`: verify the file exists on disk. If any are missing, **STOP** and report which produces are absent. Do not proceed with a partial commit.
3. Run: `git add <produces files only>` — list each file explicitly. Never `git add .` or `git add -A`.
4. Run: `git commit -m "$node: $message"`
5. Run: `$ROADMAP_BIN complete $node --note "$message"`
6. If `complete` **rejects**: return the `ValidationResult` verbatim. Do not retry automatically. Diagnosis:
   - Read the failing rule name + expected condition.
   - Trace to which produce or spec-conformance scenario failed.
   - Fix the produce, not the validator. Commit the fix. Call `/roadmap-done` again.
7. If `complete` **succeeds**: return the checkpoint ID and any newly unblocked nodes.

## Contract
- **Commit per node, before complete.** The commit must exist before validation runs.
- **git add only files in produces.** Exclusive ownership — these files belong to this node.
- **If complete rejects, the commit stands.** Fix, commit again, retry `/roadmap-done`. The rejection is diagnostic, not destructive.
- **Never `--skip-validate`.** Validation is not optional unless the user explicitly instructs otherwise.
- **Fix the produce, not the validator.** If the validator is genuinely wrong (outdated spec), fix the validator and document why in the commit message.
