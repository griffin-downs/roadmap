// @module core/access
// @exports nodes, node
// @types (none — returns protocol types)
// @entry roadmap

// Typed graph accessors. Single bridge between the mapped-type
// Graph<T>.nodes and runtime iteration — replaces every
// unsafe cast on graph node lookups across the codebase.

import type { Graph, NodeSpec } from '../lib/protocol/types.ts';

/** All node IDs from a graph, typed as T[]. */
export function nodes<T extends string>(g: Graph<T>): T[] {
  return Object.keys(g.nodes) as T[];
}

/** Single node lookup by ID, preserving Graph's type parameter. */
export function node<T extends string>(g: Graph<T>, id: T): NodeSpec<T, T> {
  return g.nodes[id];
}
