// Roadmap reader (server) — runs `roadmap orient` at the host repo and
// projects each fleet.json entry into a RepoRoadmap row. Ported from
// fleet/dashboard at r1.5. Per §Fail-hard: host repo via ROADMAP_HOST_REPO
// (default = process.cwd()); single-repo mode is fine when no fleet.json.

import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { join, dirname, basename } from "node:path";
import type { RepoRoadmap, LineageEntry } from "./roadmapReader.js";

export const LINEAGE_CAP = 50;

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

// Cruft filter — empty/test-scaffold head.json files (zero nodes or null id)
// and tmp-* directories (e.g. .tmp-e2e-regen-*) flood the picker by 73% on
// real machines. Filter at projection time, not traversal time, so r3's
// existing skip-list (node_modules, .git, etc.) stays separate.
const TMP_DIR_PATTERN = /^\.?tmp-/;

function isEmptyHead(head: HeadJson | null): boolean {
  if (head === null) return true;
  const nodeCount = head.nodes !== undefined ? Object.keys(head.nodes).length : 0;
  if (nodeCount === 0) return true;
  if (head.id === null || head.id === undefined) return true;
  return false;
}

function isTmpDir(repoPath: string): boolean {
  return TMP_DIR_PATTERN.test(basename(repoPath));
}

function shouldIncludeEmpty(url: string | undefined): boolean {
  if (process.env.SHOW_EMPTY === "1") return true;
  if (url === undefined) return false;
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return false;
  const params = new URLSearchParams(url.slice(qIdx + 1));
  return params.get("includeEmpty") === "1";
}

function filterCruft(
  discovered: DiscoveredRoadmap[],
  hostPath: string,
  includeEmpty: boolean,
): DiscoveredRoadmap[] {
  if (includeEmpty) return discovered;
  return discovered.filter((d) => {
    if (d.path === hostPath) return true; // host always shown
    if (isTmpDir(d.path)) return false;
    if (isEmptyHead(d.head)) return false;
    return true;
  });
}

function projectDiscovered(d: DiscoveredRoadmap): RepoRoadmap {
  const dagId = d.head?.id;
  const lineage = walkLineage(d.path);
  const totalNodes = d.head?.nodes !== undefined ? Object.keys(d.head.nodes).length : 0;
  if (totalNodes === 0) {
    return { repo: d.name, path: d.path, status: "no-dag", dagId, currentBatch: [], lineage };
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
    lineage,
  };
}

// Lineage walk — surface archived rounds in .roadmap/heads/ (excluding the
// _archived/ subdir and any non-.json file). Each entry: id + node/done
// counts + mtime + status; sorted mtime DESC and capped at LINEAGE_CAP.
// Done count cross-references completed.json receipts when they reference
// nodes present in the head; otherwise computed from the head's node set.
export function walkLineage(repoPath: string): LineageEntry[] {
  const headsDir = join(repoPath, ".roadmap/heads");
  let entries: string[];
  try {
    entries = readdirSync(headsDir);
  } catch {
    return [];
  }

  const completedIds = readCompletedIds(repoPath);
  const out: LineageEntry[] = [];

  for (const entry of entries) {
    if (entry === "_archived") continue;
    if (!entry.endsWith(".json")) continue;
    const fullPath = join(headsDir, entry);
    let mtime = 0;
    try {
      const st = statSync(fullPath);
      if (!st.isFile()) continue;
      mtime = st.mtimeMs;
    } catch {
      continue;
    }
    let head: HeadJson | null = null;
    try {
      head = JSON.parse(readFileSync(fullPath, "utf-8")) as HeadJson;
    } catch {
      head = null;
    }
    const nodes = head?.nodes ?? {};
    const nodeIds = Object.keys(nodes);
    const nodeCount = nodeIds.length;
    const doneCount = computeLineageDone(nodeIds, completedIds);
    const status: LineageEntry["status"] =
      nodeCount === 0 ? "empty"
        : doneCount >= nodeCount ? "complete"
          : "active";
    out.push({
      id: head?.id ?? null,
      path: fullPath,
      mtime,
      nodeCount,
      doneCount,
      status,
    });
  }

  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, LINEAGE_CAP);
}

function readCompletedIds(repoPath: string): Set<string> {
  try {
    const raw = readFileSync(join(repoPath, ".roadmap/completed.json"), "utf-8");
    const parsed = JSON.parse(raw) as { receipts?: Array<{ nodeId?: string; id?: string }> } | Array<{ nodeId?: string; id?: string }>;
    const receipts = Array.isArray(parsed) ? parsed : (parsed.receipts ?? []);
    const ids = new Set<string>();
    for (const r of receipts) {
      const id = r.nodeId ?? r.id;
      if (typeof id === "string") ids.add(id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

function computeLineageDone(nodeIds: string[], completedIds: Set<string>): number {
  if (completedIds.size === 0) return 0;
  let n = 0;
  for (const id of nodeIds) if (completedIds.has(id)) n += 1;
  return n;
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

  const lineage = walkLineage(repoEntry.path);

  if (!isActive) {
    return {
      repo: repoEntry.name,
      path: repoEntry.path,
      status: "no-dag",
      dagId,
      completionPct: 100,
      currentBatch: [],
      lineage,
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
    lineage,
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

export async function scanRoadmaps(opts?: { url?: string }): Promise<RepoRoadmap[]> {
  const host = hostRepoRoot();
  const registry = readFleetRepos(host);
  const includeEmpty = shouldIncludeEmpty(opts?.url);

  // No fleet.json → filesystem-walk discovery rooted at ROADMAP_FS_SCAN_ROOT
  // (default: dirname(host)). Host repo always included regardless.
  if (registry.length === 0) {
    const scanRoot = process.env.ROADMAP_FS_SCAN_ROOT ?? dirname(host);
    const rawDiscovered = discoverRoadmaps(scanRoot);
    const discovered = filterCruft(rawDiscovered, host, includeEmpty);
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
    const lineage = walkLineage(entry.path);
    if (dagId === undefined && totalNodes === 0) {
      return { repo: entry.name, path: entry.path, status: "no-dag", currentBatch: [], lineage };
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
      lineage,
    };
  });
}
