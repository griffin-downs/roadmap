// @module audit
// @exports AuditTrail, createAuditTrail, runAuditIngest, parseTranscript, runAuditRecommend, scanSurface, buildImportGraph, scoreArchival, deriveLayout, generateMovePlan
// @entry roadmap/audit

// Session audit trail
export { AuditTrail, createAuditTrail } from './trail.ts';
export type { AuditEntry, AuditSession } from './trail.ts';

// Transcript ingest
export { runAuditIngest, parseTranscript } from './ingest.ts';
export type { AuditIngestOptions } from './ingest.ts';

// Recommendations
export { runAuditRecommend } from './recommend.ts';
export type { AuditRecommendation, AuditRecommendResult, AuditRecommendReceipt } from './recommend.ts';

// Engine (directory scan, import graph)
export { scanSurface, buildImportGraph, scoreArchival } from './audit-engine.ts';
export type { ArchivalScore, ImportGraph } from './audit-engine.ts';

// Layout planning
export { deriveLayout, generateMovePlan } from './layout-plan.ts';
export type { TargetLayout, MovePlan, MoveEntry, LayoutBucket } from './layout-plan.ts';
