// @module checkpoint-runtime
// @description Wires CheckpointManager + AuditTrail into the node completion flow
// @exports completeWithCheckpoint, CheckpointRuntime
// @entry roadmap/recovery

import { CheckpointManager } from './lib/checkpoint.ts';
import { AuditTrail, type AuditEntry } from './lib/audit/trail.ts';
import { saveCompletionWithEvidence, type EvidenceRecord } from './lib/evidence/completion-evidence.ts';
import type { Graph, NodeSpec } from './protocol.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CompleteOptions {
  repoRoot: string;
  nodeId: string;
  agent: string;
  owner?: string;
  checks?: EvidenceRecord[];
}

export interface CompleteResult {
  checkpointId: string;
  nodeId: string;
  artifacts: string[];
  duration: number;
  success: boolean;
}

/**
 * Runtime that binds CheckpointManager + AuditTrail to the completion flow.
 * Instantiate once per session, call completeNode() for each node.
 */
export class CheckpointRuntime {
  private manager: CheckpointManager;
  private trail: AuditTrail;
  private repoRoot: string;
  private agent: string;
  private sessionStarted = false;

  constructor(repoRoot: string, agent: string) {
    this.repoRoot = repoRoot;
    this.agent = agent;
    this.manager = new CheckpointManager(repoRoot);
    this.trail = new AuditTrail(repoRoot);
  }

  /**
   * Start audit session. Must be called before completeNode().
   */
  startSession(restoredFrom?: string): void {
    this.trail.startSession(this.agent, restoredFrom);
    this.sessionStarted = true;
  }

  /**
   * Complete a node: save checkpoint, record audit entry, persist completion evidence.
   */
  async completeNode<T extends string>(
    graph: Graph<T>,
    nodeId: T,
    checks: EvidenceRecord[] = [],
    owner?: string,
  ): Promise<CompleteResult> {
    if (!this.sessionStarted) {
      this.startSession();
    }

    const node = graph.nodes[nodeId] as NodeSpec<T, typeof nodeId> | undefined;
    if (!node) {
      throw new Error(`Node not found in graph: ${nodeId}`);
    }

    const artifacts = (node.produces ?? []) as string[];
    const startTime = Date.now();
    const allPassed = checks.length === 0 || checks.every(c => c.passed);

    // Verify produced artifacts exist
    const missingArtifacts: string[] = [];
    for (const artifact of artifacts) {
      const artifactPath = join(this.repoRoot, artifact);
      if (!existsSync(artifactPath)) {
        missingArtifacts.push(artifact);
      }
    }

    const success = allPassed && missingArtifacts.length === 0;
    const duration = Date.now() - startTime;

    // Save checkpoint
    const checkpoint = await this.manager.saveCheckpoint({
      position: [nodeId],
      phase: nodeId,
      artifacts,
      agent: this.agent,
      duration,
      success,
      error: !success
        ? missingArtifacts.length > 0
          ? `Missing artifacts: ${missingArtifacts.join(', ')}`
          : `Validation failed: ${checks.filter(c => !c.passed).map(c => c.rule).join(', ')}`
        : undefined,
    });

    // Record audit entry
    const auditEntry: AuditEntry = {
      nodeId,
      status: success ? 'complete' : 'failed',
      duration,
      artifacts: checkpoint.artifacts.map(a => ({ path: a.path, hash: a.hash })),
      validation: checks.length > 0
        ? { type: checks.map(c => c.rule).join('+'), passed: allPassed }
        : undefined,
      error: !success
        ? missingArtifacts.length > 0
          ? `Missing: ${missingArtifacts.join(', ')}`
          : `Failed checks: ${checks.filter(c => !c.passed).map(c => c.rule).join(', ')}`
        : undefined,
    };
    this.trail.record(auditEntry);

    // Persist completion with evidence (links checkpoint ID)
    saveCompletionWithEvidence(
      this.repoRoot,
      nodeId,
      checks,
      owner ?? this.agent,
      checkpoint.id,
    );

    return {
      checkpointId: checkpoint.id,
      nodeId,
      artifacts,
      duration,
      success,
    };
  }

  /**
   * Restore from latest checkpoint if available.
   */
  async restoreLatest(): Promise<{ nodeId: string; checkpointId: string } | null> {
    const result = await this.manager.restore();
    if (!result) return null;

    // Start session noting restoration
    this.startSession(result.checkpoint.id);

    return {
      nodeId: result.position[0] ?? '',
      checkpointId: result.checkpoint.id,
    };
  }

  /**
   * End the audit session and flush trail to disk.
   */
  async endSession(): Promise<void> {
    if (this.sessionStarted) {
      await this.trail.endSession();
      this.sessionStarted = false;
    }
  }

  /**
   * Access underlying AuditTrail for queries (failed phases, artifacts, duration).
   */
  getTrail(): AuditTrail {
    return this.trail;
  }
}

/**
 * One-shot: complete a node with checkpoint + audit in a single call.
 * For scripts that don't need session lifecycle management.
 */
export async function completeWithCheckpoint<T extends string>(
  graph: Graph<T>,
  opts: CompleteOptions,
): Promise<CompleteResult> {
  const runtime = new CheckpointRuntime(opts.repoRoot, opts.agent);
  runtime.startSession();
  const result = await runtime.completeNode(graph, opts.nodeId as T, opts.checks ?? [], opts.owner);
  await runtime.endSession();
  return result;
}
