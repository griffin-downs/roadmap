/**
 * roadmap/recovery — checkpoint/restore + audit trail
 *
 * Use this entry when you need crash recovery or append-only evidence logging.
 * Does not include core DAG functions (use roadmap/protocol for those).
 */

export { CheckpointManager } from './lib/checkpoint.ts';
export { AuditTrail } from './lib/audit/trail.ts';

export type { GitState, Checkpoint } from './lib/checkpoint.schema.ts';
export type { AuditEntry, AuditSession } from './lib/audit/trail.ts';
