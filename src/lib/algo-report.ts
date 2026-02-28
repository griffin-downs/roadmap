// @module algo-report
// @exports generateAlgoReport, AlgoEntry, AlgoReport
// @types AlgoEntry, AlgoReport
// @entry roadmap

export interface AlgoEntry {
  name: string;
  type: 'BFS' | 'DFS' | 'DP' | 'topo' | 'other';
  complexity: { time: string; space: string };
  inputContract: string;
  outputContract: string;
  sourceFile: string;
  lineHint?: number;
}

export interface AlgoReport {
  generatedAt: string;
  algorithms: AlgoEntry[];
}

/** Known algorithms in the codebase — sourced from implementation analysis. */
const KNOWN_ALGOS: AlgoEntry[] = [
  {
    name: 'parallelOrder',
    type: 'topo',
    complexity: { time: 'O(V+E)', space: 'O(V)' },
    inputContract: 'Graph<T>',
    outputContract: 'string[][] — batched topological groups, lexicographic within each batch (FR-DET-001)',
    sourceFile: 'src/protocol.ts',
  },
  {
    name: 'order',
    type: 'topo',
    complexity: { time: 'O(V+E)', space: 'O(V)' },
    inputContract: 'Graph<T>',
    outputContract: 'string[] — linear topological order',
    sourceFile: 'src/protocol.ts',
  },
  {
    name: 'bfsReachability',
    type: 'BFS',
    complexity: { time: 'O(V+E)', space: 'O(V)' },
    inputContract: 'Graph<T>',
    outputContract: 'ReachabilityResult — reachable map with paths, unreachable[], deadEnds[] (FR-REACH-001)',
    sourceFile: 'src/lib/verify.ts',
  },
  {
    name: 'contractClosure',
    type: 'DP',
    complexity: { time: 'O(V²)', space: 'O(V²)' },
    inputContract: 'Graph<T>',
    outputContract: 'ContractViolation[] — missing consumes with ancestor witness paths (FR-CONTRACT-001)',
    sourceFile: 'src/lib/verify.ts',
  },
  {
    name: 'detectBatchConflicts',
    type: 'other',
    complexity: { time: 'O(N*P)', space: 'O(P)' },
    inputContract: 'Array<{ nodeId, produces }> — flat batch node list',
    outputContract: 'BatchConflict[] — produces-overlap conflicts',
    sourceFile: 'src/lib/batch-conflicts.ts',
  },
  {
    name: 'detectCycles',
    type: 'topo',
    complexity: { time: 'O(V+E)', space: 'O(V)' },
    inputContract: 'Flat[] — internal node list',
    outputContract: 'string[] — nodes in cycle (empty if acyclic)',
    sourceFile: 'src/protocol.ts',
  },
  {
    name: 'mergeCheck',
    type: 'other',
    complexity: { time: 'O(V₁+V₂)', space: 'O(V₁)' },
    inputContract: 'Graph<T1>, Graph<T2>',
    outputContract: 'MergeConflict[] — node ID collisions before merge (FR-MERGE-001)',
    sourceFile: 'src/protocol.ts',
  },
  {
    name: 'branchWithWitness',
    type: 'BFS',
    complexity: { time: 'O(V+E)', space: 'O(V)' },
    inputContract: 'Graph<T>, fromNode',
    outputContract: '{ graph, witness: BranchWitness } — subgraph + reachability evidence (FR-BRANCH-001)',
    sourceFile: 'src/protocol.ts',
  },
];

export function generateAlgoReport(): AlgoReport {
  return {
    generatedAt: new Date().toISOString(),
    algorithms: KNOWN_ALGOS,
  };
}
