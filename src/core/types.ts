// @module core/types
// @exports CoreNodeSpec, CoreGraph
// @types CoreNodeSpec, CoreGraph
// @entry roadmap

// Minimal 5-field contract for pure graph algebra.
// This is all that define(), verify(), check(), orient() need.
// Runtime metadata (validate, mode, etc.) lives in runtime/meta.ts.

import type { ConsumeSpec } from '../lib/protocol/types.ts';

/** Pure graph-algebra contract — sufficient for all core/ operations. */
export interface CoreNodeSpec<TAll extends string = string, TSelf extends TAll = TAll> {
  readonly id: TSelf;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly (ConsumeSpec)[];
  readonly deps: readonly TAll[];
}

/** Graph whose nodes carry only the core contract. */
export interface CoreGraph<T extends string = string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: CoreNodeSpec<T, N> };
}
