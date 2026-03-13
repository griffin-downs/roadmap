// @module fleet-types
// @description Fleet manifest and loop receipt type definitions
// @exports FleetManifest, FleetRepoEntry, FleetStatus, FleetFrontierNode, RepoStatus, LoopReceipt, MiningFindings, GenerationRecord, parseFleetManifest, parseLoopReceipt
// @entry roadmap

import { z } from 'zod';

// --- Fleet Manifest ---

export const FleetRepoEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  request: z.string().optional(),
});
export type FleetRepoEntry = z.infer<typeof FleetRepoEntrySchema>;

export const FleetManifestSchema = z.object({
  compiler: z.string(),
  repos: z.array(FleetRepoEntrySchema).min(1),
});
export type FleetManifest = z.infer<typeof FleetManifestSchema>;

// --- Fleet Status (orient --fleet output) ---

export const ActiveDAGSummarySchema = z.object({
  dagId: z.string(),
  desc: z.string().optional(),
});
export type ActiveDAGSummary = z.infer<typeof ActiveDAGSummarySchema>;

export const RepoStatusSchema = z.object({
  name: z.string(),
  path: z.string(),
  dagId: z.string().nullable(),
  status: z.enum(['active', 'complete', 'stalled', 'no-dag']),
  level: z.number().nullable(),
  batch: z.array(z.string()).optional(),
  stalledAt: z.string().optional(),
  reason: z.string().optional(),
  done: z.number().optional(),
  remaining: z.number().optional(),
  activeDAGs: z.array(ActiveDAGSummarySchema).optional(),
});
export type RepoStatus = z.infer<typeof RepoStatusSchema>;

export const FleetFrontierNodeSchema = z.object({
  repo: z.string(),
  dagId: z.string(),
  nodeId: z.string(),
  produces: z.array(z.string()),
});
export type FleetFrontierNode = z.infer<typeof FleetFrontierNodeSchema>;

export const FleetStatusSchema = z.object({
  iteration: z.number(),
  compiler: z.object({ repo: z.string(), headCommit: z.string().nullable() }),
  repos: z.array(RepoStatusSchema),
  loopReady: z.boolean(),
  blockers: z.array(z.string()),
  globalFrontier: z.array(FleetFrontierNodeSchema).optional(),
});
export type FleetStatus = z.infer<typeof FleetStatusSchema>;

// --- Loop Receipt ---

export const GenerationRecordSchema = z.object({
  repo: z.string(),
  dagId: z.string(),
  headCommit: z.string().nullable(),
  status: z.enum(['active', 'complete', 'stalled']),
  stalledAt: z.string().optional(),
});
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;

export const MiningFindingsSchema = z.object({
  extracted: z.array(z.string()),
  requestFixes: z.array(z.string()),
  stalled: z.array(z.object({
    repo: z.string(),
    node: z.string(),
    reason: z.string(),
  })),
  observations: z.array(z.string()).optional(),
});
export type MiningFindings = z.infer<typeof MiningFindingsSchema>;

export const LoopReceiptSchema = z.object({
  iteration: z.number().int().nonnegative(),
  startedAt: z.string(),
  closedAt: z.string().optional(),
  compilerCommit: z.string(),
  generations: z.array(GenerationRecordSchema),
  mining: MiningFindingsSchema.optional(),
  previousSha: z.string().nullable(),
  sha: z.string().optional(),
});
export type LoopReceipt = z.infer<typeof LoopReceiptSchema>;

// --- Parsers ---

export function parseFleetManifest(data: unknown): FleetManifest {
  return FleetManifestSchema.parse(data);
}

export function parseLoopReceipt(data: unknown): LoopReceipt {
  return LoopReceiptSchema.parse(data);
}
