// @module terminal-audit/validator
// @description Terminal audit stub — computed/detected modules removed (dead after chain-terminal refactor)
// @exports TerminalAuditContext, runAudit

// Retained as a minimal stub so terminal-brief.ts can still call runAudit()
// without importing the deleted computed.ts / detected.ts modules.

/** Informational audit context (stub — no longer performs analysis) */
export interface TerminalAuditContext {
  computed: null;
  detected: null;
}

/**
 * Stub: terminal audit analysis removed.
 * The computed report and gap detection were superseded by chain-terminal.
 */
export function runAudit(): TerminalAuditContext {
  return { computed: null, detected: null };
}
