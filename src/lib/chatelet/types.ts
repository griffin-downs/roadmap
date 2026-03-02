// @module chatelet
// @exports KeepBudget, KeepBudgetViolation, ChateletError, ValidationResult
// @types KeepBudget, KeepBudgetViolation, ChateletError, ValidationResult
// @entry roadmap/chatelet

export interface KeepBudget {
  version: "1.0";
  keep: {
    maxFiles: number;
    maxLineCount: number;
    allowedDirs: string[];
  };
  packs: {
    discoveryRoot: string;
    maxSize: number;
  };
  gitsafe: {
    denylist: string[];
    maxBytes: number;
  };
}

export interface KeepBudgetViolation {
  type: 'file-count-exceeded' | 'line-count-exceeded' | 'forbidden-directory' | 'oversized-file';
  severity: 'error' | 'warn';
  message: string;
  remediation?: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: Record<string, unknown>;
}

export class ChateletError extends Error {
  constructor(
    public code: string,
    public context: Record<string, unknown>
  ) {
    super(`ChateletError[${code}]: ${JSON.stringify(context)}`);
    this.name = 'ChateletError';
  }
}
