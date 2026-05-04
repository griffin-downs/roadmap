// Test: spec-migrate — 0.3.0 → 0.4.0 dead-field-strip migration.
//
// v0.4.0 strips legacy node fields (priority, depends, ambient, provenance,
// idempotent) and bumps protocolVersion. This test exercises migrateDAG()
// directly — no CLI shell-out — to assert the dead-field cut.

import { test } from "node:test";
import * as assert from "node:assert";
import { migrateDAG } from "../../src/lib/versioning.schema.ts";

test("spec-migrate 0.3.0 → 0.4.0: strips dead node fields and bumps protocolVersion", () => {
  const v3Dag = {
    id: "test-dag",
    desc: "v0.3.0 DAG carrying dead fields",
    init: "init",
    term: "term",
    protocolVersion: "0.3.0" as const,
    nodes: {
      init: {
        id: "init",
        desc: "Init",
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
        priority: 0,
        depends: [],
        idempotent: true,
        ambient: ["docs/old-spec.md"],
        provenance: { from: "legacy" },
      },
      term: {
        id: "term",
        desc: "Term",
        produces: ["term.txt"],
        consumes: [],
        deps: ["init"],
        validate: [],
        priority: 99,
        depends: ["init"],
        idempotent: false,
        ambient: [],
        provenance: { from: "legacy" },
      },
    },
  };

  const migrated = migrateDAG(v3Dag, "0.4.0");

  assert.strictEqual(migrated.protocolVersion, "0.4.0", "protocolVersion bumped to 0.4.0");

  for (const id of Object.keys(migrated.nodes)) {
    const n = migrated.nodes[id];
    assert.strictEqual("priority" in n, false, `${id}: priority stripped`);
    assert.strictEqual("depends" in n, false, `${id}: depends stripped`);
    assert.strictEqual("ambient" in n, false, `${id}: ambient stripped`);
    assert.strictEqual("provenance" in n, false, `${id}: provenance stripped`);
    assert.strictEqual("idempotent" in n, false, `${id}: idempotent stripped`);
  }

  // Non-dead fields preserved.
  assert.deepStrictEqual(migrated.nodes.term.produces, ["term.txt"]);
  assert.deepStrictEqual(migrated.nodes.term.deps, ["init"]);
});

test("spec-migrate 0.3.0 → 0.4.0: no-op when DAG has no dead fields", () => {
  const cleanDag = {
    id: "clean-dag",
    init: "init",
    term: "term",
    protocolVersion: "0.3.0" as const,
    nodes: {
      init: { id: "init", desc: "Init", produces: [], consumes: [], deps: [], validate: [] },
      term: { id: "term", desc: "Term", produces: ["t.txt"], consumes: [], deps: ["init"], validate: [] },
    },
  };

  const migrated = migrateDAG(cleanDag, "0.4.0");

  assert.strictEqual(migrated.protocolVersion, "0.4.0");
  assert.deepStrictEqual(Object.keys(migrated.nodes.init).sort(), [
    "consumes", "deps", "desc", "id", "produces", "validate",
  ]);
});
