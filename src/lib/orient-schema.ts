// @module orient-schema
// @exports OrientV1, OrientWorkspace, OrientDag, OrientDagNode, OrientDagEdge, OrientBlockedNode, OrientCheck, OrientError
// @types OrientV1, OrientWorkspace, OrientDag, OrientDagNode, OrientDagEdge, OrientBlockedNode, OrientCheck, OrientError
// @entry roadmap

// Orient --json v1 schema.
// Machine surface for DAG-mode consumption. Human mode is separate.

export type OrientV1 = {
  schema_version: 1;
  tool: { name: string; version: string };
  workspace: OrientWorkspace;
  inputs: {
    dag: boolean;
    spec?: string;
    reorient?: string;
  };

  // Current position (always present)
  position: string[];
  level: number;
  produces: string[];
  consumes: string[];
  batchRemaining: string[];
  batchComplete: boolean;
  done: number;
  remaining: number;
  complete: boolean;
  preGate?: string[];
  planNodes?: Record<string, string>;
  claims?: Record<string, unknown>;
  iteration?: number;

  // Full DAG structure (--dag only)
  dag?: OrientDag;

  // Checks (future)
  checks?: OrientCheck[];

  // Errors (non-zero exit)
  errors?: OrientError[];

  exit: { code: number };
};

export type OrientWorkspace = {
  root: string;
  dag_id?: string;
  package_manager?: string;
  node: string;
  platform: string;
};

export type OrientDag = {
  id: string;
  desc: string;
  node_count: number;
  nodes: OrientDagNode[];
  edges: OrientDagEdge[];
  toposort: string[];
  blocked: OrientBlockedNode[];
  executable: string[];
};

export type OrientDagNode = {
  id: string;
  desc: string;
  type?: string;
  mode: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  status: 'satisfied' | 'pending' | 'blocked';
  validate: unknown[];
};

export type OrientDagEdge = {
  from: string;
  to: string;
  kind: 'dep';
};

export type OrientBlockedNode = {
  id: string;
  missing: string[];
  reason: string;
};

export type OrientCheck = {
  id: string;
  pass: boolean;
  evidence: string;
};

export type OrientError = {
  kind: string;
  path?: string;
  message: string;
};
