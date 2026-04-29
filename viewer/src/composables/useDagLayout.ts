// useDagLayout — pure layout composable. Consumes a parsed head.json + the
// set of completed node ids and produces positioned nodes + pre-rendered
// SVG edge paths. Layered by longest-path from init; within-level order is
// parent-barycenter to reduce edge crossings.
//
// Ported from fleet/dashboard at r1.5 (viewer-port-dag-component). No
// fleet-specific assumptions — pure function of the typed DagPayload.
//
// Guards first. No nested loops. Extracted helpers for each stage.

import { computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { DagPayload, RoadmapNode } from "../services/dagReader";

export type NodeStatus = "done" | "in-progress" | "blocked" | "plan-mode";

export interface LaidOutNode {
  id: string;
  desc: string;
  level: number;
  indexInLevel: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: NodeStatus;
  deps: string[];
  isFrontier: boolean;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  dFromPath: string;
}

export interface DagLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  empty: boolean;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  levelGap: number;
  columnGap: number;
  marginX: number;
  marginY: number;
  direction?: 'TB' | 'LR';
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 220,
  nodeHeight: 72,
  levelGap: 110,
  columnGap: 32,
  marginX: 40,
  marginY: 40,
  direction: 'TB',
};

export const TABLET_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 150,
  nodeHeight: 48,
  levelGap: 96,
  columnGap: 24,
  marginX: 32,
  marginY: 32,
};

const EMPTY_LAYOUT: DagLayout = { nodes: [], edges: [], width: 0, height: 0, empty: true };

function topologicalLevels(nodes: Record<string, RoadmapNode>): Map<string, number> {
  const levels = new Map<string, number>();
  const pending = new Set(Object.keys(nodes));
  let guard = 0;
  while (pending.size > 0 && guard < 10_000) {
    guard = guard + 1;
    assignReadyNodes(nodes, pending, levels);
  }
  return levels;
}

function assignReadyNodes(
  nodes: Record<string, RoadmapNode>,
  pending: Set<string>,
  levels: Map<string, number>,
): void {
  const ready = Array.from(pending).filter((id) => allDepsKnown(nodes[id], levels));
  if (ready.length === 0) {
    pending.forEach((id) => levels.set(id, 0));
    pending.clear();
    return;
  }
  ready.forEach((id) => {
    levels.set(id, computeNodeLevel(nodes[id], levels));
    pending.delete(id);
  });
}

function allDepsKnown(node: RoadmapNode, levels: Map<string, number>): boolean {
  return node.deps.every((depId) => levels.has(depId));
}

function computeNodeLevel(node: RoadmapNode, levels: Map<string, number>): number {
  if (node.deps.length === 0) return 0;
  const depLevels = node.deps.map((depId) => levels.get(depId) ?? 0);
  return Math.max(...depLevels) + 1;
}

function groupByLevel(levels: Map<string, number>): Map<number, string[]> {
  const buckets = new Map<number, string[]>();
  levels.forEach((level, id) => {
    const bucket = buckets.get(level) ?? [];
    bucket.push(id);
    buckets.set(level, bucket);
  });
  return buckets;
}

function orderLevelByBarycenter(
  levelIds: string[],
  nodes: Record<string, RoadmapNode>,
  orderIndex: Map<string, number>,
): string[] {
  const withScore = levelIds.map((id) => ({ id, score: barycenterFor(nodes[id], orderIndex) }));
  withScore.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return withScore.map((entry) => entry.id);
}

function barycenterFor(node: RoadmapNode, orderIndex: Map<string, number>): number {
  if (node.deps.length === 0) return 0;
  const indices = node.deps.map((depId) => orderIndex.get(depId) ?? 0);
  const sum = indices.reduce((acc, value) => acc + value, 0);
  return sum / indices.length;
}

function classifyStatus(
  node: RoadmapNode,
  completed: Set<string>,
  frontierIds: Set<string>,
): NodeStatus {
  if (node.planMode === true) return "plan-mode";
  if (completed.has(node.id)) return "done";
  if (frontierIds.has(node.id)) return "in-progress";
  return "blocked";
}

function computeFrontier(
  nodes: Record<string, RoadmapNode>,
  completed: Set<string>,
): Set<string> {
  const frontier = new Set<string>();
  Object.values(nodes).forEach((node) => {
    if (completed.has(node.id)) return;
    const ready = node.deps.every((depId) => completed.has(depId));
    if (ready) frontier.add(node.id);
  });
  return frontier;
}

