// @module schemas
// @exports schemas, lookupSchema, listCommands, CommandSchema
// @entry roadmap

import { z, toJSONSchema } from 'zod';

// --- Shared fragments ---

const validationRule = z.union([
  z.object({ type: z.literal('artifact-exists'), target: z.string().optional(), path: z.string().optional() }),
  z.object({ type: z.literal('artifact-schema'), target: z.string(), schema: z.string() }),
  z.object({ type: z.literal('function'), target: z.string(), fn: z.string() }),
  z.object({ type: z.literal('manual-approval'), target: z.string(), reviewer: z.string().optional() }),
  z.object({ type: z.literal('expanded'), minNodes: z.number().optional() }),
  z.object({ type: z.literal('shell'), command: z.union([z.string(), z.array(z.string())]), expectExitCode: z.number().optional() }),
  z.object({ type: z.literal('build-produces'), command: z.string(), outputs: z.array(z.string()) }),
  z.object({ type: z.literal('launch-check'), command: z.string(), timeout: z.number().optional(), successSignal: z.string().optional() }),
  z.object({ type: z.literal('spec-conformance'), spec: z.string(), stories: z.array(z.number()), criteria: z.array(z.number()).optional() }),
  z.object({ type: z.literal('intent'), statement: z.string(), confidence: z.number(), evaluator: z.enum(['self', 'council']), expandOnFail: z.boolean().optional(), prompt: z.array(z.string()).optional() }),
]).describe('Validation rule for a node');

const specIRTask = z.object({
  id: z.string().describe('Unique node identifier'),
  desc: z.string().describe('Human-readable description'),
  priority: z.number().describe('Execution priority (lower = higher)'),
  depends: z.array(z.string()).describe('Node IDs this task depends on'),
  produces: z.array(z.string()).describe('File paths this task creates'),
  consumes: z.array(z.string()).describe('File paths this task reads'),
  mode: z.enum(['execute', 'plan']).describe('execute = build artifacts, plan = decompose into sub-nodes'),
  validate: z.array(validationRule).describe('Acceptance criteria'),
  ambient: z.array(z.string()).optional().describe('Context files (not gated)'),
  provenance: z.object({
    file: z.string(),
    line: z.number().optional(),
    section: z.string().optional(),
  }).optional().describe('Source location in spec'),
  // §Sidecar-as-ambient-context · ad-hoc per-task fields land here, not flat-as-siblings.
  // Engine ignores contents · agents put domain knowledge here · §Sidecar-promotion-rule
  // lifts recurring keys out of sidecar into first-class fields when ≥3 specs use them.
  sidecar: z.record(z.string(), z.unknown()).optional().describe('Ad-hoc per-task fields · jq-queryable · promotion-eligible'),
}).strict().describe('A single task in SpecIR format · strict: unknown flat fields rejected · use sidecar.{} for ad-hoc');

const specIR = z.object({
  schema_version: z.literal(1),
  engine: z.object({
    name: z.string(),
    version: z.string().nullable(),
    config_hash: z.string().nullable(),
  }),
  dag_id: z.string().describe('DAG identifier'),
  dag_desc: z.string().optional().describe('DAG description'),
  inputs: z.array(z.object({
    path: z.string(),
    sha256: z.string(),
    role: z.enum(['pre-spec', 'spec', 'plan', 'tasks', 'data-model', 'other']),
  })).describe('Source files that produced this spec'),
  tasks: z.array(specIRTask).describe('Task definitions'),
  metadata: z.object({
    generated: z.string().describe('ISO-8601 timestamp'),
    compile_hash: z.string().describe('SHA-256 of compilation inputs'),
  }),
}).describe('SpecIR — intermediate representation for spec → DAG compilation');

const nodeSpecInput = z.object({
  id: z.string().describe('Unique node identifier'),
  desc: z.string().describe('Human-readable description'),
  produces: z.array(z.string()).default([]).describe('File paths this node creates'),
  consumes: z.array(z.string()).default([]).describe('File paths this node reads'),
  deps: z.array(z.string()).describe('Predecessor node IDs'),
  validate: z.array(validationRule).default([]).describe('Acceptance criteria'),
  idempotent: z.boolean().default(true).describe('true = re-runnable'),
  mode: z.enum(['execute', 'plan']).optional().describe('Execution mode'),
  ambient: z.array(z.string()).optional().describe('Context files (not gated)'),
}).describe('Node specification for DAG insertion');

// --- Per-command schemas ---

export interface CommandSchema {
  description: string;
  input?: z.ZodType;
  output?: z.ZodType;
  examples: Array<{
    input?: Record<string, unknown>;
    cli: string;
  }>;
}

