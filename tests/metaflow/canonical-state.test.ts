import { describe, it, expect, beforeEach } from "vitest";
import {
  CanonicalStateProvider,
  initializeCanonicalState,
  getCanonicalState,
} from "../../src/lib/metaflow/canonical-state-provider";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CanonicalStateProvider", () => {
  let testRoot: string;
  let provider: CanonicalStateProvider;

  beforeEach(() => {
    // Create temp directory for test
    testRoot = join(tmpdir(), `roadmap-test-${Date.now()}`);
    mkdirSync(join(testRoot, ".roadmap/metaflow/canonical"), {
      recursive: true,
    });

    // Create a sample canonical state manifest
    const manifest = {
      timestamp: "2026-03-03T10:00:00Z",
      trailChecksum: "sha256:abc123",
      completedNodes: [
        {
          id: "node-a",
          completedAt: "2026-03-03T09:00:00Z",
          produces: ["artifact-a.json", "artifact-b.json"],
        },
        {
          id: "node-b",
          completedAt: "2026-03-03T09:30:00Z",
          produces: ["artifact-c.json"],
        },
      ],
      conflictsResolved: 0,
      stateCoherent: true,
      stateTimelinePath: ".roadmap/metaflow/canonical/state-timeline.json",
      coherenceReportPath: ".roadmap/metaflow/canonical/coherence-validation.json",
      validationErrors: [],
    };

    writeFileSync(
      join(testRoot, ".roadmap/metaflow/canonical/canonical-state.json"),
      JSON.stringify(manifest, null, 2)
    );

    provider = new CanonicalStateProvider(testRoot);
  });

  describe("Node completion queries", () => {
    it("should report node as complete when it exists in manifest", () => {
      expect(provider.isNodeComplete("node-a")).toBe(true);
      expect(provider.isNodeComplete("node-b")).toBe(true);
    });

    it("should report node as incomplete when it does not exist in manifest", () => {
      expect(provider.isNodeComplete("node-z")).toBe(false);
    });

    it("should return completion timestamp for completed node", () => {
      const ts = provider.getCompletionTimestamp("node-a");
      expect(ts).not.toBeNull();
      expect(ts!.getTime()).toBeGreaterThan(0);
    });

    it("should return null for incomplete node", () => {
      expect(provider.getCompletionTimestamp("node-z")).toBeNull();
    });
  });

  describe("Artifact queries", () => {
    it("should retrieve produces for a node", () => {
      const produces = provider.getNodeProduces("node-a");
      expect(produces).toEqual(["artifact-a.json", "artifact-b.json"]);
    });

    it("should return empty array for unknown node", () => {
      expect(provider.getNodeProduces("node-z")).toEqual([]);
    });

    it("should report artifact exists", () => {
      expect(provider.artifactExists("artifact-a.json")).toBe(true);
      expect(provider.artifactExists("artifact-c.json")).toBe(true);
    });

    it("should report artifact does not exist", () => {
      expect(provider.artifactExists("artifact-unknown.json")).toBe(false);
    });
  });

  describe("State validation", () => {
    it("should report state as coherent when manifest says so", () => {
      expect(provider.isStateCoherent()).toBe(true);
    });

    it("should report no validation errors when manifest is clean", () => {
      expect(provider.getValidationErrors()).toEqual([]);
    });

    it("should report valid state when coherent and no errors", () => {
      expect(provider.hasValidState()).toBe(true);
    });
  });

  describe("Statistics", () => {
    it("should count completed nodes", () => {
      expect(provider.getCompletedCount()).toBe(2);
    });

    it("should report conflict count", () => {
      expect(provider.getConflictsResolved()).toBe(0);
    });

    it("should list all completed nodes", () => {
      const completed = provider.getCompletedNodes();
      expect(completed).toHaveLength(2);
      expect(completed[0].id).toBe("node-a");
    });
  });

  describe("Missing manifest", () => {
    it("should handle missing manifest gracefully", () => {
      const emptyProvider = new CanonicalStateProvider(tmpdir());
      expect(emptyProvider.isNodeComplete("any")).toBe(false);
      expect(emptyProvider.getCompletedCount()).toBe(0);
      expect(emptyProvider.hasValidState()).toBe(false);
    });
  });

  describe("Global provider singleton", () => {
    it("should initialize and retrieve global provider", () => {
      const initialized = initializeCanonicalState(testRoot);
      const retrieved = getCanonicalState();
      expect(retrieved).toBe(initialized);
    });

    it("should allow global provider to answer queries", () => {
      initializeCanonicalState(testRoot);
      const global = getCanonicalState();
      expect(global!.isNodeComplete("node-a")).toBe(true);
    });
  });

  describe("State refresh", () => {
    it("should reload manifest from disk when refresh called", () => {
      // Modify manifest on disk
      const updatedManifest = {
        timestamp: "2026-03-03T11:00:00Z",
        trailChecksum: "sha256:xyz789",
        completedNodes: [
          {
            id: "node-a",
            completedAt: "2026-03-03T09:00:00Z",
            produces: ["artifact-a.json"],
          },
          {
            id: "node-b",
            completedAt: "2026-03-03T09:30:00Z",
            produces: ["artifact-c.json"],
          },
          {
            id: "node-c",
            completedAt: "2026-03-03T10:00:00Z",
            produces: ["artifact-d.json"],
          },
        ],
        conflictsResolved: 1,
        stateCoherent: true,
        stateTimelinePath: ".roadmap/metaflow/canonical/state-timeline.json",
        coherenceReportPath:
          ".roadmap/metaflow/canonical/coherence-validation.json",
        validationErrors: [],
      };

      writeFileSync(
        join(testRoot, ".roadmap/metaflow/canonical/canonical-state.json"),
        JSON.stringify(updatedManifest, null, 2)
      );

      provider.refresh();

      expect(provider.getCompletedCount()).toBe(3);
      expect(provider.isNodeComplete("node-c")).toBe(true);
      expect(provider.getConflictsResolved()).toBe(1);
    });
  });
});