function buildEdgePath(fromNode: LaidOutNode, toNode: LaidOutNode, direction: 'TB' | 'LR'): string {
  if (direction === 'LR') {
    const startX = fromNode.x + fromNode.width;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x;
    const endY = toNode.y + toNode.height / 2;
    const midX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  }
  const startX = fromNode.x + fromNode.width / 2;
  const startY = fromNode.y + fromNode.height;
  const endX = toNode.x + toNode.width / 2;
  const endY = toNode.y;
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

function positionLevel(
  ordered: string[],
  level: number,
  options: LayoutOptions,
  totalCross: number,
): Array<Pick<LaidOutNode, "id" | "x" | "y" | "indexInLevel" | "level">> {
  const direction = options.direction ?? 'TB';
  if (direction === 'LR') {
    const levelHeight = ordered.length * options.nodeHeight + (ordered.length - 1) * options.columnGap;
    const startY = Math.max(options.marginY, (totalCross - levelHeight) / 2);
    const x = options.marginX + level * (options.nodeWidth + options.levelGap);
    return ordered.map((id, indexInLevel) => ({
      id,
      x,
      y: startY + indexInLevel * (options.nodeHeight + options.columnGap),
      indexInLevel,
      level,
    }));
  }
  const levelWidth = ordered.length * options.nodeWidth + (ordered.length - 1) * options.columnGap;
  const startX = Math.max(options.marginX, (totalCross - levelWidth) / 2);
  const y = options.marginY + level * (options.nodeHeight + options.levelGap);
  return ordered.map((id, indexInLevel) => ({
    id,
    x: startX + indexInLevel * (options.nodeWidth + options.columnGap),
    y,
    indexInLevel,
    level,
  }));
}

function computeCanvasSize(
  buckets: Map<number, string[]>,
  options: LayoutOptions,
): { width: number; height: number } {
  const direction = options.direction ?? 'TB';
  const widestLevel = Math.max(...Array.from(buckets.values()).map((ids) => ids.length), 1);
  const levelCount = buckets.size;
  if (direction === 'LR') {
    const width = levelCount * options.nodeWidth + (levelCount - 1) * options.levelGap + options.marginX * 2;
    const height = widestLevel * options.nodeHeight + (widestLevel - 1) * options.columnGap + options.marginY * 2;
    return { width, height };
  }
  const width =
    widestLevel * options.nodeWidth + (widestLevel - 1) * options.columnGap + options.marginX * 2;
  const height =
    levelCount * options.nodeHeight + (levelCount - 1) * options.levelGap + options.marginY * 2;
  return { width, height };
}

function layoutOnce(payload: DagPayload, options: LayoutOptions): DagLayout {
  const nodes = payload.head.nodes;
  if (Object.keys(nodes).length === 0) return EMPTY_LAYOUT;

  const levels = topologicalLevels(nodes);
  const buckets = groupByLevel(levels);
  const canvas = computeCanvasSize(buckets, options);
  const direction = options.direction ?? 'TB';
  const crossDim = direction === 'LR' ? canvas.height : canvas.width;

  const completed = new Set(payload.completed);
  const frontier = computeFrontier(nodes, completed);

  const positions = new Map<string, LaidOutNode>();
  const orderIndex = new Map<string, number>();
  const sortedLevels = Array.from(buckets.keys()).sort((a, b) => a - b);
  sortedLevels.forEach((level) => {
    const raw = buckets.get(level) ?? [];
    const ordered = orderLevelByBarycenter(raw, nodes, orderIndex);
    const placed = positionLevel(ordered, level, options, crossDim);
    placed.forEach((entry) => {
      orderIndex.set(entry.id, entry.indexInLevel);
      positions.set(entry.id, {
        ...entry,
        desc: nodes[entry.id].desc,
        width: options.nodeWidth,
        height: options.nodeHeight,
        status: classifyStatus(nodes[entry.id], completed, frontier),
        deps: nodes[entry.id].deps,
        isFrontier: frontier.has(entry.id),
      });
    });
  });

  const nodeList = Array.from(positions.values());
  const edges = buildEdges(nodes, positions, direction);
  return { nodes: nodeList, edges, width: canvas.width, height: canvas.height, empty: false };
}

function buildEdges(
  nodes: Record<string, RoadmapNode>,
  positions: Map<string, LaidOutNode>,
  direction: 'TB' | 'LR',
): LaidOutEdge[] {
  const edges: LaidOutEdge[] = [];
  Object.values(nodes).forEach((node) => {
    const toNode = positions.get(node.id);
    if (toNode === undefined) return;
    node.deps.forEach((depId) => appendEdge(edges, depId, toNode, positions, direction));
  });
  return edges;
}

function appendEdge(
  edges: LaidOutEdge[],
  fromId: string,
  toNode: LaidOutNode,
  positions: Map<string, LaidOutNode>,
  direction: 'TB' | 'LR',
): void {
  const fromNode = positions.get(fromId);
  if (fromNode === undefined) return;
  edges.push({ from: fromId, to: toNode.id, dFromPath: buildEdgePath(fromNode, toNode, direction) });
}

export function useDagLayout(
  payload: Ref<DagPayload | null>,
  options: Ref<LayoutOptions>,
): ComputedRef<DagLayout> {
  return computed<DagLayout>(() => {
    const current = payload.value;
    if (current === null) return EMPTY_LAYOUT;
    return layoutOnce(current, options.value);
  });
}
