// Unified schema module (consolidated from audit-schema.ts and perf-schema.ts)
// @module schema
// @exports ValidatorRule, PerfReceipt, AuditSchema

export type ValidatorRule = 
  | { type: 'artifact-exists'; path: string }
  | { type: 'artifact-schema'; path: string; schema: string }
  | { type: 'shell'; command: string; description?: string }
  | { type: 'spec-conformance'; spec: string; scenario: string; section: string }
  | { type: 'manual-approval' }
  | { type: 'expanded'; minNodes?: number }
  | { type: 'build-produces'; path: string }
  | { type: 'launch-check'; description?: string }
  | { type: 'intent'; statement: string; expandOnFail?: boolean; prompt?: string[] };

export interface PerfReceipt {
  schema_version: 1;
  tool: 'vitest' | 'tsc' | 'build';
  timestamp: string;
  metrics: {
    duration_ms: number;
    p50: number;
    p95: number;
    hotspots: string[];
  };
}

export interface AuditSchema {
  schema_version: 1;
  findings: Array<{
    kind: string;
    title: string;
    evidence: Array<{ path: string; symbols: string[]; lines: number[] }>;
    proposal: Record<string, unknown>;
    impact: { risk: 'low' | 'med' | 'high'; effortHours: number; benefit: string[] };
  }>;
}

// Validators available in roadmap
export const VALIDATORS: Record<string, ValidatorRule> = {};

// Deprecated: use src/lib/schema.ts instead
// export { ValidatorRule } from './audit-schema';
// export { PerfReceipt } from './perf-schema';
