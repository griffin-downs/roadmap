import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import {
  cmdInit,
  cmdStatus,
  cmdList,
  cmdRun,
  cmdRender,
  cmdVerify,
  SovereigntyError,
} from "../../src/lib/metaflow/cli-sovereignty.ts";
import { writeRenderReceipt } from "../../src/lib/metaflow/render-receipt.ts";
import type { Flow } from "../../src/lib/metaflow/flow-schema.ts";

let tmp: string;

// Initialize a bare git repo so getTreeSha works
function initGit(root: string): void {
  execSync("git init -q", { cwd: root });
  execSync("git config user.email test@test.com", { cwd: root });
  execSync("git config user.name Test", { cwd: root });
  writeFileSync(join(root, ".keep"), "");
  execSync("git add .keep", { cwd: root });
  execSync("git commit -q -m init", { cwd: root });
}

function makeFlow(id: string): Flow {
  return {
    schemaVersion: 1,
    id,
    desc: `Flow ${id}`,
    stageMin: 0,
    stageMax: 3,
    requiresAuthority: true,
    steps: [],
  };
}

function writeFlowIndex(root: string, ids: string[]): void {
  const dir = join(root, ".roadmap", "flows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "INDEX.json"), JSON.stringify({ ids }));
  for (const id of ids) {
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(makeFlow(id)));
  }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cli-sov-test-"));
  initGit(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("cmdInit", () => {
  it("creates authority.json on first call", () => {
    const result = cmdInit(tmp);
    expect(result.action).toBe("created");
    expect(result.authority.kernel).toBe("roadmap");
    expect(result.authority.stage).toBe(0);
    expect(typeof result.authority.treeSha).toBe("string");
  });

  it("returns already-governed if authority.json exists", () => {
    cmdInit(tmp);
    const result = cmdInit(tmp);
    expect(result.action).toBe("already-governed");
  });

  it("respects kernel and stage opts", () => {
    const result = cmdInit(tmp, { kernel: "donjon", stage: 2 });
    expect(result.authority.kernel).toBe("donjon");
    expect(result.authority.stage).toBe(2);
  });
});

describe("cmdStatus", () => {
  it("returns ungoverned when no authority.json", () => {
    const result = cmdStatus(tmp);
    expect(result.governed).toBe(false);
    expect(result.authority).toBeNull();
    expect(result.treeShaMatch).toBeNull();
  });

  it("returns governed + treeShaMatch after init", () => {
    cmdInit(tmp);
    const result = cmdStatus(tmp);
    expect(result.governed).toBe(true);
    expect(result.authority).not.toBeNull();
    // treeShaMatch may be true or false depending on git state
    expect(typeof result.treeShaMatch).toBe("boolean");
  });
});

describe("cmdList", () => {
  it("returns empty ids and flows when no registry", () => {
    const result = cmdList(tmp);
    expect(result.ids).toEqual([]);
    expect(result.flows).toEqual([]);
  });

  it("returns all flows from registry", () => {
    writeFlowIndex(tmp, ["alpha", "beta"]);
    const result = cmdList(tmp);
    expect(result.ids).toEqual(["alpha", "beta"]);
    expect(result.flows).toHaveLength(2);
  });
});

describe("cmdRun", () => {
  it("throws UNGOVERNED_REPO when no authority.json", () => {
    writeFlowIndex(tmp, ["test-flow"]);
    expect(() => cmdRun(tmp, "test-flow")).toThrow(SovereigntyError);
    try {
      cmdRun(tmp, "test-flow");
    } catch (err) {
      expect(err).toBeInstanceOf(SovereigntyError);
      expect((err as SovereigntyError).code).toBe("UNGOVERNED_REPO");
    }
  });

  it("returns flow and started timestamp when governed", () => {
    cmdInit(tmp);
    writeFlowIndex(tmp, ["alpha"]);
    const result = cmdRun(tmp, "alpha");
    expect(result.flowId).toBe("alpha");
    expect(result.flow.id).toBe("alpha");
    expect(typeof result.started).toBe("string");
  });
});

describe("cmdRender", () => {
  it("writes a render receipt with explicit opts", () => {
    const treeSha = execSync("git rev-parse HEAD^{tree}", {
      cwd: tmp,
      encoding: "utf-8",
    }).trim();
    const result = cmdRender(tmp, {
      cmd: "orient",
      treeSha,
      plain: "# orient",
      envelope: {},
    });
    expect(result.receipt.cmd).toBe("orient");
    expect(result.reRendered).toBe(false);
  });

  it("re-renders from last receipt", () => {
    writeRenderReceipt(tmp, "chart", "sha-x", "# chart", { data: 1 });
    const result = cmdRender(tmp);
    expect(result.reRendered).toBe(true);
    expect(result.receipt.cmd).toBe("chart");
  });
});

describe("cmdVerify", () => {
  it("returns ok:false when ungoverned", () => {
    const result = cmdVerify(tmp);
    expect(result.ok).toBe(false);
    expect(result.checks.governed).toBe(false);
  });

  it("returns governed check true after init", () => {
    cmdInit(tmp);
    const result = cmdVerify(tmp);
    expect(result.checks.governed).toBe(true);
    expect(result.checks.flowsValid).toBe(true); // empty registry is valid
  });
});
