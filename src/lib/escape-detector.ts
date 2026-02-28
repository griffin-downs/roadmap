// @module escape-detector
// @exports EscapeEventType, MissingReceiptType, EscapeEvent, GovernanceBreach, GovernanceBreachReceipt, EscapeDetectorConfig, DEFAULT_ESCAPE_DETECTOR_CONFIG, GOVERNANCE_BREACH_PREFIX, isGovernanceBreach, isGovernanceBreachReceipt
// @types EscapeEventType, MissingReceiptType, EscapeEvent, GovernanceBreach, GovernanceBreachReceipt, EscapeDetectorConfig
// @entry roadmap

// Detects commits or tool calls that occur outside roadmap governance.
// Types model escape events, governance breaches, and breach receipts.

/** Classification of how governance was bypassed. */
export type EscapeEventType =
  | 'UNACCOUNTED_COMMIT'
  | 'OUT_OF_BOUNDS_TOOL'
  | 'DIRECT_GIT_COMMIT';

/** Receipt types that should have been present but were missing. */
export type MissingReceiptType =
  | 'plan-select'
  | 'dispatch'
  | 'intake'
  | 'spec-origin';

/** A single detected escape from governance. */
export interface EscapeEvent {
  eventType: EscapeEventType;
  sha?: string;
  tool?: string;
  missingReceiptTypes: MissingReceiptType[];
  timestamp: string;
  detail: string;
}

/** An aggregated breach comprising one or more escape events. */
export interface GovernanceBreach {
  breachId: string;
  sha: string;
  events: EscapeEvent[];
  timestamp: string;
  sessionId?: string;
  resolved: boolean;
}

/** Persisted receipt for a governance breach, written to .roadmap/receipts/. */
export interface GovernanceBreachReceipt {
  schemaVersion: 1;
  receiptType: 'governance-breach';
  breachId: string;
  sha: string;
  eventTypes: EscapeEventType[];
  missingReceiptTypes: MissingReceiptType[];
  timestamp: string;
  resolved: boolean;
}

/** Runtime configuration for the escape detector. */
export interface EscapeDetectorConfig {
  strictMode: boolean;
  autoIntake: boolean;
  blockAdvanceOnBreach: boolean;
  blockMergeOnBreach: boolean;
}

export const DEFAULT_ESCAPE_DETECTOR_CONFIG: EscapeDetectorConfig = {
  strictMode: false,
  autoIntake: true,
  blockAdvanceOnBreach: false,
  blockMergeOnBreach: true,
};

export const GOVERNANCE_BREACH_PREFIX = 'governance-breach' as const;

/** Runtime type guard for GovernanceBreach. */
export function isGovernanceBreach(x: unknown): x is GovernanceBreach {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.breachId === 'string' &&
    typeof o.sha === 'string' &&
    Array.isArray(o.events) &&
    typeof o.timestamp === 'string' &&
    typeof o.resolved === 'boolean'
  );
}

/** Runtime type guard for GovernanceBreachReceipt. */
export function isGovernanceBreachReceipt(x: unknown): x is GovernanceBreachReceipt {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.schemaVersion === 1 &&
    o.receiptType === 'governance-breach' &&
    typeof o.breachId === 'string' &&
    typeof o.sha === 'string' &&
    Array.isArray(o.eventTypes) &&
    Array.isArray(o.missingReceiptTypes) &&
    typeof o.timestamp === 'string' &&
    typeof o.resolved === 'boolean'
  );
}
