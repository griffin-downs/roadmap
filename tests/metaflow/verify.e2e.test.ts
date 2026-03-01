// E2E tests for src/lib/metaflow/verify.ts
// Covers all 5 acceptance scenarios from the spec.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { verifyAll } from "../../src/lib/metaflow/verify.ts";
import { cmdInit } from "../../src/lib/metaflow/cli-sovereignty.ts";
import { writeRenderReceipt } from "../../src/lib/metaflow/execution/render-receipt.ts";
import { BYPASS_ENV_VARS } from "../../src/lib/metaflow/execution/guards.ts";

let tmp: string;

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-e2e-"));
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  writeFileSync(join(dir, ".keep"), "");
  execSync("git add .keep", { cwd: dir });
  execSync("git commit -q -m init", { cwd: dir });
  return dir;
}

function writePlanSelected(root: string): void {
  const receiptsDir = join(root, ".roadmap", "receipts");
  mkdirSync(receiptsDir, { recursive: true });
  const receiptFile = "plan-select-e2e.json";
  writeFileSync(
    join(receiptsDir, receiptFile),
    JSON.stringify({
      type: "plan-select",
      headSha: "e2e-sha",
      candidateId: "e2e",
      selectedAt: new Date().toISOString(),
      selector: "e2e-test",
    }),
  );
  writeFileSync(
    join(receiptsDir, "PLAN_SELECTED.json"),
    JSON.stringify({ receipt: receiptFile, headSha: "e2e-sha", candidateId: "e2e" }),
  );
}

beforeEach(() => {
  tmp = makeGitRepo();
  // Clean SKIP_* env vars
  for (const v of BYPASS_ENV_VARS) delete process.env[v];
});

afterEach(() => {
  for (const v of BYPASS_ENV_VARS) delete process.env[v];
  rmSync(tmp, { recursive: true, force: true });
});

// Scenario A: no plan-select → fail
describe("Scenario A: no plan-select receipt → plan-select check fails", () => {
  it("verifyAll fails plan-select when PLAN_SELECTED.json absent", () => {
    cmdInit(tmp); // governed, but no plan-select
    mkdirSync(join(tmp, ".roadmap", "receipts"), { recursive: true });
    const result = verifyAll(tmp);
    const planCheck = result.checks.find((c) => c.name === "plan-select");
    expect(planCheck).toBeDefined();
    expect(planCheck!.ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});

// Scenario B: SKIP_PLAN_GATE=1 → no effect on behavior
describe("Scenario B: SKIP_PLAN_GATE=1 → env var is inert", () => {
  it("env-bypass check always passes even with SKIP_PLAN_GATE=1", () => {
    cmdInit(tmp);
    process.env["SKIP_PLAN_GATE"] = "1";
    const result = verifyAll(tmp);
    const envCheck = result.checks.find((c) => c.name === "env-bypass");
    expect(envCheck).toBeDefined();
    expect(envCheck!.ok).toBe(true); // always inert
    // plan-select still fails (env var didn't bypass)
    const planCheck = result.checks.find((c) => c.name === "plan-select");
    expect(planCheck!.ok).toBe(false);
  });
});

// Scenario C: --human write render receipt (render receipts present)
describe("Scenario C: render receipt written → render-receipts check passes", () => {
  it("render-receipts check passes after writing a render receipt", () => {
    cmdInit(tmp);
    writePlanSelected(tmp);
    const treeSha = execSync("git rev-parse HEAD^{tree}", {
      cwd: tmp,
      encoding: "utf-8",
    }).trim();
    writeRenderReceipt(tmp, "metaflow.status", treeSha, "# status output", {
      ok: true,
    });
    const result = verifyAll(tmp);
    const renderCheck = result.checks.find((c) => c.name === "render-receipts");
    expect(renderCheck).toBeDefined();
    expect(renderCheck!.ok).toBe(true);
  });
});

// Scenario D: treeSha mismatch → treeSha check fails
describe("Scenario D: treeSha mismatch → TREE_SHA_MISMATCH in treeSha check", () => {
  it("treeSha check fails when git tree changes after init", () => {
    cmdInit(tmp); // records treeSha at init time
    // Mutate the git tree
    writeFileSync(join(tmp, "NEWFILE"), "added after init");
    execSync("git add NEWFILE", { cwd: tmp });
    execSync("git commit -q -m 'add after init'", { cwd: tmp });
    const result = verifyAll(tmp);
    const treeCheck = result.checks.find((c) => c.name === "treeSha");
    expect(treeCheck).toBeDefined();
    expect(treeCheck!.ok).toBe(false);
    expect(treeCheck!.detail).toContain("mismatch");
  });
});

// Scenario E: no authority.json → UNGOVERNED_REPO (authority check fails)
describe("Scenario E: no authority.json → UNGOVERNED_REPO in authority check", () => {
  it("authority check fails with detail UNGOVERNED_REPO when authority absent", () => {
    const result = verifyAll(tmp);
    const authCheck = result.checks.find((c) => c.name === "authority");
    expect(authCheck).toBeDefined();
    expect(authCheck!.ok).toBe(false);
    expect(authCheck!.detail).toContain("UNGOVERNED_REPO");
    expect(result.ok).toBe(false);
  });

  it("verifyAll returns ok:false when ungoverned", () => {
    const result = verifyAll(tmp);
    expect(result.ok).toBe(false);
  });
});
