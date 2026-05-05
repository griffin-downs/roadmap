// Roadmap reader (server) — runs `roadmap orient` at the host repo and
// projects each fleet.json entry into a RepoRoadmap row. Ported from
// fleet/dashboard at r1.5. Per §Fail-hard: host repo via ROADMAP_HOST_REPO
// (default = process.cwd()); single-repo mode is fine when no fleet.json.

import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { join, dirname, basename } from "node:path";
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
  // Fleet-shape output (host has fleet.json)
  iteration?: number;
  repos?: OrientRepoEntry[];
  // Single-repo-shape output (host has no fleet.json) — orient returns
  // position / level / done / remaining at the top level. The DAG itself
  // (id, nodes) isn't on the orient envelope; we read head.json directly
  // for that since it's a tiny tracked file.
  position?: string[];
  level?: number;
  done?: number;
  remaining?: number;
}

interface HeadJson {
  id?: string;
  nodes?: Record<string, unknown>;
}

function readHeadJson(repoPath: string): HeadJson | null {
  try {
    return JSON.parse(readFileSync(join(repoPath, ".roadmap/head.json"), "utf-8")) as HeadJson;
  } catch {
    return null;
  }
}

interface OrientResult {
  ok: boolean;
  data?: OrientData;
  error?: { message: string };
}

// Filesystem-walk discovery — when no fleet.json exists, find all
// `.roadmap/head.json` files under ROADMAP_FS_SCAN_ROOT (default: parent
// of host repo, usually ~/src). Capped at depth 4 with a skip-list of
// noisy directories so the walk stays sub-second on real machines.
const SCAN_DEPTH_CAP = 4;
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", ".cache", "target", "build",
  ".pnpm-store", ".venv", "venv", "__pycache__", ".turbo", ".nuxt",
]);

interface DiscoveredRoadmap {
  path: string;
  name: string;
  mtime: number;
  head: HeadJson | null;
  doneCount: number;
}

function readCompletedCount(repoPath: string): number {
  try {
    const raw = readFileSync(join(repoPath, ".roadmap/completed.json"), "utf-8");
    const parsed = JSON.parse(raw) as { receipts?: unknown[] } | unknown[];
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed.receipts)) return parsed.receipts.length;
    return 0;
  } catch {
    return 0;
  }
}

function walkRoadmaps(root: string, depth: number, found: DiscoveredRoadmap[]): void {
  if (depth > SCAN_DEPTH_CAP) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }

  // Check if THIS dir contains .roadmap/head.json — record and stop descending
  // into it (a repo's interior won't contain another repo we care about).
  const headPath = join(root, ".roadmap/head.json");
  if (existsSync(headPath)) {
    try {
      const mtime = statSync(headPath).mtimeMs;
      const head = readHeadJson(root);
      found.push({
        path: root,
        name: basename(root),
        mtime,
        head,
        doneCount: readCompletedCount(root),
      });
      return;
    } catch {
      // fall through to walking children
    }
  }

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".roadmap") {
      // skip dotdirs except .roadmap itself (handled above)
      if (SKIP_DIRS.has(entry) || entry === ".git") continue;
    }
    if (SKIP_DIRS.has(entry)) continue;
    const child = join(root, entry);
    let isDir = false;
    try {
      isDir = statSync(child).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    walkRoadmaps(child, depth + 1, found);
  }
}

export function discoverRoadmaps(scanRoot: string): DiscoveredRoadmap[] {
  const found: DiscoveredRoadmap[] = [];
  walkRoadmaps(scanRoot, 0, found);
  return found;
}

function projectDiscovered(d: DiscoveredRoadmap): RepoRoadmap {
  const dagId = d.head?.id;
  const totalNodes = d.head?.nodes !== undefined ? Object.keys(d.head.nodes).length : 0;
  if (totalNodes === 0) {
    return { repo: d.name, path: d.path, status: "no-dag", dagId, currentBatch: [] };
  }
  const done = Math.min(d.doneCount, totalNodes);
  const remaining = Math.max(0, totalNodes - done);
  const isActive = remaining > 0;
  return {
    repo: d.name,
    path: d.path,
    status: isActive ? "active" : "no-dag",
    dagId,
    completionPct: computeCompletionPct(done, remaining),
    currentBatch: [],
    remaining: isActive ? remaining : undefined,
  };
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

function sortRoadmapsByActivityAndMtime(
  rows: RepoRoadmap[],
  mtimeByPath: Map<string, number>,
): RepoRoadmap[] {
  return [...rows].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aMtime = mtimeByPath.get(a.path) ?? 0;
    const bMtime = mtimeByPath.get(b.path) ?? 0;
    return bMtime - aMtime;
  });
}

export async function scanRoadmaps(): Promise<RepoRoadmap[]> {
  const host = hostRepoRoot();
  const registry = readFleetRepos(host);

  // No fleet.json → filesystem-walk discovery rooted at ROADMAP_FS_SCAN_ROOT
  // (default: dirname(host)). Host repo always included regardless.
  if (registry.length === 0) {
    const scanRoot = process.env.ROADMAP_FS_SCAN_ROOT ?? dirname(host);
    const discovered = discoverRoadmaps(scanRoot);
    const hostAlreadyFound = discovered.some((d) => d.path === host);
    if (!hostAlreadyFound) {
      const headPath = join(host, ".roadmap/head.json");
      let mtime = 0;
      try { mtime = statSync(headPath).mtimeMs; } catch { /* host may have no head */ }
      discovered.push({
        path: host,
        name: "host",
        mtime,
        head: readHeadJson(host),
        doneCount: readCompletedCount(host),
      });
    } else {
      // Rename host's discovered entry for clarity
      const hostEntry = discovered.find((d) => d.path === host);
      if (hostEntry !== undefined) hostEntry.name = "host";
    }
    const mtimeByPath = new Map(discovered.map((d) => [d.path, d.mtime] as const));
    const rows = discovered.map(projectDiscovered);
    return sortRoadmapsByActivityAndMtime(rows, mtimeByPath);
  }

  const allRegistry: FleetEntry[] = registry;

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

  // Fleet-shape: project each registered fleet entry from oriented[]
  if (oriented.length > 0) {
    return allRegistry.map((entry) => {
      const match = oriented.find((r) => r.path === entry.path)
        ?? oriented.find((r) => r.name === entry.name);
      if (match === undefined) {
        return { repo: entry.name, path: entry.path, status: "no-dag", currentBatch: [] };
      }
      return projectRepo(match);
    });
  }

  // Single-repo shape: orient surfaces position/level/done/remaining at the
  // top level. The DAG itself isn't on the envelope, so we read head.json
  // directly (it's a tiny tracked file at the host root).
  const done = result.data.done ?? 0;
  const remaining = result.data.remaining ?? 0;
  const position = result.data.position ?? [];
  const completionPct = computeCompletionPct(done, remaining);

  return allRegistry.map((entry) => {
    const head = readHeadJson(entry.path);
    const dagId = head?.id;
    const totalNodes = head?.nodes !== undefined ? Object.keys(head.nodes).length : 0;
    if (dagId === undefined && totalNodes === 0) {
      return { repo: entry.name, path: entry.path, status: "no-dag", currentBatch: [] };
    }
    return {
      repo: entry.name,
      path: entry.path,
      status: position.length > 0 ? "active" : "no-dag",
      dagId,
      completionPct,
      currentBatch: position,
      level: result.data.level,
      remaining,
    };
  });
}