export const schemas: Record<string, CommandSchema> = {
  make: {
    description: 'Create ideal DAG from SpecIR JSON file',
    input: specIR,
    output: z.object({
      ok: z.literal(true),
      dag: z.record(z.string(), z.unknown()).describe('The generated DAG'),
      position: z.array(z.string()).describe('Initial batch position'),
      level: z.number().describe('Batch level'),
      message: z.string(),
    }),
    examples: [{
      input: {
        schema_version: 1,
        engine: { name: 'spec-kit', version: '1.0.0', config_hash: null },
        dag_id: 'auth-phase',
        tasks: [
          { id: 'setup', desc: 'Project setup', priority: 0, depends: [], produces: ['package.json'], consumes: [], mode: 'execute', validate: [{ type: 'artifact-exists' }] },
        ],
        metadata: { generated: '2026-03-03T00:00:00Z', compile_hash: 'abc123' },
      },
      cli: 'roadmap make spec.json --note "create auth phase DAG"',
    }],
  },

  orient: {
    description: 'Current batch position + produces/consumes',
    output: z.object({
      position: z.array(z.string()).describe('Current batch node IDs'),
      level: z.number().describe('Batch level index'),
      produces: z.array(z.string()).describe('Artifacts this batch creates'),
      consumes: z.array(z.string()).describe('Artifacts this batch reads'),
      batchRemaining: z.array(z.string()).describe('Incomplete nodes in batch'),
      batchComplete: z.boolean(),
      done: z.number().describe('Completed node count'),
      remaining: z.number().describe('Remaining node count'),
      chainReady: z.boolean().describe('All nodes executed — evaluate gaps and write successor spec'),
    }),
    examples: [{
      cli: 'roadmap orient --note "check position"',
    }],
  },

  advance: {
    description: 'Advance to next batch (requires current batch complete)',
    output: z.object({
      ok: z.literal(true),
      advanced: z.literal(true),
      previousLevel: z.number().optional(),
      level: z.number(),
      position: z.array(z.string()),
      batchRemaining: z.array(z.string()).optional(),
      produces: z.array(z.string()).optional(),
      consumes: z.array(z.string()).optional(),
    }),
    examples: [{
      cli: 'roadmap advance --note "batch complete, moving on"',
    }],
  },

  'dag.insert': {
    description: 'Insert a new node into the DAG',
    input: nodeSpecInput,
    output: z.object({
      ok: z.literal(true),
      op: z.literal('insert'),
      nodeId: z.string(),
      receipt: z.record(z.string(), z.unknown()),
    }),
    examples: [{
      input: {
        id: 'add-auth',
        desc: 'Add authentication module',
        produces: ['src/auth.ts'],
        consumes: [],
        deps: ['setup'],
        validate: [{ type: 'artifact-exists' }],
        idempotent: true,
      },
      cli: 'roadmap dag insert --node \'{"id":"add-auth","desc":"Add authentication module","produces":["src/auth.ts"],"consumes":[],"deps":["setup"],"validate":[{"type":"artifact-exists"}],"idempotent":true}\' --note "add auth node"',
    }],
  },

  'dag.remove': {
    description: 'Remove a node from the DAG',
    input: z.object({
      nodeId: z.string().describe('Node ID to remove'),
      cascade: z.boolean().optional().describe('Also remove dependents'),
    }),
    output: z.object({
      ok: z.literal(true),
      op: z.literal('remove'),
      nodeId: z.string(),
      cascade: z.boolean(),
      receipt: z.record(z.string(), z.unknown()),
    }),
    examples: [{
      input: { nodeId: 'old-node', cascade: false },
      cli: 'roadmap dag remove old-node --note "no longer needed"',
    }],
  },

  'dag.modify': {
    description: 'Modify an existing node\'s fields',
    input: z.object({
      nodeId: z.string().describe('Node ID to modify'),
      changes: z.record(z.string(), z.unknown()).describe('Fields to patch'),
    }),
    output: z.object({
      ok: z.literal(true),
      op: z.literal('modify'),
      nodeId: z.string(),
      receipt: z.record(z.string(), z.unknown()),
    }),
    examples: [{
      input: { nodeId: 'setup', changes: { desc: 'Updated description' } },
      cli: 'roadmap dag modify setup --set \'{"desc":"Updated description"}\' --note "clarify description"',
    }],
  },

  'spec.plan': {
    description: 'Spec planning: gallery, selection, status',
    examples: [
      { cli: 'roadmap spec plan --gallery --note "show candidates"' },
      { cli: 'roadmap spec plan select <id> --note "choose plan"' },
      { cli: 'roadmap spec plan status' },
    ],
  },

  'spec.plan.gallery': {
    description: 'Show Pareto-filtered plan candidates',
    output: z.object({
      candidates: z.array(z.object({
        id: z.string(),
        estimates: z.object({
          nodes: z.number(),
          wallClockMinutes: z.number(),
          costUSD: z.number(),
          risk: z.number(),
        }),
      })),
      specSource: z.string(),
    }),
    examples: [{
      cli: 'roadmap spec plan --gallery --note "show candidates"',
    }],
  },

  'spec.plan.select': {
    description: 'Select a plan candidate and write as head.json',
    output: z.object({
      ok: z.literal(true),
      selectedId: z.string(),
      nodeCount: z.number(),
    }),
    examples: [{
      cli: 'roadmap spec plan select auth-plan --note "choose plan"',
    }],
  },

  'spec.plan.status': {
    description: 'Show current plan selection status',
    output: z.object({
      selected: z.string().nullable(),
      specSource: z.string(),
    }),
    examples: [{
      cli: 'roadmap spec plan status',
    }],
  },
};

// --- Lookup ---

export function lookupSchema(cmd: string): CommandSchema | undefined {
  return schemas[cmd];
}

export function listCommands(): Array<{ command: string; description: string }> {
  return Object.entries(schemas).map(([command, s]) => ({
    command,
    description: s.description,
  }));
}

// --- JSON Schema conversion ---

export function schemaToJsonSchema(s: z.ZodType): object {
  return toJSONSchema(s);
}
