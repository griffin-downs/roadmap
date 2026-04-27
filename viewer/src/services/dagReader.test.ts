import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";

// Self-test corpus: this repo's own .roadmap/. Set BEFORE importing the
// server module so the env is captured at first call (host resolution is
// per-call, but explicit-up-front keeps intent obvious).
const HOST = resolve(__dirname, "../../..");
beforeAll(() => { process.env.ROADMAP_HOST_REPO = HOST; });

const { readDagPayload } = await import("./dagReader.server.js");

const TIMEOUT_MS = 15_000;

describe("dagReader.server — readDagPayload() against host repo", () => {
  it(
    "returns a head + completed payload from cwd .roadmap/head.json",
    async () => {
      const payload = await readDagPayload();
      expect(payload).toBeTruthy();
      expect(typeof payload.head).toBe("object");
      expect(typeof payload.head.id).toBe("string");
      expect(payload.head.id.length).toBeGreaterThan(0);
      expect(typeof payload.head.nodes).toBe("object");
      expect(payload.head.nodes).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "head.id matches dagId",
    async () => {
      const payload = await readDagPayload();
      expect(payload.dagId).toBe(payload.head.id);
    },
    TIMEOUT_MS,
  );

  it(
    "completed is an array of node ids whose entries reference the same dagId",
    async () => {
      const payload = await readDagPayload();
      expect(Array.isArray(payload.completed)).toBe(true);
      for (const id of payload.completed) {
        const entry = payload.completedEntries[id];
        expect(entry).toBeTruthy();
        expect(entry.dagId).toBe(payload.head.id);
      }
    },
    TIMEOUT_MS,
  );

  it(
    "every node carries id, desc, deps[]",
    async () => {
      const payload = await readDagPayload();
      for (const node of Object.values(payload.head.nodes)) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.desc).toBe("string");
        expect(Array.isArray(node.deps)).toBe(true);
      }
    },
    TIMEOUT_MS,
  );
});
