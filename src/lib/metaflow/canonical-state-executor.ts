// @module metaflow/canonical-state-executor
// @exports executeCanonicalStateFlow
// @entry roadmap/metaflow

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface TrailEntry {
  ts: string;
  cmd: string;
  position: string[];
  level: number;
  note?: string;
  repo?: string;
  dagId?: string;
  detail?: Record<string, unknown>;
}

interface WorktreeMutation {
  path: string;
  branches: { branch: string; timestamp: string }[];
}

interface ConflictResolution {
  path: string;
  winner: string;
  timestamp: string;
  rationale: string;
}

interface StateSnapshot {
  timestamp: string;
  completedNodes: string[];
  artifacts: { [path: string]: string };
}

const CANONICAL_DIR = ".roadmap/metaflow/canonical";

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function loadTrail(root: string): TrailEntry[] {
  const trailPath = join(root, ".roadmap", "trail.jsonl");
  if (!existsSync(trailPath)) return [];

  const content = readFileSync(trailPath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TrailEntry);
}

function validateTrailEntries(entries: TrailEntry[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let lastTimestamp = "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check required fields
    if (!entry.ts || !entry.cmd) {
      errors.push(
        `Entry ${i}: missing ts or cmd`
      );
      continue;
    }

    // Check temporal ordering
    if (entry.ts < lastTimestamp) {
      errors.push(
        `Entry ${i}: ts ${entry.ts} < previous ${lastTimestamp}`
      );
    }
    lastTimestamp = entry.ts;

    // Check position is array
    if (!Array.isArray(entry.position)) {
      errors.push(`Entry ${i}: position is not an array`);
    }

    // Check level is number
    if (typeof entry.level !== "number") {
      errors.push(`Entry ${i}: level is not a number`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function detectWorktreeMutations(
  entries: TrailEntry[]
): Map<string, WorktreeMutation> {
  const mutations = new Map<string, WorktreeMutation>();

  // In a real implementation, this would scan git log
  // For now, derive from trail entries (simplified)
  for (const entry of entries) {
    // This is a placeholder - real implementation queries git log
    // to find file changes per branch
  }

  return mutations;
}

function resolveConflicts(mutations: Map<string, WorktreeMutation>): ConflictResolution[] {
  const resolutions: ConflictResolution[] = [];

  for (const [path, mutation] of mutations.entries()) {
    if (mutation.branches.length > 1) {
      // Last-write-wins: pick branch with latest timestamp
      const sorted = [...mutation.branches].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      );
      const winner = sorted[0];

      resolutions.push({
        path,
        winner: winner.branch,
        timestamp: winner.timestamp,
        rationale: `last-write-wins: ${winner.branch} at ${winner.timestamp}`,
      });
    }
  }

  return resolutions;
}

function reconstructStateTimeline(
  entries: TrailEntry[],
  resolutions: ConflictResolution[]
): StateSnapshot[] {
  const timeline: StateSnapshot[] = [];
  const completedNodes = new Set<string>();
  const artifacts = new Map<string, string>();

  for (const entry of entries) {
    // Mark nodes at this level as completed
    const snap: StateSnapshot = {
      timestamp: entry.ts,
      completedNodes: Array.from(completedNodes),
      artifacts: Object.fromEntries(artifacts),
    };
    timeline.push(snap);
  }

  return timeline;
}

function validateStateCoherence(
  timeline: StateSnapshot[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const curr = timeline[i];

    // Check backward invariant: completed nodes don't regress
    for (const node of prev.completedNodes) {
      if (!curr.completedNodes.includes(node)) {
        violations.push(
          `Node ${node} regressed: completed at ${prev.timestamp}, incomplete at ${curr.timestamp}`
        );
      }
    }

    // Check temporal ordering
    if (curr.timestamp < prev.timestamp) {
      violations.push(
        `Temporal violation: ts ${curr.timestamp} < ${prev.timestamp}`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

function extractCompletedNodes(timeline: StateSnapshot[]) {
  if (timeline.length === 0) return [];

  const finalState = timeline[timeline.length - 1];
  return finalState.completedNodes.map((id) => ({
    id,
    completedAt: finalState.timestamp,
    produces: [], // Would be filled from node specs in real implementation
  }));
}

function produceCanonicalState(
  root: string,
  timeline: StateSnapshot[],
  coherence: { valid: boolean; violations: string[] },
  completed: unknown[]
): void {
  const manifest = {
    timestamp: new Date().toISOString(),
    trailChecksum: "sha256:...", // Would be computed in real implementation
    completedNodes: completed,
    conflictsResolved: 0,
    stateCoherent: coherence.valid,
    stateTimelinePath: join(CANONICAL_DIR, "state-timeline.json"),
    coherenceReportPath: join(CANONICAL_DIR, "coherence-validation.json"),
    validationErrors: coherence.violations,
  };

  ensureDir(join(root, CANONICAL_DIR));
  writeFileSync(
    join(root, CANONICAL_DIR, "canonical-state.json"),
    JSON.stringify(manifest, null, 2)
  );
}

export async function executeCanonicalStateFlow(root: string): Promise<{
  success: boolean;
  artifacts: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const artifacts: string[] = [];

  try {
    // Step 1: Load trail
    console.log("Step 1: load-trail");
    const trailRaw = loadTrail(root);
    ensureDir(join(root, CANONICAL_DIR));
    writeFileSync(
      join(root, CANONICAL_DIR, "trail-raw.json"),
      JSON.stringify(trailRaw, null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "trail-raw.json"));

    // Step 2: Validate trail entries
    console.log("Step 2: validate-trail-entries");
    const validation = validateTrailEntries(trailRaw);
    if (!validation.valid) {
      errors.push(...validation.errors);
    }
    writeFileSync(
      join(root, CANONICAL_DIR, "trail-validated.json"),
      JSON.stringify(
        { valid: validation.valid, entryCount: trailRaw.length, errors: validation.errors },
        null,
        2
      )
    );
    artifacts.push(join(CANONICAL_DIR, "trail-validated.json"));

    // Step 3: Detect worktree mutations
    console.log("Step 3: detect-worktree-mutations");
    const mutations = detectWorktreeMutations(trailRaw);
    writeFileSync(
      join(root, CANONICAL_DIR, "worktree-mutations.json"),
      JSON.stringify(Array.from(mutations.entries()), null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "worktree-mutations.json"));

    // Step 4: Resolve conflicts
    console.log("Step 4: resolve-conflicts");
    const resolutions = resolveConflicts(mutations);
    writeFileSync(
      join(root, CANONICAL_DIR, "conflict-resolution.json"),
      JSON.stringify(resolutions, null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "conflict-resolution.json"));

    // Step 5: Reconstruct state timeline
    console.log("Step 5: reconstruct-state-timeline");
    const timeline = reconstructStateTimeline(trailRaw, resolutions);
    writeFileSync(
      join(root, CANONICAL_DIR, "state-timeline.json"),
      JSON.stringify(timeline, null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "state-timeline.json"));

    // Step 6: Validate state coherence
    console.log("Step 6: validate-state-coherence");
    const coherence = validateStateCoherence(timeline);
    writeFileSync(
      join(root, CANONICAL_DIR, "coherence-validation.json"),
      JSON.stringify(coherence, null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "coherence-validation.json"));

    // Step 7: Extract completed nodes
    console.log("Step 7: extract-completed-nodes");
    const completed = extractCompletedNodes(timeline);
    writeFileSync(
      join(root, CANONICAL_DIR, "node-completion-manifest.json"),
      JSON.stringify(completed, null, 2)
    );
    artifacts.push(join(CANONICAL_DIR, "node-completion-manifest.json"));

    // Step 8: Produce canonical state
    console.log("Step 8: produce-canonical-state");
    produceCanonicalState(root, timeline, coherence, completed);
    artifacts.push(join(CANONICAL_DIR, "canonical-state.json"));

    console.log(`✅ Canonical state flow complete: ${artifacts.length} artifacts produced`);

    return {
      success: errors.length === 0,
      artifacts,
      errors,
    };
  } catch (err) {
    errors.push(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      artifacts,
      errors,
    };
  }
}
