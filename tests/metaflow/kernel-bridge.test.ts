import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import {
  requirePlanSelectReceipt,
  enforceKernelInvariants,
  KernelBridgeError,
} from "../../src/lib/metaflow/kernel-bridge.ts";

let tmp: string;

function initGit(root: string): void {
  execSync("git init -q", { cwd: root });
  execSync("git config user.email test@test.com", { cwd: root });
  execSync("git config user.name Test", { cwd: root });
  writeFileSync(join(root, ".keep"), "");
  execSync("git add .keep", { cwd: root });
  execSync("git commit -q -m init", { cwd: root });
}

function writePlanSelected(
  root: string,
  candidateId = "fr-metaflow-001",
): void {
  const receiptsDir = join(root, ".roadmap", "receipts");
  mkdirSync(receiptsDir, { recursive: true });
  const receiptFile = `plan-select-${candidateId}.json`;
  writeFileSync(
    join(receiptsDir, receiptFile),
    JSON.stringify({
      schema_version: 1,
      candidateId,
      selectedAt: new Date().toISOString(),
      note: "test selection",
    }),
  );
  writeFileSync(
    join(receiptsDir, "PLAN_SELECTED.json"),
    JSON.stringify({ receipt: receiptFile, headSha: "abc", candidateId }),
  );
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kernel-bridge-test-"));
  initGit(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("requirePlanSelectReceipt", () => {
  it("throws PLAN_SELECT_MISSING when no PLAN_SELECTED.json", () => {
    mkdirSync(join(tmp, ".roadmap", "receipts"), { recursive: true });
    expect(() => requirePlanSelectReceipt(tmp)).toThrow(KernelBridgeError);
    try {
      requirePlanSelectReceipt(tmp);
    } catch (err) {
      expect(err).toBeInstanceOf(KernelBridgeError);
      expect((err as KernelBridgeError).code).toBe("PLAN_SELECT_MISSING");
    }
  });

  it("passes when PLAN_SELECTED.json is present and valid", () => {
    writePlanSelected(tmp);
    // Should not throw
    expect(() => requirePlanSelectReceipt(tmp)).not.toThrow();
  });
});

describe("enforceKernelInvariants", () => {
  it("throws when plan-select receipt is missing", () => {
    mkdirSync(join(tmp, ".roadmap", "receipts"), { recursive: true });
    expect(() => enforceKernelInvariants(tmp)).toThrow(KernelBridgeError);
  });

  it("passes when plan-select receipt present and no spec-origin", () => {
    writePlanSelected(tmp);
    // spec-origin.json absent → soft pass
    expect(() => enforceKernelInvariants(tmp)).not.toThrow();
  });
});
