import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import type { RepoRoadmap } from "./roadmapReader.js";

const HOST = resolve(__dirname, "../../..");
beforeAll(() => { process.env.ROADMAP_HOST_REPO = HOST; });

const { scanRoadmaps } = await import("./roadmapReader.server.js");

// Self-test corpus: the roadmap-engine repo itself as the host. Each
// invocation shells out to `roadmap orient` — allow ample time.
const TIMEOUT_MS = 30_000;

describe("roadmapReader.server — scanRoadmaps() against host repo", () => {
  it(
    "returns an array of RepoRoadmap objects",
    async () => {
      const results = await scanRoadmaps();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      for (const entry of results) {
        expect(typeof entry).toBe("object");
        expect(entry).not.toBeNull();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "every entry has a non-empty repo and path",
    async () => {
      const results = await scanRoadmaps();
      for (const entry of results) {
        expect(typeof entry.repo).toBe("string");
        expect(entry.repo.length).toBeGreaterThan(0);
        expect(typeof entry.path).toBe("string");
        expect(entry.path.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT_MS,
  );

  it(
    "active entries have completionPct between 0 and 100",
    async () => {
      const results = await scanRoadmaps();
      const activeEntries = results.filter((entry) => entry.status === "active");
      for (const entry of activeEntries) {
        expect(typeof entry.completionPct).toBe("number");
        expect(entry.completionPct).toBeGreaterThanOrEqual(0);
        expect(entry.completionPct).toBeLessThanOrEqual(100);
      }
    },
    TIMEOUT_MS,
  );

  it(
    "active entries have currentBatch as an array",
    async () => {
      const results = await scanRoadmaps();
      const activeEntries = results.filter((entry) => entry.status === "active");
      for (const entry of activeEntries) {
        expect(Array.isArray(entry.currentBatch)).toBe(true);
      }
    },
    TIMEOUT_MS,
  );

  it(
    "non-active entries have status 'no-dag' or 'error'",
    async () => {
      const results = await scanRoadmaps();
      const nonActiveEntries = results.filter(
        (entry: RepoRoadmap) => entry.status !== "active",
      );
      for (const entry of nonActiveEntries) {
        expect(["no-dag", "error"]).toContain(entry.status);
      }
    },
    TIMEOUT_MS,
  );
});
