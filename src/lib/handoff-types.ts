// @module handoff-types
// @types InterimHandoff, FinalHandoff
// @entry roadmap/agent

export interface InterimHandoff {
  /** ISO 8601 timestamp when checkpoint was created */
  timestamp: string;
  /** Progress 0.0–1.0 */
  progress: number;
  /** New findings since last interim */
  discovered: string[];
  /** Current stuck points */
  blockers: string[];
  /** File currently being edited */
  currentFile: string;
  /** Estimated remaining minutes */
  estimatedTimeRemaining?: number;
}

export interface FinalHandoff extends InterimHandoff {
  /** 1–2 sentence summary of what was built (≤100 chars) */
  summary: string;
  /** Why this design: 3–5 key decisions */
  keyDecisions: string[];
  /** What tripped us up and how we solved it */
  gotchas: string[];
  /** Entry requirements for next node */
  nextNodeEntry: {
    /** Files actually produced */
    consumes: string[];
    /** Is next node unblocked? */
    ready: boolean;
    /** Issues next agent will encounter */
    blockers?: string[];
  };
}
