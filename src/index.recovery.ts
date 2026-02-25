/**
 * roadmap/recovery — checkpoint/restore + audit trail
 *
 * Use this entry when you need crash recovery or append-only evidence logging.
 * Does not include core DAG functions (use roadmap/protocol for those).
 */

export { CheckpointManager } from './checkpoint.ts';
export { AuditTrail } from './audit.ts';

export type { GitState, Checkpoint } from './checkpoint.schema.ts';
export type { AuditEntry, AuditSession } from './audit.ts';
