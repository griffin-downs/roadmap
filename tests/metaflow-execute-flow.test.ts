// Test suite for execute-flow.ts — flow execution with step handlers
// Tests: step dispatch, handler correctness, artifact production, fail-fast behavior

import { test, describe, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { executeFlow } from "../src/lib/metaflow/phases/execute-flow.ts";

describe("executeFlow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve("/tmp/roadmap-test-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, ".roadmap/flows"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  test("executes audit-recovery flow with 5 steps", async () => {
    // Write flow definition
    const flowDef = {
      schemaVersion: 1,
      id: "audit-recovery-flow",
      desc: "Audit and recovery",
      stageMin: 0,
      stageMax: 10,
      requiresAuthority: true,
      steps: [
        {
          id: "step-1-audit-initial",
          desc: "Run audit",
          cmd: "roadmap mf audit",
          args: { note: "test" },
          produces: [".roadmap/metaflow/audit/audit-run.json"],
          consumes: [],
          validate: [{ type: "artifact-exists", target: ".roadmap/metaflow/audit/audit-run.json" }],
          render: { required: true },
        },
        {
          id: "step-2-detect-failures",
          desc: "Detect failures",
          cmd: "roadmap internal detect-audit-failures",
          args: { auditPath: ".roadmap/metaflow/audit/audit-run.json" },
          produces: [".roadmap/metaflow/recovery/failures.json"],
          consumes: [".roadmap/metaflow/audit/audit-run.json"],
          validate: [{ type: "artifact-exists", target: ".roadmap/metaflow/recovery/failures.json" }],
          render: { required: true },
        },
      ],
    };

    writeFileSync(
      join(tmpDir, ".roadmap/flows/audit-recovery-flow.json"),
      JSON.stringify(flowDef, null, 2)
    );
    writeFileSync(
      join(tmpDir, ".roadmap/flows/INDEX.json"),
      JSON.stringify({ ids: ["audit-recovery-flow"] }, null, 2)
    );

    const report = await executeFlow(tmpDir, "audit-recovery-flow");

    expect(report.flowId).toBe("audit-recovery-flow");
    expect(report.steps.length).toBe(2);
    expect(report.passed).toBe(true);
    expect(report.steps[0].stepId).toBe("step-1-audit-initial");
    expect(report.steps[0].passed).toBe(true);
    expect(report.steps[1].stepId).toBe("step-2-detect-failures");
    expect(report.steps[1].passed).toBe(true);

    // Check artifacts exist
    expect(existsSync(join(tmpDir, ".roadmap/metaflow/audit/audit-run.json"))).toBe(true);
    expect(existsSync(join(tmpDir, ".roadmap/metaflow/recovery/failures.json"))).toBe(true);
  });

  test("produces coherence artifacts", async () => {
    const flowDef = {
      schemaVersion: 1,
      id: "state-coherence-flow",
      desc: "State coherence",
      stageMin: 0,
      stageMax: 10,
      requiresAuthority: true,
      steps: [
        {
          id: "step-1-load-transitions",
          desc: "Load transitions",
          cmd: "roadmap internal load-transitions",
          args: { trailPath: ".roadmap/trail.jsonl" },
          produces: [".roadmap/metaflow/coherence/transitions.json"],
          consumes: [],
          validate: [{ type: "artifact-exists", target: ".roadmap/metaflow/coherence/transitions.json" }],
          render: { required: true },
        },
      ],
    };

    writeFileSync(
      join(tmpDir, ".roadmap/flows/state-coherence-flow.json"),
      JSON.stringify(flowDef, null, 2)
    );
    writeFileSync(
      join(tmpDir, ".roadmap/flows/INDEX.json"),
      JSON.stringify({ ids: ["state-coherence-flow"] }, null, 2)
    );

    const report = await executeFlow(tmpDir, "state-coherence-flow");

    expect(report.passed).toBe(true);
    const transitions = JSON.parse(
      readFileSync(join(tmpDir, ".roadmap/metaflow/coherence/transitions.json"), "utf-8")
    );
    expect(transitions.timestamp).toBeDefined();
    expect(Array.isArray(transitions.transitions)).toBe(true);
  });

  test("produces performance artifacts", async () => {
    // Write latency data first
    mkdirSync(join(tmpDir, ".roadmap/metaflow/performance"), { recursive: true });
    writeFileSync(
      join(tmpDir, ".roadmap/metaflow/performance/latency-data.json"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        metric: "latency",
        samples: [
          { cmd: "orient", ms: 250 },
          { cmd: "advance", ms: 320 },
        ],
      })
    );

    const flowDef = {
      schemaVersion: 1,
      id: "performance-hardening-flow",
      desc: "Performance hardening",
      stageMin: 0,
      stageMax: 10,
      requiresAuthority: true,
      steps: [
        {
          id: "step-2-compute-percentiles",
          desc: "Compute percentiles",
          cmd: "roadmap internal compute-latency-percentiles",
          args: { latencyPath: ".roadmap/metaflow/performance/latency-data.json" },
          produces: [".roadmap/metaflow/performance/latency-percentiles.json"],
          consumes: [".roadmap/metaflow/performance/latency-data.json"],
          validate: [{ type: "artifact-exists", target: ".roadmap/metaflow/performance/latency-percentiles.json" }],
          render: { required: true },
        },
      ],
    };

    writeFileSync(
      join(tmpDir, ".roadmap/flows/performance-hardening-flow.json"),
      JSON.stringify(flowDef, null, 2)
    );
    writeFileSync(
      join(tmpDir, ".roadmap/flows/INDEX.json"),
      JSON.stringify({ ids: ["performance-hardening-flow"] }, null, 2)
    );

    const report = await executeFlow(tmpDir, "performance-hardening-flow");

    expect(report.passed).toBe(true);
    const percentiles = JSON.parse(
      readFileSync(join(tmpDir, ".roadmap/metaflow/performance/latency-percentiles.json"), "utf-8")
    );
    expect(percentiles.percentiles).toBeDefined();
    expect(percentiles.percentiles.orient).toBeDefined();
  });

  test("fails on missing artifact from external command", async () => {
    // Missing audit file will cause detect-failures to fail
    const flowDef = {
      schemaVersion: 1,
      id: "audit-recovery-flow",
      desc: "Audit and recovery",
      stageMin: 0,
      stageMax: 10,
      requiresAuthority: true,
      steps: [
        {
          id: "step-2-detect-failures",
          desc: "Detect failures",
          cmd: "roadmap internal detect-audit-failures",
          args: { auditPath: ".roadmap/metaflow/audit/nonexistent.json" },
          produces: [".roadmap/metaflow/recovery/failures.json"],
          consumes: [".roadmap/metaflow/audit/nonexistent.json"],
          validate: [{ type: "artifact-exists", target: ".roadmap/metaflow/recovery/failures.json" }],
          render: { required: true },
        },
      ],
    };

    writeFileSync(
      join(tmpDir, ".roadmap/flows/audit-recovery-flow.json"),
      JSON.stringify(flowDef, null, 2)
    );
    writeFileSync(
      join(tmpDir, ".roadmap/flows/INDEX.json"),
      JSON.stringify({ ids: ["audit-recovery-flow"] }, null, 2)
    );

    const report = await executeFlow(tmpDir, "audit-recovery-flow");

    expect(report.passed).toBe(false);
    expect(report.steps[0].passed).toBe(false);
    expect(report.steps[0].error).toContain("ENOENT");
  });

  test("fails fast on step error", async () => {
    const flowDef = {
      schemaVersion: 1,
      id: "test-flow",
      desc: "Test flow",
      stageMin: 0,
      stageMax: 10,
      requiresAuthority: true,
      steps: [
        {
          id: "step-1",
          desc: "First step",
          cmd: "roadmap internal detect-audit-failures",
          args: { auditPath: ".roadmap/nonexistent.json" },
          produces: [".roadmap/failures.json"],
          consumes: [],
          validate: [{ type: "artifact-exists", target: ".roadmap/failures.json" }],
          render: { required: true },
        },
        {
          id: "step-2",
          desc: "Second step (should not run)",
          cmd: "roadmap internal apply-recovery",
          args: { failurePath: ".roadmap/failures.json" },
          produces: [".roadmap/recovery.json"],
          consumes: [".roadmap/failures.json"],
          validate: [{ type: "artifact-exists", target: ".roadmap/recovery.json" }],
          render: { required: true },
        },
      ],
    };

    writeFileSync(
      join(tmpDir, ".roadmap/flows/test-flow.json"),
      JSON.stringify(flowDef, null, 2)
    );
    writeFileSync(
      join(tmpDir, ".roadmap/flows/INDEX.json"),
      JSON.stringify({ ids: ["test-flow"] }, null, 2)
    );

    const report = await executeFlow(tmpDir, "test-flow");

    expect(report.passed).toBe(false);
    expect(report.steps.length).toBe(1); // Only first step runs before fail-fast
    expect(report.steps[0].stepId).toBe("step-1");
  });
});
