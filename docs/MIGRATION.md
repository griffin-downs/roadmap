# Migrating SpecIR v1 → v2

This guide translates hand-authored SpecIR JSON from `schema_version: 1` to
`schema_version: 2`. If you only have `.roadmap/head.json` files, you do not
need this guide — see [head.json migration](#headjson-migration) below.

## What changed

Five fields are removed from node specs:

| field         | reason                                                              |
| ------------- | ------------------------------------------------------------------- |
| `priority`    | vestigial · the engine never branched on it                         |
| `depends`     | replaced by data-flow (`consumes` resolves against `produces`)      |
| `ambient`     | not first-class · moves into `tasks[].sidecar.{}`                   |
| `provenance`  | not first-class · moves into `tasks[].sidecar.{}`                   |
| `idempotent`  | defaulted true everywhere · never overridden meaningfully           |

The invariant: **a field is first-class iff the engine reads it and branches
on it.** Everything else lives in `sidecar`.

## The new shape

A v2 node has seven fields:

```json
{
  "id": "build",
  "desc": "Compile the artifact",
  "produces": ["dist/app.js"],
  "consumes": ["src/index.ts"],
  "validate": [{ "type": "artifact-exists" }],
  "mode": "execute",
  "sidecar": {}
}
```

`mode` and `sidecar` are optional. `mode` defaults to `"execute"`; omit
`sidecar` when empty.

## Worked example A · `depends` → consumes-via-ratification

v1 used `depends` to express ordering without data-flow:

```json
{
  "schema_version": 1,
  "nodes": [
    { "id": "init", "desc": "set up workspace" },
    { "id": "build", "desc": "compile", "depends": ["init"] }
  ]
}
```

v2 expresses the same ordering as real data-flow. The predecessor produces
a **ratification receipt** — a small JSON file under `.roadmap/round-N/` that
records the node's completion — and the successor consumes that path:

```json
{
  "schema_version": 2,
  "nodes": [
    {
      "id": "init",
      "desc": "set up workspace",
      "produces": [".roadmap/round-1/init.json"],
      "consumes": [],
      "validate": [{ "type": "artifact-exists" }]
    },
    {
      "id": "build",
      "desc": "compile",
      "produces": ["dist/app.js"],
      "consumes": [".roadmap/round-1/init.json"],
      "validate": [{ "type": "artifact-exists" }]
    }
  ]
}
```

Ordering is identical. The difference: the edge is now a real file the
engine can verify, not a name the engine has to trust.

## Worked example B · `priority` → delete

v1 specs often carried `priority` integers to nudge ordering. v2 derives
ordering from topology alone — `consumes ↔ produces` is the only ordering
signal. Migration is mechanical:

```diff
 {
   "id": "lint",
-  "priority": 2,
   "produces": ["reports/lint.json"],
   "consumes": ["src/index.ts"]
 }
```

Delete the field. The order you wanted is already implicit in the graph.

## Sidecar absorption

`ambient`, `provenance`, and any custom flat field that v1 specs carried
move into `tasks[].sidecar.{}`. The engine ignores `sidecar`; agents and
audits read it freely.

```json
{
  "id": "deploy",
  "produces": ["deploy/log.txt"],
  "consumes": ["dist/app.js"],
  "validate": [{ "type": "shell", "command": "./deploy.sh" }],
  "sidecar": {
    "ambient": ["AWS_REGION"],
    "provenance": { "owner": "platform", "ticket": "INFRA-417" }
  }
}
```

`sidecar` is the only permissive slot in the v2 schema. If you find
yourself wanting a new top-level field, put it here first; promote only
when the engine needs to branch on it.

## head.json migration

Existing `.roadmap/head.json` files migrate silently. When the runtime
reads a head with `protocolVersion: "0.3.0"`, it strips the dead fields
(`priority`, `depends`, `ambient`, `provenance`, `idempotent`) and rewrites
as `protocolVersion: "0.4.0"` on the next mutation. Adopters do nothing.

Only hand-authored SpecIR JSON files (the inputs to `roadmap make`) need
to be redrafted by hand.

## Checklist

- [ ] Bump `schema_version` from 1 to 2
- [ ] Delete every `priority` field
- [ ] Replace each `depends: [X]` with a `consumes` entry pointing at a
      ratification receipt produced by X
- [ ] Move `ambient` and `provenance` into `sidecar`
- [ ] Delete every `idempotent` field
- [ ] Re-run `roadmap make` — it will reject any v1 residue and point
      back at this document
