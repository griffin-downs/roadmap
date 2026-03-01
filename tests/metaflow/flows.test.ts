import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadFlowIndex,
  loadFlow,
  listFlows,
  FlowLoadError,
} from "../../src/lib/metaflow/phases/flows.ts";
import type { Flow } from "../../src/lib/metaflow/phases/flows.ts";

let tmp: string;

// Minimal valid flow fixture
function makeFlow(id: string): Flow {
  return {
    schemaVersion: 1,
    id,
    desc: `Test flow ${id}`,
    stageMin: 0,
    stageMax: 3,
    requiresAuthority: true,
    steps: [],
  };
}

function flowsDir(root: string): string {
  return join(root, ".roadmap", "flows");
}

function writeIndex(root: string, ids: string[]): void {
  const dir = flowsDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "INDEX.json"), JSON.stringify({ ids }));
}

function writeFlow(root: string, flow: Flow): void {
  const dir = flowsDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${flow.id}.json`), JSON.stringify(flow));
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flows-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("loadFlowIndex", () => {
  it("returns ids from valid INDEX.json", () => {
    writeIndex(tmp, ["flow-a", "flow-b"]);
    const ids = loadFlowIndex(tmp);
    expect(ids).toEqual(["flow-a", "flow-b"]);
  });

  it("returns empty array when INDEX.json does not exist", () => {
    mkdirSync(flowsDir(tmp), { recursive: true });
    const ids = loadFlowIndex(tmp);
    expect(ids).toEqual([]);
  });

  it("throws INDEX_MALFORMED when INDEX.json has wrong schema", () => {
    const dir = flowsDir(tmp);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "INDEX.json"), JSON.stringify({ flows: ["x"] }));
    expect(() => loadFlowIndex(tmp)).toThrow(FlowLoadError);
    try {
      loadFlowIndex(tmp);
    } catch (err) {
      expect(err).toBeInstanceOf(FlowLoadError);
      expect((err as FlowLoadError).code).toBe("INDEX_MALFORMED");
    }
  });
});

describe("loadFlow", () => {
  it("loads and returns a valid flow", () => {
    const flow = makeFlow("test-flow");
    writeFlow(tmp, flow);
    const loaded = loadFlow(tmp, "test-flow");
    expect(loaded.id).toBe("test-flow");
    expect(loaded.schemaVersion).toBe(1);
  });

  it("throws FLOW_NOT_FOUND when file is missing", () => {
    mkdirSync(flowsDir(tmp), { recursive: true });
    expect(() => loadFlow(tmp, "missing-flow")).toThrow(FlowLoadError);
    try {
      loadFlow(tmp, "missing-flow");
    } catch (err) {
      expect(err).toBeInstanceOf(FlowLoadError);
      expect((err as FlowLoadError).code).toBe("FLOW_NOT_FOUND");
      expect((err as FlowLoadError).id).toBe("missing-flow");
    }
  });

  it("throws FLOW_MALFORMED when JSON does not match schema", () => {
    const dir = flowsDir(tmp);
    mkdirSync(dir, { recursive: true });
    // Missing required fields: schemaVersion, stageMin, requiresAuthority, steps
    writeFileSync(
      join(dir, "bad.json"),
      JSON.stringify({ id: "bad", desc: "broken" }),
    );
    expect(() => loadFlow(tmp, "bad")).toThrow(FlowLoadError);
    try {
      loadFlow(tmp, "bad");
    } catch (err) {
      expect(err).toBeInstanceOf(FlowLoadError);
      expect((err as FlowLoadError).code).toBe("FLOW_MALFORMED");
    }
  });

  it("throws on malformed JSON (parse error propagates)", () => {
    const dir = flowsDir(tmp);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "corrupt.json"), "{ not valid json }}}");
    expect(() => loadFlow(tmp, "corrupt")).toThrow();
  });
});

describe("listFlows", () => {
  it("returns all flows listed in INDEX.json", () => {
    const flows = ["alpha", "beta"].map(makeFlow);
    writeIndex(tmp, ["alpha", "beta"]);
    for (const f of flows) writeFlow(tmp, f);
    const result = listFlows(tmp);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("returns empty list when INDEX.json is empty", () => {
    writeIndex(tmp, []);
    const result = listFlows(tmp);
    expect(result).toEqual([]);
  });

  it("returns empty list when .roadmap/flows directory does not exist", () => {
    const result = listFlows(tmp);
    expect(result).toEqual([]);
  });

  it("throws when a flow referenced by index is malformed", () => {
    writeIndex(tmp, ["good", "bad"]);
    writeFlow(tmp, makeFlow("good"));
    const dir = flowsDir(tmp);
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ not: "a flow" }));
    expect(() => listFlows(tmp)).toThrow(FlowLoadError);
  });
});
