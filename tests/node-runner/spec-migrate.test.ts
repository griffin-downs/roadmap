// Test: spec-migrate — auto-fix legacy spec files

import { test } from "node:test";
import * as assert from "node:assert";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

test("spec-migrate: adds missing inputs field with computed sha256", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-1";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      tasks: [
        {
          id: "task1",
          desc: "Test task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.strictEqual(output.data.ok, true);
    assert.ok(output.data.fixed.includes("inputs"), "should fix inputs");

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.ok(updated.inputs, "inputs should exist");
    assert.ok(Array.isArray(updated.inputs), "inputs should be array");
    assert.strictEqual(updated.inputs.length, 1);
    assert.strictEqual(updated.inputs[0].role, "spec");
    assert.ok(
      /^[a-f0-9]{64}$/.test(updated.inputs[0].sha256),
      "sha256 should be valid",
    );
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: adds missing metadata.compile_hash", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-2";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      metadata: {},
      tasks: [
        {
          id: "task1",
          desc: "Test task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.ok(output.data.fixed.includes("metadata.compile_hash"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.strictEqual(updated.metadata.compile_hash, "auto");
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: adds missing metadata.generated", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-3";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      metadata: { compile_hash: "hash123" },
      tasks: [
        {
          id: "task1",
          desc: "Test task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.ok(output.data.fixed.includes("metadata.generated"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.ok(updated.metadata.generated);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(updated.metadata.generated));
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: adds missing engine field", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-4";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      metadata: {
        compile_hash: "hash123",
        generated: "2026-03-01T00:00:00Z",
      },
      tasks: [
        {
          id: "task1",
          desc: "Test task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.ok(output.data.fixed.includes("engine"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.ok(updated.engine);
    assert.strictEqual(updated.engine.name, "spec-kit");
    assert.strictEqual(updated.engine.version, "1.0.0");
    assert.strictEqual(updated.engine.config_hash, null);
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: copies first task desc to dag_desc if missing", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-5";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      metadata: {
        compile_hash: "hash123",
        generated: "2026-03-01T00:00:00Z",
      },
      tasks: [
        {
          id: "task1",
          desc: "Initialize the system",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
        {
          id: "task2",
          desc: "Run validation",
          priority: 2,
          depends: ["task1"],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.ok(output.data.fixed.includes("dag_desc"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.strictEqual(updated.dag_desc, "Initialize the system");
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: adds missing schema_version", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-6";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "test-dag",
      metadata: {
        compile_hash: "hash123",
        generated: "2026-03-01T00:00:00Z",
      },
      tasks: [
        {
          id: "task1",
          desc: "Test task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.ok(output.data.fixed.includes("schema_version"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.strictEqual(updated.schema_version, 1);
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: fixes minimal legacy spec with all fields missing", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-7";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const legacySpec = {
      dag_id: "minimal-dag",
      tasks: [
        {
          id: "task1",
          desc: "Do work",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "fix minimal spec"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.strictEqual(output.data.ok, true);
    assert.ok(output.data.fixed.length > 0);
    assert.ok(output.data.fixed.includes("inputs"));
    assert.ok(output.data.fixed.includes("metadata.compile_hash"));
    assert.ok(output.data.fixed.includes("metadata.generated"));
    assert.ok(output.data.fixed.includes("engine"));
    assert.ok(output.data.fixed.includes("dag_desc"));
    assert.ok(output.data.fixed.includes("schema_version"));

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.ok(updated.inputs);
    assert.strictEqual(updated.metadata.compile_hash, "auto");
    assert.ok(updated.metadata.generated);
    assert.ok(updated.engine);
    assert.strictEqual(updated.dag_desc, "Do work");
    assert.strictEqual(updated.schema_version, 1);
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});

test("spec-migrate: does not duplicate existing fields", async () => {
  const tmpDir = "/tmp/roadmap-migrate-test-8";
  const testSpecPath = join(tmpDir, "legacy-spec.json");

  try {
    execSync(`mkdir -p ${tmpDir}`);

    const existingSpec = {
      dag_id: "complete-dag",
      dag_desc: "Already has description",
      schema_version: 1,
      engine: { name: "custom-engine", version: "2.0.0", config_hash: "hash" },
      metadata: {
        compile_hash: "existing-hash",
        generated: "2026-01-01T00:00:00Z",
      },
      inputs: [{ path: "existing-input.json", sha256: "abc123", role: "spec" }],
      tasks: [
        {
          id: "task1",
          desc: "Task",
          priority: 1,
          depends: [],
          produces: [],
          consumes: [],
          mode: "execute",
          validate: [],
        },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(existingSpec, null, 2));

    const result = execSync(
      `npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test no-op migrate"`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    const output = JSON.parse(result);
    assert.strictEqual(output.data.ok, true);
    assert.strictEqual(output.data.fixed.length, 0);

    const updated = JSON.parse(readFileSync(testSpecPath, "utf-8"));
    assert.strictEqual(updated.dag_desc, "Already has description");
    assert.strictEqual(updated.engine.name, "custom-engine");
    assert.strictEqual(updated.metadata.compile_hash, "existing-hash");
    assert.strictEqual(updated.inputs[0].sha256, "abc123");
  } finally {
    if (existsSync(testSpecPath)) unlinkSync(testSpecPath);
    execSync(`rm -rf ${tmpDir}`, { stdio: "ignore" });
  }
});
