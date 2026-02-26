# Roadmap Protocol Specification

Complete formal specification of the roadmap protocol.

## Core Types

```typescript
// Graph: DAG with init/term nodes
type Graph<T extends string> = {
  readonly id: string;
  readonly desc: string;
  readonly init: T;        // Start node
  readonly term: T;        // End node
  readonly nodes: { [N in T]: NodeSpec<T, N> };
};

// Node: unit of work
type NodeSpec<T, N> = {
  readonly id: N;
  readonly desc: string;
  readonly produces: readonly string[];    // Artifacts created
  readonly consumes: readonly string[];    // Artifacts used
  readonly deps: readonly T[];             // Dependencies (DAG edges)
  readonly validate: readonly ValidationRule[];
  readonly idempotent: boolean;
};

// Position: where you are in the DAG
type Orientation = {
  readonly position: T;
  readonly done: readonly T[];
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly remaining: readonly T[];
  readonly complete: boolean;
};
```

## Operations

### define(g: Graph<T>): Graph<T>
Validate structure. Throws on:
- Cycle in dependencies
- Missing init or term
- init === term

### verify(g: Graph<T>): Gap[]
Validate contracts. Returns:
- Artifacts consumed but not produced by predecessors

### check(g: Graph<T>): Error[]
Validate termination:
- All nodes reachable from init
- All nodes can reach term

### orient(g: Graph<T>, predicate: Predicate): Orientation
Find position in DAG:
- Start at init
- For each node, check if all produces exist
- Return first unsatisfied node

### order(g: Graph<T>): T[]
Topological sort (linear order)

### parallelOrder(g: Graph<T>): T[][]
Topological sort with batches (parallel groups)

### merge(g1: Graph<T1>, g2: Graph<T2>, connection): Graph<T1|T2>
Combine DAGs at join point

### branch(g: Graph<T>, from: T): Graph<T>
Extract subgraph from node to term

### reconcile(g: Graph<T>, fwd: Graph<T>, bwd: Graph<T>): Gap[]
Find where forward produces meet backward consumes

## Predicates

```typescript
type Predicate = (path: string) => boolean;

// Built-in predicates
fileExists(root: string): Predicate
siblingArtifactExists(root: string, siblingRoot: string): Predicate
gitArtifactAt(root: string, ref: string): Predicate
any(...predicates: Predicate[]): Predicate
```

## Validation Rules

```typescript
type ValidationRule =
  | { type: 'artifact-exists'; target: string }
  | { type: 'artifact-readable'; target: string }
  | { type: 'no-cycle'; explanation?: string }
  | { type: 'custom'; check: () => boolean };
```

## Errors

```typescript
interface RoadmapError extends Error {
  code: ErrorCode;
  context: Record<string, unknown>;
  fix: string;
  entry: string;
}
```

## See Also

- `src/protocol.ts` — Implementation
- `tests/protocol.test.ts` — Test suite
- `tests/adv-property.test.ts` — Property tests
