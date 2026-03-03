// @module errors
// @exports RoadmapError, ErrorCode
// @types ErrorCode, RoadmapErrorContext
// @entry roadmap (re-exported)

export type ErrorCode =
  | 'POSITION_MISMATCH'
  | 'CONTRACT_VIOLATION'
  | 'CYCLE_DETECTED'
  | 'NODE_NOT_FOUND'
  | 'INIT_MISSING'
  | 'TERM_MISSING'
  | 'INIT_TERM_SAME'
  | 'MERGE_CONFLICT'
  | 'BRANCH_INVALID'
  | 'VALIDATION_FAILED'
  | 'HANDOFF_MISSING'
  | 'DAG_DISCONNECTED'
  | 'NO_ORIGIN'
  | 'ORIGIN_INVALID';

export interface RoadmapErrorContext {
  /** What was attempted */
  attempted?: string;
  /** Current state */
  current?: string;
  /** How to fix it */
  fix?: string;
  /** Which import/entry point to use */
  entry?: string;
  /** Additional structured data */
  [key: string]: unknown;
}

export class RoadmapError extends Error {
  readonly code: ErrorCode;
  readonly context: RoadmapErrorContext;

  constructor(code: ErrorCode, context: RoadmapErrorContext, message?: string) {
    const msg = message || formatMessage(code, context);
    super(msg);
    this.name = 'RoadmapError';
    this.code = code;
    this.context = context;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

function formatMessage(code: ErrorCode, ctx: RoadmapErrorContext): string {
  const parts: string[] = [code];
  if (ctx.attempted) parts.push(`attempted: ${ctx.attempted}`);
  if (ctx.current) parts.push(`current: ${ctx.current}`);
  if (ctx.fix) parts.push(`fix: ${ctx.fix}`);
  if (ctx.entry) parts.push(`entry: ${ctx.entry}`);
  return parts.join('. ');
}
