// @module spec-ir
// @exports SpecIR, SpecIRTask, SpecConfig, compileIR, parseIRFile, defaultConfig
// @types SpecIR, SpecIRTask, SpecConfig, SpecInput
// @entry roadmap

// FR-SPEC-001: Roadmap-owned intermediate representation for spec → DAG compilation.
// Engine-agnostic: any backend that produces this format is compatible.

import type { ValidationRule } from '../protocol.ts';

export interface SpecInput {
  path: string;
  sha256: string;
  role: 'pre-spec' | 'spec' | 'plan' | 'tasks' | 'data-model' | 'other';
}

export interface SpecIRTask {
  id: string;
  desc: string;
  priority: number;
  depends: string[];
  produces: string[];
  consumes: string[];
  mode: 'execute' | 'plan';
  validate: ValidationRule[];
  ambient?: string[];
  provenance?: { file: string; line?: number; section?: string };
}

export interface SpecIR {
  schema_version: 1;
  engine: { name: string; version: string | null; config_hash: string | null };
  dag_id: string;
  dag_desc?: string;
  inputs: SpecInput[];
  tasks: SpecIRTask[];
  metadata: {
    generated: string;
    compile_hash: string;
  };
}

export interface SpecConfig {
  engine: string;
  engine_command?: string;
  dag_id: string;
  dag_desc?: string;
  inputs: {
    pre_spec?: string;
    spec?: string;
    plan?: string;
    tasks?: string;
    data_model?: string;
    extra?: string[];
  };
}

export function defaultConfig(dagId: string): SpecConfig {
  return {
    engine: 'spec-kit',
    dag_id: dagId,
    inputs: {
      pre_spec: '.specify/pre-spec.md',
      spec: `.specify/specs/${dagId}/spec.md`,
      plan: `.specify/specs/${dagId}/plan.md`,
      tasks: `.specify/specs/${dagId}/tasks.md`,
      data_model: `.specify/specs/${dagId}/data-model.md`,
    },
  };
}

// Compile IR tasks → ParsedTask[] compatible format (for tasksToDAG reuse)
import type { ParsedTask, ImportOptions } from './speckit-import.ts';
import { tasksToDAG } from './speckit-import.ts';
import type { Graph } from '../protocol.ts';

export function irTasksToParsed(tasks: SpecIRTask[]): ParsedTask[] {
  return tasks.map(t => ({
    id: t.id,
    desc: t.desc,
    priority: t.priority,
    depends: t.depends,
    produces: t.produces,
    consumes: t.consumes,
    mode: t.mode,
    validate: t.validate,
  }));
}

export function compileIR(ir: SpecIR): Graph<string> {
  const parsed = irTasksToParsed(ir.tasks);
  const opts: ImportOptions = { dagId: ir.dag_id, dagDesc: ir.dag_desc };
  return tasksToDAG(parsed, opts);
}

export function parseIRFile(content: string): SpecIR {
  const ir = JSON.parse(content);
  if (ir.schema_version !== 1) {
    throw new Error(`Unsupported spec-compiled schema version: ${ir.schema_version}`);
  }
  if (!Array.isArray(ir.tasks) || ir.tasks.length === 0) {
    throw new Error('spec-compiled.json has no tasks');
  }
  if (!ir.dag_id) {
    throw new Error('spec-compiled.json missing dag_id');
  }
  return ir as SpecIR;
}
