// DAG reader (server) — returns head.json + completed entries for the host
// repo's active lane. Ported from fleet/dashboard at r1.5
// (viewer-port-core-readers). Per §Fail-hard: no fleet hard-codes — host
// repo resolves via ROADMAP_HOST_REPO env (default = process.cwd()).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

function hostRepoRoot(): string {
  return process.env.ROADMAP_HOST_REPO ?? process.cwd();
}

function fleetJsonPath(): string {
  return join(hostRepoRoot(), ".roadmap/fleet.json");
}

interface FleetEntry { name: string; path: string; }

function resolveRepoRoot(repo: string | undefined): string {
  const host = hostRepoRoot();
  if (!repo) return host;
  if (repo.startsWith("/")) return repo;
  try {
    const raw = readFileSync(fleetJsonPath(), "utf-8");
    const parsed = JSON.parse(raw) as { repos?: FleetEntry[] };
    const found = (parsed.repos ?? []).find((r) => r.name === repo);
    if (found) return found.path;
  } catch { /* missing fleet.json is fine — single-repo mode */ }
  return host;
}

function pickHeadPath(repoRoot: string, dagId: string | undefined): string {
  if (dagId) {
    const candidate = join(repoRoot, ".roadmap/heads", `${dagId}.json`);
    if (existsSync(candidate)) return candidate;
  }
  return join(repoRoot, ".roadmap/head.json");
}

export interface ValidationCheck {
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface RoadmapNode {
  id: string;
  desc: string;
  deps: string[];
  produces?: string[];
  consumes?: string[];
  idempotent?: boolean;
  planMode?: boolean;
  validate?: Array<{ type: string; command?: string; statement?: string; confidence?: number }>;
  expandedFrom?: string;
  mode?: string;
  children?: string[];
  lastCommitSha?: string;
  lastCommitSubject?: string;
  receiptPath?: string;
}

export interface HeadJson {
  id: string;
  desc: string;
  init: string;
  term: string;
  nodes: Record<string, RoadmapNode>;
}

export interface CompletedEntry {
  nodeId: string;
  dagId: string;
  completedAt: string;
  validationChecks: ValidationCheck[];
  gitSha: string | null;
  treeSha: string | null;
  branch: string;
  source: string;
  note?: string;
}

export interface IntentEval {
  statement: string;
  confidence: number;
  reasoning: string;
}

export interface DagPayload {
  head: HeadJson;
  completed: string[];
  completedEntries: Record<string, CompletedEntry>;
  intentEvals: Record<string, IntentEval[]>;
  dagId: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function collectCompletedForDag(entries: CompletedEntry[], dagId: string): { ids: string[]; map: Record<string, CompletedEntry> } {
  const map: Record<string, CompletedEntry> = {};
  for (const entry of entries) {
    if (entry.dagId !== dagId) continue;
    map[entry.nodeId] = entry;
  }
  return { ids: Object.keys(map), map };
}

function readIntentEvals(repoRoot: string): Record<string, IntentEval[]> {
  const dir = join(repoRoot, ".roadmap/.intent-eval");
  const result: Record<string, IntentEval[]> = {};
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return result;
  }
  for (const file of files) {
    const nodeId = file.replace(/\.json$/, "");
    try {
      result[nodeId] = readJson<IntentEval[]>(join(dir, file));
    } catch { /* skip malformed */ }
  }
  return result;
}

function findReceiptPath(repoRoot: string, nodeId: string): string | undefined {
  const roadmapDir = join(repoRoot, ".roadmap");
  let entries: string[];
  try { entries = readdirSync(roadmapDir); } catch { return undefined; }
  for (const e of entries) {
    if (!e.startsWith("round-")) continue;
    const candidate = join(roadmapDir, e, `${nodeId}.json`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function lastCommitFor(repoRoot: string, nodeId: string): { sha?: string; subject?: string } {
  try {
    const out = execFileSync(
      "git",
      ["-C", repoRoot, "log", "-n", "1", "--pretty=format:%h%x1f%s", `--grep=${nodeId}`],
      { encoding: "utf-8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!out) return {};
    const [sha, subject] = out.split("\x1f");
    return { sha, subject };
  } catch { return {}; }
}

export async function readDagPayload(req?: { url?: string }): Promise<DagPayload> {
  const url = req?.url ?? "";
  const qs = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const params = new URLSearchParams(qs);
  const repoRoot = resolveRepoRoot(params.get("repo") ?? undefined);
  const dagIdParam = params.get("dag") ?? undefined;
  const headPath = pickHeadPath(repoRoot, dagIdParam);
  const completedPath = join(repoRoot, ".roadmap/completed.json");

  const head = readJson<HeadJson>(headPath);
  let completedRaw: CompletedEntry[] = [];
  try { completedRaw = readJson<CompletedEntry[]>(completedPath); } catch { /* missing ok */ }
  const { ids, map } = collectCompletedForDag(completedRaw, head.id);
  const intentEvals = readIntentEvals(repoRoot);

  for (const node of Object.values(head.nodes)) {
    const receipt = findReceiptPath(repoRoot, node.id);
    if (receipt) node.receiptPath = receipt;
    const { sha, subject } = lastCommitFor(repoRoot, node.id);
    if (sha) { node.lastCommitSha = sha; node.lastCommitSubject = subject; }
  }
  return { head, completed: ids, completedEntries: map, intentEvals, dagId: head.id };
}
