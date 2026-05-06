// @module core/types
// @exports CoreNodeSpec, CoreGraph
// @types CoreNodeSpec, CoreGraph
// @entry roadmap

// Minimal 5-field contract for pure graph algebra.
// This is all that define(), verify(), check(), orient() need.
// Runtime metadata (validate, mode, etc.) lives in runtime/meta.ts.

import type { ConsumeSpec } from '../lib/protocol/types.ts';

/** Pure graph-algebra contract — sufficient for all core/ operations.
 *
 *  Note: edges are derived EXCLUSIVELY from consumes ↔ produces. There is no
 *  authored `deps` field — the engine's internal Flat type synthesizes deps
 *  inside flat() when iterating. Test fixtures and back-compat callers that
 *  attach a `deps` array on raw node objects continue to work because flat()
 *  falls back to that array when present, but new specs and persisted DAGs
 *  must not include it. */
export interface CoreNodeSpec<_TAll extends string = string, TSelf extends string = _TAll> {
  readonly id: TSelf;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly (ConsumeSpec)[];
}

/** Graph whose nodes carry only the core contract. */
export interface CoreGraph<T extends string = string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: CoreNodeSpec<T, N> };
}
