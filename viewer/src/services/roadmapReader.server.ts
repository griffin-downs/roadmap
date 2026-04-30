// Roadmap reader (server) — runs `roadmap orient` at the host repo and
// projects each fleet.json entry into a RepoRoadmap row. Ported from
// fleet/dashboard at r1.5. Per §Fail-hard: host repo via ROADMAP_HOST_REPO
// (default = process.cwd()); single-repo mode is fine when no fleet.json.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import type { RepoRoadmap } from "./roadmapReader.js";

const execFileAsync = promisify(execFile);

function hostRepoRoot(): string {
  return process.env.ROADMAP_HOST_REPO ?? process.cwd();
}

interface FleetEntry { name: string; path: string; }
interface FleetJson { repos: FleetEntry[]; }

interface OrientRepoEntry {
  name: string;
  path: string;
  dagId: string | null;
  status: string;
  done?: number;
  remaining?: number;
  batch?: string[];
  activeDAGs?: Array<{ dagId: string; desc?: string }>;
}

interface OrientData {
  iteration?: number;
  repos?: OrientRepoEntry[];
}

interface OrientResult {
  ok: boolean;
  data?: OrientData;
  error?: { message: string };
}

function readFleetRepos(host: string): FleetEntry[] {
  try {
    const raw = readFileSync(join(host, ".roadmap/fleet.json"), "utf-8");
    const parsed = JSON.parse(raw) as FleetJson;
    return Array.isArray(parsed.repos) ? parsed.repos : [];
  } catch {
    return [];
  }
}

function computeCompletionPct(done: number, remaining: number): number {
  const total = done + remaining;
  if (total === 0) return 100;
  return Math.round((done / total) * 100);
}

function projectRepo(repoEntry: OrientRepoEntry): RepoRoadmap {
  const done = repoEntry.done ?? 0;
  const remaining = repoEntry.remaining ?? 0;
  const batch = repoEntry.batch ?? [];
  const active = repoEntry.activeDAGs ?? [];
  const dagId = repoEntry.dagId
    ?? active.find((a) => a.dagId === repoEntry.name)?.dagId
    ?? active[active.length - 1]?.dagId
    ?? undefined;
  const isActive = repoEntry.status === "active" && remaining > 0;

  if (!isActive) {
    return {
      repo: repoEntry.name,
      path: repoEntry.path,
      status: "no-dag",
      dagId,
      completionPct: 100,
      currentBatch: [],
    };
  }

  return {
    repo: repoEntry.name,
    path: repoEntry.path,
    status: "active",
    dagId,
    completionPct: computeCompletionPct(done, remaining),
    currentBatch: batch,
    remaining,
  };
}

function errorEntry(entry: FleetEntry, message: string): RepoRoadmap {
  return { repo: entry.name, path: entry.path, status: "error", error: message };
}

export async function scanRoadmaps(): Promise<RepoRoadmap[]> {
  const host = hostRepoRoot();
  const registry = readFleetRepos(host);
  const allRegistry: FleetEntry[] = registry.length > 0
    ? registry
    : [{ name: "host", path: host }];

  let result: OrientResult;
  try {
    const { stdout } = await execFileAsync(
      "roadmap",
      ["orient", "--note", "viewer-scan"],
      { cwd: host, timeout: 30_000 },
    );
    result = JSON.parse(stdout) as OrientResult;
  } catch (error) {
    return allRegistry.map((e) => errorEntry(e, `orient failed: ${String(error)}`));
  }

  if (!result.ok || result.data === undefined) {
    const message = result.error?.message ?? "orient returned ok=false";
    return allRegistry.map((e) => errorEntry(e, message));
  }

  const oriented = Array.isArray(result.data.repos) ? result.data.repos : [];

  return allRegistry.map((entry) => {
    const match = oriented.find((r) => r.path === entry.path)
      ?? oriented.find((r) => r.name === entry.name);
    if (match === undefined) {
      return { repo: entry.name, path: entry.path, status: "no-dag", currentBatch: [] };
    }
    return projectRepo(match);
  });
}
