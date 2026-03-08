// Test: orient-parent-dag — scanSiblingDags

import { test } from "node:test";
import * as assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { resolve } from "path";
import { scanSiblingDags } from "../src/lib/orient-forward.ts";

test("orient-parent-dag: scanSiblingDags finds sibling head.*.json files", async () => {
  const testDir = "/tmp/orient-parent-dag-test";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    // Create current DAG
    const currentDag = {
      id: "main-dag",
      desc: "Main DAG",
      init: "start",
      term: "end",
      nodes: { start: {}, middle: {}, end: {} },
    };
    writeFileSync(
      resolve(testDir, ".roadmap/head.json"),
      JSON.stringify(currentDag),
    );

    // Create sibling DAGs
    const siblingDag1 = {
      id: "parallel-dag-a",
      desc: "Parallel A",
      init: "init-a",
      term: "term-a",
      nodes: { "init-a": {}, "mid-a": {}, "term-a": {} },
    };
    writeFileSync(
      resolve(testDir, ".roadmap/head.parallel-dag-a.json"),
      JSON.stringify(siblingDag1),
    );

    const siblingDag2 = {
      id: "parallel-dag-b",
      desc: "Parallel B",
      init: "init-b",
      term: "term-b",
      nodes: { "init-b": {}, "term-b": {} },
    };
    writeFileSync(
      resolve(testDir, ".roadmap/head.parallel-dag-b.json"),
      JSON.stringify(siblingDag2),
    );

    // Scan siblings excluding the main-dag
    const siblings = scanSiblingDags(testDir, "main-dag");

    // Should find both sibling DAGs
    assert.strictEqual(siblings.length, 2, "should find both sibling DAGs");
    assert.strictEqual(siblings[0].dagId, "parallel-dag-a");
    assert.strictEqual(siblings[0].nodeCount, 3);
    assert.strictEqual(siblings[0].path, ".roadmap/head.parallel-dag-a.json");
    assert.strictEqual(siblings[1].dagId, "parallel-dag-b");
    assert.strictEqual(siblings[1].nodeCount, 2);
    assert.strictEqual(siblings[1].path, ".roadmap/head.parallel-dag-b.json");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("orient-parent-dag: excludes current DAG from results", async () => {
  const testDir = "/tmp/orient-parent-dag-test-exclude";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const currentDag = {
      id: "current-dag",
      desc: "Current",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };
    writeFileSync(
      resolve(testDir, ".roadmap/head.current-dag.json"),
      JSON.stringify(currentDag),
    );

    const siblings = scanSiblingDags(testDir, "current-dag");

    // Should exclude the current DAG itself
    assert.strictEqual(
      siblings.length,
      0,
      "should exclude current DAG from results",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("orient-parent-dag: handles malformed JSON gracefully", async () => {
  const testDir = "/tmp/orient-parent-dag-test-malformed";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    // Create valid sibling
    const validDag = {
      id: "valid-dag",
      desc: "Valid",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };
    writeFileSync(
      resolve(testDir, ".roadmap/head.valid-dag.json"),
      JSON.stringify(validDag),
    );

    // Create malformed DAG file
    writeFileSync(
      resolve(testDir, ".roadmap/head.malformed-dag.json"),
      "not valid json",
    );

    // Create DAG missing required fields
    writeFileSync(
      resolve(testDir, ".roadmap/head.incomplete-dag.json"),
      JSON.stringify({ id: "incomplete-dag" }), // missing nodes
    );

    const siblings = scanSiblingDags(testDir, "current-dag");

    // Should only find the valid DAG and skip malformed ones
    assert.strictEqual(siblings.length, 1, "should skip malformed DAGs");
    assert.strictEqual(siblings[0].dagId, "valid-dag");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("orient-parent-dag: returns empty array when no sibling DAGs present", async () => {
  const testDir = "/tmp/orient-parent-dag-test-empty";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const siblings = scanSiblingDags(testDir, "any-dag");
    assert.strictEqual(
      siblings.length,
      0,
      "should return empty array when no sibling DAGs exist",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("orient-parent-dag: handles missing .roadmap directory gracefully", async () => {
  const testDir = "/tmp/orient-parent-dag-test-no-dir";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    // Don't create .roadmap directory

    const siblings = scanSiblingDags(testDir, "any-dag");
    assert.strictEqual(
      siblings.length,
      0,
      "should handle missing .roadmap directory gracefully",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
