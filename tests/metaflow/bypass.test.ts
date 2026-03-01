import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkEnvBypass,
  writeBypassReceipt,
  BYPASS_ENV_VARS,
} from "../../src/lib/metaflow/execution/guards.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "bypass-test-"));
  // Clean any stray SKIP_* vars that might bleed in from the test environment
  for (const varName of BYPASS_ENV_VARS) {
    delete process.env[varName];
  }
});

afterEach(() => {
  for (const varName of BYPASS_ENV_VARS) {
    delete process.env[varName];
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("checkEnvBypass", () => {
  it("returns empty array when no SKIP_* vars are set", () => {
    const detected = checkEnvBypass();
    expect(detected).toEqual([]);
  });

  it("detects SKIP_PLAN_GATE but does not throw or alter behavior", () => {
    process.env["SKIP_PLAN_GATE"] = "1";
    // Must not throw — detection only
    const detected = checkEnvBypass();
    expect(detected).toContain("SKIP_PLAN_GATE");
  });

  it("detects multiple SKIP_* vars simultaneously", () => {
    process.env["SKIP_VALIDATE"] = "true";
    process.env["SKIP_AUTHORITY"] = "1";
    const detected = checkEnvBypass();
    expect(detected).toContain("SKIP_VALIDATE");
    expect(detected).toContain("SKIP_AUTHORITY");
  });

  it("SKIP_PLAN_GATE=1 — metaflow cmdRun behavior unchanged (no bypass granted)", async () => {
    // Import cmdRun here to verify it still throws UNGOVERNED_REPO regardless of env
    const { cmdRun } =
      await import("../../src/lib/metaflow/cli-sovereignty.ts");
    const { SovereigntyError } =
      await import("../../src/lib/metaflow/cli-sovereignty.ts");
    process.env["SKIP_PLAN_GATE"] = "1";
    expect(() => cmdRun(tmp, "any-flow")).toThrow(SovereigntyError);
    try {
      cmdRun(tmp, "any-flow");
    } catch (err) {
      expect((err as SovereigntyError).code).toBe("UNGOVERNED_REPO");
    }
  });
});

describe("writeBypassReceipt", () => {
  it("writes a receipt with passed:false and reason", () => {
    const receipt = writeBypassReceipt(tmp, "test bypass reason");
    expect(receipt.passed).toBe(false);
    expect(receipt.reason).toBe("test bypass reason");
    expect(receipt.schemaVersion).toBe(1);
    expect(typeof receipt.ts).toBe("string");
  });

  it("writes file under .roadmap/receipts/bypass-*.json", () => {
    writeBypassReceipt(tmp, "audit record");
    const receiptsDir = join(tmp, ".roadmap", "receipts");
    const files = readdirSync(receiptsDir).filter((f) =>
      f.startsWith("bypass-"),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^bypass-.+\.json$/);
  });

  it("includes detectedVars in receipt when SKIP_* vars are set", () => {
    process.env["SKIP_PLAN_GATE"] = "1";
    const receipt = writeBypassReceipt(tmp, "explicit bypass");
    expect(receipt.detectedVars).toContain("SKIP_PLAN_GATE");
  });

  it("detectedVars empty when no SKIP_* vars set", () => {
    const receipt = writeBypassReceipt(tmp, "no env vars");
    expect(receipt.detectedVars).toEqual([]);
  });
});
