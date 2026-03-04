// Test: multi-dag — multiple active DAGs in heads/ directory

import { test } from "node:test";
import * as assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  loadAllDags,
  saveDagHead,
  migrateSingleHead,
  loadDag,
} from "../src/lib/multi-dag.ts";
import type { Graph } from "../src/protocol.ts";

test("multi-dag: saveDagHead creates file in heads/<dagId>.json", async () => {
  const testDir = "/tmp/multi-dag-test-save";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const dag: Graph<string> = {
      id: "test-dag",
      desc: "Test DAG",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };

    saveDagHead(testDir, "test-dag", dag);

    const headsPath = resolve(testDir, ".roadmap/heads/test-dag.json");
    assert.strictEqual(
      existsSync(headsPath),
      true,
      "should create heads/ directory and DAG file",
    );

    const saved = JSON.parse(readFileSync(headsPath, "utf-8"));
    assert.strictEqual(saved.id, "test-dag");
    assert.strictEqual(saved.desc, "Test DAG");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: loadAllDags finds all DAGs in heads/", async () => {
  const testDir = "/tmp/multi-dag-test-load";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap/heads"), { recursive: true });

    const dag1: Graph<string> = {
      id: "dag-a",
      desc: "DAG A",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };
    const dag2: Graph<string> = {
      id: "dag-b",
      desc: "DAG B",
      init: "init",
      term: "term",
      nodes: { init: {}, task: {}, term: {} },
    };

    writeFileSync(
      resolve(testDir, ".roadmap/heads/dag-a.json"),
      JSON.stringify(dag1),
    );
    writeFileSync(
      resolve(testDir, ".roadmap/heads/dag-b.json"),
      JSON.stringify(dag2),
    );

    const dags = loadAllDags(testDir);

    assert.strictEqual(dags.size, 2, "should load both DAGs");
    assert.strictEqual(dags.get("dag-a")?.desc, "DAG A");
    assert.strictEqual(dags.get("dag-b")?.desc, "DAG B");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: loadAllDags returns empty map when heads/ doesn't exist", async () => {
  const testDir = "/tmp/multi-dag-test-empty";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const dags = loadAllDags(testDir);

    assert.strictEqual(
      dags.size,
      0,
      "should return empty map when no heads/ directory",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: migrateSingleHead moves head.json to heads/<dagId>.json", async () => {
  const testDir = "/tmp/multi-dag-test-migrate";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const dag: Graph<string> = {
      id: "main-dag",
      desc: "Main",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };

    writeFileSync(resolve(testDir, ".roadmap/head.json"), JSON.stringify(dag));

    const migrated = migrateSingleHead(testDir);

    assert.strictEqual(
      migrated,
      true,
      "should return true on successful migration",
    );
    assert.strictEqual(
      existsSync(resolve(testDir, ".roadmap/head.json")),
      false,
      "should remove old head.json",
    );
    assert.strictEqual(
      existsSync(resolve(testDir, ".roadmap/heads/main-dag.json")),
      true,
      "should create heads/main-dag.json",
    );

    const migrated2 = migrateSingleHead(testDir);
    assert.strictEqual(
      migrated2,
      false,
      "should return false on second call (already migrated)",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: migrateSingleHead returns false when heads/ already exists", async () => {
  const testDir = "/tmp/multi-dag-test-migrate-no-dup";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap/heads"), { recursive: true });

    const dag: Graph<string> = {
      id: "dag",
      desc: "DAG",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };

    writeFileSync(resolve(testDir, ".roadmap/head.json"), JSON.stringify(dag));

    const migrated = migrateSingleHead(testDir);

    assert.strictEqual(
      migrated,
      false,
      "should return false when heads/ directory already exists",
    );
    assert.strictEqual(
      existsSync(resolve(testDir, ".roadmap/head.json")),
      true,
      "should leave head.json untouched when heads/ exists",
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: loadDag with dagId returns that specific DAG", async () => {
  const testDir = "/tmp/multi-dag-test-load-specific";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap/heads"), { recursive: true });

    const dag1: Graph<string> = {
      id: "dag-a",
      desc: "DAG A",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };
    const dag2: Graph<string> = {
      id: "dag-b",
      desc: "DAG B",
      init: "init",
      term: "term",
      nodes: { init: {}, end: {} },
    };

    writeFileSync(
      resolve(testDir, ".roadmap/heads/dag-a.json"),
      JSON.stringify(dag1),
    );
    writeFileSync(
      resolve(testDir, ".roadmap/heads/dag-b.json"),
      JSON.stringify(dag2),
    );

    const loaded = loadDag(testDir, "dag-b");

    assert.strictEqual(loaded?.id, "dag-b", "should load the specified DAG");
    assert.strictEqual(loaded?.desc, "DAG B");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: loadDag without dagId returns first DAG", async () => {
  const testDir = "/tmp/multi-dag-test-load-first";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap/heads"), { recursive: true });

    const dag: Graph<string> = {
      id: "only-dag",
      desc: "Only DAG",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };

    writeFileSync(
      resolve(testDir, ".roadmap/heads/only-dag.json"),
      JSON.stringify(dag),
    );

    const loaded = loadDag(testDir);

    assert.strictEqual(loaded?.id, "only-dag", "should return the only DAG");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: loadDag returns null when no DAGs exist", async () => {
  const testDir = "/tmp/multi-dag-test-load-none";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    const loaded = loadDag(testDir);

    assert.strictEqual(loaded, null, "should return null when no DAGs exist");
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("multi-dag: multiple DAGs don't overwrite each other", async () => {
  const testDir = "/tmp/multi-dag-test-no-overwrite";
  try {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, ".roadmap"), { recursive: true });

    // Create and save DAG A
    const dagA: Graph<string> = {
      id: "dag-a",
      desc: "DAG A",
      init: "start",
      term: "end",
      nodes: { start: {}, end: {} },
    };
    saveDagHead(testDir, "dag-a", dagA);

    // Create and save DAG B
    const dagB: Graph<string> = {
      id: "dag-b",
      desc: "DAG B",
      init: "init",
      term: "term",
      nodes: { init: {}, task: {}, term: {} },
    };
    saveDagHead(testDir, "dag-b", dagB);

    // Verify both exist and are intact
    const dags = loadAllDags(testDir);
    assert.strictEqual(dags.size, 2, "should have both DAGs");
    assert.strictEqual(dags.get("dag-a")?.desc, "DAG A");
    assert.strictEqual(dags.get("dag-b")?.desc, "DAG B");
    assert.strictEqual(Object.keys(dags.get("dag-a")?.nodes || {}).length, 2);
    assert.strictEqual(Object.keys(dags.get("dag-b")?.nodes || {}).length, 3);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
