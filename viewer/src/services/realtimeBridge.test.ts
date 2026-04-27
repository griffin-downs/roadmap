// Tests for realtimeBridge — verifies HOST_REPO env-driven watcher emits the
// typed discriminated-union event stream specified by viewer-rewrite-realtime-bridge.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBridge, subscribe, snapshot, shutdown, type RealtimeEvent } from "./realtimeBridge.ts";

function waitFor<T>(predicate: () => T | null, timeoutMs = 2500): Promise<T> {
  return new Promise((resolveP, reject) => {
    const start = Date.now();
    const tick = (): void => {
      const result = predicate();
      if (result !== null) { resolveP(result); return; }
      if (Date.now() - start > timeoutMs) { reject(new Error("timeout")); return; }
      setTimeout(tick, 50);
    };
    tick();
  });
}

let host: string;
let originalEnv: string | undefined;

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), "rmap-bridge-"));
  mkdirSync(join(host, ".roadmap"), { recursive: true });
  writeFileSync(join(host, ".roadmap", "head.json"), "{}");
  writeFileSync(join(host, ".roadmap", "trail.jsonl"), "");
  writeFileSync(join(host, ".roadmap", "completed.json"), "[]");
  originalEnv = process.env.ROADMAP_HOST_REPO;
  process.env.ROADMAP_HOST_REPO = host;
});

afterEach(() => {
  shutdown();
  if (originalEnv === undefined) delete process.env.ROADMAP_HOST_REPO;
  else process.env.ROADMAP_HOST_REPO = originalEnv;
  rmSync(host, { recursive: true, force: true });
});

describe("realtimeBridge", () => {
  it("fails hard when ROADMAP_HOST_REPO is unset", () => {
    delete process.env.ROADMAP_HOST_REPO;
    expect(() => startBridge()).toThrow(/ROADMAP_HOST_REPO/);
  });

  it("emits head-changed when head.json mutates", async () => {
    startBridge();
    const events: RealtimeEvent[] = [];
    subscribe((e) => events.push(e));
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(host, ".roadmap", "head.json"), JSON.stringify({ id: "x" }));
    const found = await waitFor(() => events.find((e) => e.kind === "head-changed") ?? null);
    expect(found.lane).toBe("host");
    expect(found.kind).toBe("head-changed");
  });

  it("emits trail-appended when trail.jsonl grows", async () => {
    startBridge();
    const events: RealtimeEvent[] = [];
    subscribe((e) => events.push(e));
    await new Promise((r) => setTimeout(r, 50));
    appendFileSync(join(host, ".roadmap", "trail.jsonl"), '{"x":1}\n');
    const found = await waitFor(() => events.find((e) => e.kind === "trail-appended") ?? null);
    expect(found.kind).toBe("trail-appended");
  });

  it("emits node-advanced when completed.json mutates", async () => {
    startBridge();
    const events: RealtimeEvent[] = [];
    subscribe((e) => events.push(e));
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(host, ".roadmap", "completed.json"), JSON.stringify([{ nodeId: "n" }]));
    const found = await waitFor(() => events.find((e) => e.kind === "node-advanced") ?? null);
    expect(found.kind).toBe("node-advanced");
  });

  it("snapshot reports lanes and subscriber count", () => {
    startBridge();
    const unsub = subscribe(() => { /* noop */ });
    const snap = snapshot();
    expect(snap.lanes.length).toBeGreaterThanOrEqual(1);
    expect(snap.lanes[0]?.id).toBe("host");
    expect(snap.subscribers).toBe(1);
    expect(snap.watchedSlots).toBeGreaterThan(0);
    unsub();
  });

  it("startBridge is idempotent", () => {
    startBridge();
    const before = snapshot().watchedSlots;
    startBridge();
    const after = snapshot().watchedSlots;
    expect(after).toBe(before);
  });
});
