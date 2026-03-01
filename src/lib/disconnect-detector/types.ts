// Disconnect detection types

export interface DAGMismatch {
  type: 'state-divergence' | 'orphaned-dag' | 'stale-head' | 'completion-mismatch';
  dagId?: string;
  detail: string;
  severity: 'error' | 'warn' | 'info';
}

export interface DAGSubsystemReport {
  timestamp: number;
  dagId: string;
  headSha: string;
  mismatches: DAGMismatch[];
  healthy: boolean;
}

export interface DisconnectReport {
  timestamp: number;
  summary: string;
  findings: {
    dag?: DAGSubsystemReport;
    files?: unknown;
    imports?: unknown;
    completion?: unknown;
    validation?: unknown;
    intent?: unknown;
  };
  recommendations: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface RepairOperation {
  id: string;
  type: 'move' | 'update' | 'delete' | 'create' | 'migrate';
  target: string;
  action: string;
  destructive: boolean;
  approvalRequired: boolean;
}

export interface RepairResult {
  operationId: string;
  success: boolean;
  error?: string;
  appliedAt: number;
  rollbackInfo?: {
    reversible: boolean;
    method?: string;
  };
}
