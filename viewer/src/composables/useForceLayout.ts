// useForceLayout — d3-force driven layout composable.
//
// Consumes a DagPayload (typed) + grouping options and produces reactive
// positioned nodes + edges. Replaces useDagLayout's static layered placement
// with an iterative simulation. Pure logic; no DOM, no Vue templates.
//
// Two grouping strategies (opts.groupBy):
//   - "depth"   · y-position pinned to topological depth (layered force)
//   - "cluster" · y-position pinned to deps[0] cluster id (community-ish)
//
// Caller drives lifecycle via start()/stop(). Component subscribes to the
// reactive {nodes, edges} refs; positions update each tick.
//
// Guards first. One concern: simulation lifecycle + position projection.

import { ref, computed, watch, onUnmounted } from "vue";
import type { Ref } from "vue";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { DagPayload, RoadmapNode } from "../services/dagReader";
import type { NodeStatus } from "./useDagLayout";

export interface ForceNode extends SimulationNodeDatum {
  id: string;
  desc: string;
  depth: number;
  cluster: string;
  status: NodeStatus;
  isFrontier: boolean;
}

export interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
}

export interface ForceLayoutOptions {
  width: number;
  height: number;
  groupBy: "depth" | "cluster";
  chargeStrength: number;
  linkDistance: number;
  collideRadius: number;
}

export const DEFAULT_FORCE_OPTIONS: ForceLayoutOptions = {
  width: 1200,
  height: 800,
  groupBy: "depth",
  chargeStrength: -240,
  linkDistance: 110,
  collideRadius: 36,
};

export interface ForceLayoutHandle {
  nodes: Ref<ForceNode[]>;
  links: Ref<ForceLink[]>;
  start: () => void;
  stop: () => void;
  reheat: () => void;
}

export function useForceLayout(
  payload: Ref<DagPayload | null>,
  completed: Ref<Set<string>>,
  options: Ref<ForceLayoutOptions>,
): ForceLayoutHandle {
  const nodes = ref<ForceNode[]>([]) as Ref<ForceNode[]>;
  const links = ref<ForceLink[]>([]) as Ref<ForceLink[]>;
  let sim: Simulation<ForceNode, ForceLink> | null = null;

  function rebuild(): void {
    stop();
    if (!payload.value) {
      nodes.value = [];
      links.value = [];
      return;
    }
    const built = buildGraph(payload.value, completed.value);
    nodes.value = built.nodes;
    links.value = built.links;
    sim = createSim(nodes.value, links.value, options.value);
    sim.on("tick", () => {
      // trigger reactivity by reassigning the array reference shallowly
      nodes.value = [...nodes.value];
    });
  }

  function start(): void {
    if (!sim) rebuild();
    sim?.alpha(1).restart();
  }

  function stop(): void {
    if (sim) {
      sim.stop();
      sim.on("tick", null);
    }
    sim = null;
  }

  function reheat(): void {
    sim?.alpha(0.6).restart();
  }

  watch([payload, completed, options], () => rebuild(), { deep: true });
  onUnmounted(() => stop());

  return { nodes, links, start, stop, reheat };
}

interface BuiltGraph {
  nodes: ForceNode[];
  links: ForceLink[];
}

function buildGraph(payload: DagPayload, completed: Set<string>): BuiltGraph {
  const head = payload.head;
  const depths = computeDepths(head.nodes);
  const frontier = computeFrontier(head.nodes, completed);
  const fNodes: ForceNode[] = Object.values(head.nodes).map((n) => ({
    id: n.id,
    desc: n.desc,
    depth: depths.get(n.id) ?? 0,
    cluster: n.deps[0] ?? n.id,
    status: statusOf(n, completed),
    isFrontier: frontier.has(n.id),
  }));
  const fLinks: ForceLink[] = [];
  Object.values(head.nodes).forEach((n) => {
    n.deps.forEach((dep) => {
      if (head.nodes[dep]) fLinks.push({ source: dep, target: n.id });
    });
  });
  return { nodes: fNodes, links: fLinks };
}

function statusOf(node: RoadmapNode, completed: Set<string>): NodeStatus {
  if (completed.has(node.id)) return "done";
  if (node.planMode) return "plan-mode";
  const ready = node.deps.every((d) => completed.has(d));
  return ready ? "in-progress" : "blocked";
}

function computeFrontier(
  nodes: Record<string, RoadmapNode>,
  completed: Set<string>,
): Set<string> {
  const frontier = new Set<string>();
  Object.values(nodes).forEach((n) => {
    if (completed.has(n.id)) return;
    if (n.deps.every((d) => completed.has(d))) frontier.add(n.id);
  });
  return frontier;
}

function computeDepths(nodes: Record<string, RoadmapNode>): Map<string, number> {
  const depths = new Map<string, number>();
  const pending = new Set(Object.keys(nodes));
  let guard = 0;
  while (pending.size > 0 && guard < 10_000) {
    guard = guard + 1;
    assignReady(nodes, pending, depths);
  }
  return depths;
}

function assignReady(
  nodes: Record<string, RoadmapNode>,
  pending: Set<string>,
  depths: Map<string, number>,
): void {
  const ready = Array.from(pending).filter((id) =>
    nodes[id].deps.every((d) => depths.has(d)),
  );
  if (ready.length === 0) {
    pending.forEach((id) => depths.set(id, 0));
    pending.clear();
    return;
  }
  ready.forEach((id) => {
    const ds = nodes[id].deps.map((d) => depths.get(d) ?? 0);
    depths.set(id, ds.length === 0 ? 0 : Math.max(...ds) + 1);
    pending.delete(id);
  });
}

function createSim(
  nodes: ForceNode[],
  links: ForceLink[],
  opts: ForceLayoutOptions,
): Simulation<ForceNode, ForceLink> {
  const yTarget = makeYTarget(nodes, opts);
  return forceSimulation<ForceNode>(nodes)
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(links)
        .id((d) => d.id)
        .distance(opts.linkDistance),
    )
    .force("charge", forceManyBody<ForceNode>().strength(opts.chargeStrength))
    .force("center", forceCenter(opts.width / 2, opts.height / 2))
    .force("y", forceY<ForceNode>((d) => yTarget(d)).strength(0.25))
    .force("collide", forceCollide<ForceNode>(opts.collideRadius));
}

function makeYTarget(
  nodes: ForceNode[],
  opts: ForceLayoutOptions,
): (d: ForceNode) => number {
  if (opts.groupBy === "depth") {
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0) || 1;
    const step = opts.height / (maxDepth + 1);
    return (d) => step * (d.depth + 1);
  }
  // cluster mode: hash cluster string into y bucket
  const clusters = Array.from(new Set(nodes.map((n) => n.cluster))).sort();
  const step = opts.height / (clusters.length + 1);
  return (d) => step * (clusters.indexOf(d.cluster) + 1);
}

export const _internals = { buildGraph, computeDepths, makeYTarget };
