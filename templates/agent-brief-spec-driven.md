---
dagId: "{{DAG_ID}}"
level: {{LEVEL}}
position: {{POSITION_ARRAY}}
batchComplete: {{BATCH_COMPLETE}}
done: {{DONE_COUNT}}
remaining: {{REMAINING_COUNT}}
produces:
  - "{{PRODUCE_1}}"
  - "{{PRODUCE_2}}"
consumes:
  - "{{CONSUME_1}}"
specKitWorkspace: ".roadmap/spec/"
---

# Agent Brief: {{DAG_ID}}

## Intent

{{INTENT — one sentence, specific, falsifiable}}

## Position

- **Batch (L{{LEVEL}}):** {{node-a}}, {{node-b}}
- **Batch complete:** false
- **Remaining nodes:** {{REMAINING_COUNT}}

## Produces

- `{{PRODUCE_1}}`
- `{{PRODUCE_2}}`

## Consumes

- `{{CONSUME_1}}`

## Spec Files

- `.roadmap/spec/{{DAG_ID}}-pre-spec.md`
- `.roadmap/spec/{{DAG_ID}}-spec.md`
- `.roadmap/spec/{{DAG_ID}}-plan.md`
- `.roadmap/spec/{{DAG_ID}}-tasks.md`

## Next Steps

1. Read spec files in `.roadmap/spec/`
2. Run `/speckit.specify` — generate specification from pre-spec
3. Run `/speckit.plan` — produce implementation plan
4. Run `/speckit.tasks` — emit task DAG nodes
5. Run `roadmap import --from speckit .roadmap/spec/{{DAG_ID}}-tasks.md --id {{DAG_ID}}` — import into roadmap

## Troubleshooting

- **Missing spec files:** Ensure `.roadmap/spec/` exists and contains `pre-spec.md`
- **Validation failures:** Run `roadmap validate --note "checking"` to see which rules fail
- **Import errors:** Validate tasks JSON with `validateSpecKitTasks()` before importing
- **Position stale:** Re-run `roadmap orient --note "re-check"` to refresh batch position

---

## Example: Filled Brief

```markdown
---
dagId: "fr-auth-001"
level: 3
position: ["token-rotation", "token-validation"]
batchComplete: false
done: 5
remaining: 12
produces:
  - "src/middleware/token-rotation.ts"
  - "tests/token-rotation.test.ts"
consumes:
  - "src/auth/types.ts"
specKitWorkspace: ".roadmap/spec/"
---

# Agent Brief: fr-auth-001

## Intent

Implement JWT refresh token rotation with sliding window expiry per RFC 6749 Section 6.

## Position

- **Batch (L3):** token-rotation, token-validation
- **Batch complete:** false
- **Remaining nodes:** 12

## Produces

- `src/middleware/token-rotation.ts`
- `tests/token-rotation.test.ts`

## Consumes

- `src/auth/types.ts`

## Spec Files

- `.roadmap/spec/fr-auth-001-pre-spec.md`
- `.roadmap/spec/fr-auth-001-spec.md`
- `.roadmap/spec/fr-auth-001-plan.md`
- `.roadmap/spec/fr-auth-001-tasks.md`
```
