// useViewerSearch — global search/filter index across all loaded DAGs.
//
// Pure, reactive composable. Builds a flat index over (nodes × lanes) plus
// a parallel index over trail events, then filters on a query string each
// time it changes. Recognises a few cheap structured prefixes so a viewer
// user can ask narrow questions without committing to a query DSL:
//
//   status:done|in-progress|blocked|plan-mode    node-status filter
//   lane:<name>                                  restrict to one lane
//   tag:<tag>                                    deviation/tag match
//   owner:<who>                                  receipt-author / advance-note
//   cite:§<anchor>                               anchor cited in desc
//   <free text>                                  case-insensitive substring on desc/id
//
// Multiple terms AND together. Empty query → empty result (callers decide
// whether to fall back to "show everything"). Composable, dumb-component
// friendly: no DOM, no fetch — caller passes the loaded payloads in.
//
// Guards first. One concern: take inputs, return matches.

import { computed } from "vue";
import type { Ref } from "vue";
import type { DagPayload, RoadmapNode } from "../services/dagReader";
import type { TrailEvent } from "../services/trailReader";
import type { LaneHealth } from "../services/laneRollupReader";

export type NodeStatus = "done" | "in-progress" | "blocked" | "plan-mode";

export interface SearchNodeHit {
  lane: string;
  dagId: string;
  node: RoadmapNode;
  status: NodeStatus;
}

export interface SearchTrailHit {
  lane: string;
  event: TrailEvent;
}

export interface SearchLaneHit {
  lane: LaneHealth;
}

export interface SearchResult {
  nodes: SearchNodeHit[];
  trailEvents: SearchTrailHit[];
  lanes: SearchLaneHit[];
  query: ParsedQuery;
}

export interface SearchInputs {
  /** payloads keyed by lane name; undefined entry = no DAG loaded for that lane */
  payloads: Ref<Record<string, DagPayload | null>>;
  /** completed-node id sets keyed by lane name */
  completed: Ref<Record<string, Set<string>>>;
  /** trail events keyed by lane name */
  trails: Ref<Record<string, TrailEvent[]>>;
  /** lane health rollups (optional) */
  lanes: Ref<LaneHealth[]>;
}

export interface ParsedQuery {
  raw: string;
  status: NodeStatus | null;
  lane: string | null;
  tag: string | null;
  owner: string | null;
  cite: string | null;
  free: string[];
}

const STATUS_VALUES: ReadonlySet<NodeStatus> = new Set([
  "done",
  "in-progress",
  "blocked",
  "plan-mode",
]);

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  const out: ParsedQuery = {
    raw: trimmed,
    status: null,
    lane: null,
    tag: null,
    owner: null,
    cite: null,
    free: [],
  };
  if (trimmed.length === 0) return out;
  const tokens = trimmed.split(/\s+/);
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon <= 0) {
      out.free.push(tok.toLowerCase());
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key === "status" && STATUS_VALUES.has(val as NodeStatus)) {
      out.status = val as NodeStatus;
      continue;
    }
    if (key === "lane") {
      out.lane = val;
      continue;
    }
    if (key === "tag") {
      out.tag = val.toLowerCase();
      continue;
    }
    if (key === "owner") {
      out.owner = val.toLowerCase();
      continue;
    }
    if (key === "cite") {
      out.cite = val.toLowerCase();
      continue;
    }
    out.free.push(tok.toLowerCase());
  }
  return out;
}

export function useViewerSearch(
  query: Ref<string>,
  inputs: SearchInputs,
): Ref<SearchResult> {
  return computed<SearchResult>(() => {
    const parsed = parseQuery(query.value);
    if (parsed.raw.length === 0) {
      return { nodes: [], trailEvents: [], lanes: [], query: parsed };
    }
    return {
      nodes: matchNodes(parsed, inputs),
      trailEvents: matchTrailEvents(parsed, inputs),
      lanes: matchLanes(parsed, inputs),
      query: parsed,
    };
  });
}

function matchNodes(q: ParsedQuery, inputs: SearchInputs): SearchNodeHit[] {
  const hits: SearchNodeHit[] = [];
  const payloads = inputs.payloads.value;
  const completedMap = inputs.completed.value;
  for (const lane of Object.keys(payloads)) {
    if (q.lane && lane !== q.lane) continue;
    const payload = payloads[lane];
    if (!payload) continue;
    const completed = completedMap[lane] ?? new Set<string>();
    for (const node of Object.values(payload.head.nodes)) {
      const status = statusOf(node, completed);
      if (q.status && status !== q.status) continue;
      if (!matchesText(q, node)) continue;
      hits.push({ lane, dagId: payload.dagId, node, status });
    }
  }
  return hits;
}

function matchTrailEvents(
  q: ParsedQuery,
  inputs: SearchInputs,
): SearchTrailHit[] {
  if (q.cite || q.tag) return []; // structured-only filters don't apply to trail
  const hits: SearchTrailHit[] = [];
  const trails = inputs.trails.value;
  for (const lane of Object.keys(trails)) {
    if (q.lane && lane !== q.lane) continue;
    for (const event of trails[lane] ?? []) {
      if (!matchesTrail(q, event)) continue;
      hits.push({ lane, event });
    }
  }
  return hits;
}

function matchLanes(q: ParsedQuery, inputs: SearchInputs): SearchLaneHit[] {
  if (q.status || q.tag || q.cite) return [];
  return inputs.lanes.value
    .filter((lane) => !q.lane || lane.lane === q.lane)
    .filter((lane) => q.free.every((t) => lane.lane.toLowerCase().includes(t)))
    .map((lane) => ({ lane }));
}

function statusOf(node: RoadmapNode, completed: Set<string>): NodeStatus {
  if (completed.has(node.id)) return "done";
  if (node.planMode) return "plan-mode";
  const ready = node.deps.every((d) => completed.has(d));
  return ready ? "in-progress" : "blocked";
}

function matchesText(q: ParsedQuery, node: RoadmapNode): boolean {
  const haystack = `${node.id} ${node.desc}`.toLowerCase();
  if (q.cite && !haystack.includes(`§${q.cite.replace(/^§/, "")}`)) return false;
  if (q.tag && !haystackHasTag(node, q.tag)) return false;
  if (q.owner && !haystackHasOwner(node, q.owner)) return false;
  return q.free.every((t) => haystack.includes(t));
}

function haystackHasTag(node: RoadmapNode, tag: string): boolean {
  const desc = node.desc.toLowerCase();
  return desc.includes(`#${tag}`) || desc.includes(`tag:${tag}`);
}

function haystackHasOwner(node: RoadmapNode, owner: string): boolean {
  const subject = (node.lastCommitSubject ?? "").toLowerCase();
  return subject.includes(owner);
}

function matchesTrail(q: ParsedQuery, event: TrailEvent): boolean {
  const haystack = `${event.cmd} ${event.note}`.toLowerCase();
  if (q.owner && !haystack.includes(q.owner)) return false;
  return q.free.every((t) => haystack.includes(t));
}

export const _internals = { parseQuery, statusOf, matchesText };
