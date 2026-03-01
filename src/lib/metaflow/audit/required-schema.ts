// @module metaflow/audit
// @exports AuditContract, DetectorResult, AuditReport, AuditReceipt
// @types AuditContract, DetectorResult, AuditReport, AuditReceipt
// @entry roadmap

export interface AuditContract {
  schema_version: 1;
  version: string;
  thresholds: { latencyP95MaxMs: number; toolCallInflationMax: number; orientChurnMax: number };
  requiredDetectors: string[];
  requiredTerminalNodeId: string;
  bindFields: ['treeSha', 'sessionIds', 'runId'];
}

export interface DetectorResult {
  code: string;
  passed: boolean;
  evidence: string[];
  fix: string[];
}

export interface AuditReport {
  schema_version: 1;
  runId: string;
  treeSha: string;
  sessionIds: string[];
  computedAt: string;
  passed: boolean;
  detectorResults: DetectorResult[];
}

export interface AuditReceipt {
  schema_version: 1;
  runId: string;
  treeSha: string;
  sessionIds: string[];
  passed: boolean;
  reason?: string;
  reportPath: string;
  emittedAt: string;
}
