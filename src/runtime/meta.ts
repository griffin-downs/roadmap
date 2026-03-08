// @module runtime/meta
// @exports NodeMeta, ManagedNodeSpec, ManagedGraph, fullNode
// @types NodeMeta, ManagedNodeSpec, ManagedGraph
// @entry roadmap

// Runtime metadata that extends the core contract.
// Orchestration, validation, governance — everything beyond
// the pure graph algebra lives here.

import type { ValidationRule, IntentDiagnosis, NodeSpec, Graph, TermGate, SpecMeta } from '../lib/protocol/types.ts';
import type { CoreNodeSpec } from '../core/types.ts';

/** Runtime/orchestration metadata — everything NodeSpec carries beyond the 5-field core. */
export interface NodeMeta {
  readonly validate: readonly ValidationRule[];
  readonly idempotent: boolean;
  readonly mode?: 'execute' | 'plan';
  readonly nodeType?: 'execute' | 'emit-gallery';
  readonly track?: number;
  readonly expandedFrom?: string;
  readonly loopTarget?: string;
  readonly convergenceCheck?: {
    readonly maxCoverageDelta?: number;
    readonly requireEmptyProposals?: boolean;
    readonly minWallClockDeltaMs?: number;
  };
  readonly ambient?: readonly string[];
  readonly _intentDiagnosis?: IntentDiagnosis;
  readonly affects?: readonly string[];
}

/** A node that carries both the core contract and runtime metadata. */
export type ManagedNodeSpec<TAll extends string = string, TSelf extends TAll = TAll> =
  CoreNodeSpec<TAll, TSelf> & NodeMeta;

/** Graph whose nodes carry both core contract and runtime metadata. */
export interface ManagedGraph<T extends string = string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: ManagedNodeSpec<T, N> };
  readonly termGates?: readonly TermGate[];
  readonly spec?: SpecMeta;
}

// --- Defaults for optional NodeMeta fields ---

const META_DEFAULTS: Omit<NodeMeta, 'validate' | 'idempotent'> = {
  mode: undefined,
  nodeType: undefined,
  track: undefined,
  expandedFrom: undefined,
  loopTarget: undefined,
  convergenceCheck: undefined,
  ambient: undefined,
  _intentDiagnosis: undefined,
  affects: undefined,
};

/**
 * Merge a CoreNodeSpec + NodeMeta into a full NodeSpec.
 * Backward-compat bridge: code that expects the monolithic NodeSpec
 * can use this to reconstruct it from the split types.
 */
export function fullNode<TAll extends string, TSelf extends TAll>(
  core: CoreNodeSpec<TAll, TSelf>,
  meta: NodeMeta,
): NodeSpec<TAll, TSelf> {
  return { ...META_DEFAULTS, ...core, ...meta } as NodeSpec<TAll, TSelf>;
}
