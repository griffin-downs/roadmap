import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  writeRenderReceipt,
  readRenderReceipt,
  lastRenderReceipt,
  requireRenderReceipt,
  RenderReceiptError,
} from "../../src/lib/metaflow/execution/render-receipt.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(tmpdir() + "/render-receipt-test-");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("writeRenderReceipt + readRenderReceipt", () => {
  it("write then read back returns matching receipt", () => {
    const envelope = { cmd: "orient", data: { position: ["node-a"] } };
    const written = writeRenderReceipt(
      tmp,
      "orient",
      "abc123",
      "# orient output",
      envelope,
    );
    expect(written.schemaVersion).toBe(1);
    expect(written.cmd).toBe("orient");
    expect(written.treeSha).toBe("abc123");
    expect(written.plain).toBe("# orient output");

    const read = readRenderReceipt(tmp, "orient", "abc123");
    expect(read.cmd).toBe("orient");
    expect(read.treeSha).toBe("abc123");
    expect(read.plain).toBe("# orient output");
    expect(read.envelope).toEqual(envelope);
  });

  it("throws RECEIPT_MISSING when json file does not exist", () => {
    expect(() => readRenderReceipt(tmp, "orient", "deadbeef")).toThrow(
      RenderReceiptError,
    );
    try {
      readRenderReceipt(tmp, "orient", "deadbeef");
    } catch (err) {
      expect(err).toBeInstanceOf(RenderReceiptError);
      expect((err as RenderReceiptError).code).toBe("RECEIPT_MISSING");
    }
  });
});

describe("re-render idempotency", () => {
  it("writing same cmd+treeSha twice produces same content on second read", () => {
    const envelope = { v: 1 };
    writeRenderReceipt(tmp, "chart", "sha1", "chart v1", envelope);
    writeRenderReceipt(tmp, "chart", "sha1", "chart v1", envelope);
    const r = readRenderReceipt(tmp, "chart", "sha1");
    expect(r.plain).toBe("chart v1");
  });

  it("writing different treeSha produces separate receipts", () => {
    writeRenderReceipt(tmp, "orient", "sha-old", "old output", {});
    writeRenderReceipt(tmp, "orient", "sha-new", "new output", {});
    const old = readRenderReceipt(tmp, "orient", "sha-old");
    const fresh = readRenderReceipt(tmp, "orient", "sha-new");
    expect(old.plain).toBe("old output");
    expect(fresh.plain).toBe("new output");
  });
});

describe("requireRenderReceipt", () => {
  it("returns receipt when present", () => {
    writeRenderReceipt(tmp, "run", "treehash", "run output", { ok: true });
    const r = requireRenderReceipt(tmp, "run", "treehash");
    expect(r.cmd).toBe("run");
  });

  it("throws when receipt missing (enforces interactive command gate)", () => {
    expect(() => requireRenderReceipt(tmp, "run", "missing-sha")).toThrow(
      RenderReceiptError,
    );
    try {
      requireRenderReceipt(tmp, "run", "missing-sha");
    } catch (err) {
      expect(err).toBeInstanceOf(RenderReceiptError);
      expect((err as RenderReceiptError).code).toBe("RECEIPT_MISSING");
    }
  });
});

describe("lastRenderReceipt", () => {
  it("returns the most recently written receipt", async () => {
    writeRenderReceipt(tmp, "orient", "sha-a", "first", {});
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    writeRenderReceipt(tmp, "orient", "sha-b", "second", {});
    const last = lastRenderReceipt(tmp);
    expect(last.treeSha).toBe("sha-b");
    expect(last.plain).toBe("second");
  });

  it("throws RENDER_DIR_EMPTY when no receipts exist", () => {
    expect(() => lastRenderReceipt(tmp)).toThrow(RenderReceiptError);
    try {
      lastRenderReceipt(tmp);
    } catch (err) {
      expect(err).toBeInstanceOf(RenderReceiptError);
      expect((err as RenderReceiptError).code).toBe("RENDER_DIR_EMPTY");
    }
  });
});
