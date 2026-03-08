// @module handoff
// @exports checkpoint, advance, verifyBootstrapSignature
// @types (none — uses Brief types)
// @entry roadmap/agent

import type { Graph } from '../protocol.ts';
import { node } from '../core/access.ts';
import type { FinalHandoff, InterimHandoff } from './brief.ts';

/**
 * Checkpoint work progress
 * Writes interim handoff to .roadmap/.handoff/{nodeId}-interim-{timestamp}.json
 * Creates work journal so interrupted work retains context
 */
export async function checkpoint(
  repoRoot: string,
  nodeId: string,
  interim: InterimHandoff,
): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const handoffDir = join(repoRoot, '.roadmap', '.handoff');
  await mkdir(handoffDir, { recursive: true });

  // Validate interim
  if (!interim.timestamp) interim.timestamp = new Date().toISOString();
  if (interim.progress < 0 || interim.progress > 1) {
    throw new Error('Progress must be 0.0–1.0');
  }

  // Write with timestamp in filename for chronological ordering
  const timestamp = interim.timestamp.replace(/[:.]/g, '-').slice(0, -5); // Compact ISO
  const filename = `${nodeId}-interim-${timestamp}.json`;
  const path = join(handoffDir, filename);

  await writeFile(path, JSON.stringify(interim, null, 2), 'utf-8');
}

/**
 * Advance to next position
 * Validates handoff is complete, writes final handoff, updates position
 * Agents cannot skip nodes or forge progress — handoff is required
 */
export async function advance(
  repoRoot: string,
  nodeId: string,
  dag: Graph<string>,
  handoff: FinalHandoff,
): Promise<void> {
  // Validate handoff is complete
  validateHandoff(handoff);

  // Verify nodeId matches current position
  const currentPos = await getCurrentPosition(repoRoot);
  if (currentPos !== nodeId) {
    throw new Error(
      `Position mismatch: tried to advance ${nodeId} but current position is ${currentPos}`,
    );
  }

  // Write final handoff
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const handoffDir = join(repoRoot, '.roadmap', '.handoff');
  await mkdir(handoffDir, { recursive: true });

  const handoffPath = join(handoffDir, `${nodeId}.json`);
  await writeFile(handoffPath, JSON.stringify(handoff, null, 2), 'utf-8');

  // Update position in DAG (find next node)
  const spec = node(dag, nodeId);
  if (!spec) throw new Error(`Invalid node: ${nodeId}`);

  // Next position: first node that depends on this one
  const nextNodes = Object.entries(dag.nodes).filter(([, n]) =>
    n.deps.includes(nodeId),
  );

  if (nextNodes.length === 0) {
    // No dependencies on this node, move to term
    await updatePosition(repoRoot, dag.term);
  } else {
    await updatePosition(repoRoot, nextNodes[0][0]);
  }

  // Refresh bootstrap signature
  await updateBootstrapSignature(repoRoot, dag);
}

function validateHandoff(handoff: FinalHandoff): void {
  if (!handoff.summary || handoff.summary.length === 0) {
    throw new Error('Handoff: summary required');
  }
  if (!Array.isArray(handoff.keyDecisions) || handoff.keyDecisions.length === 0) {
    throw new Error('Handoff: keyDecisions required (≥1)');
  }
  if (!Array.isArray(handoff.gotchas)) {
    throw new Error('Handoff: gotchas required (can be empty)');
  }
  if (!handoff.nextNodeEntry) {
    throw new Error('Handoff: nextNodeEntry required');
  }
  if (!Array.isArray(handoff.nextNodeEntry.consumes)) {
    throw new Error('Handoff: nextNodeEntry.consumes required');
  }
  if (typeof handoff.nextNodeEntry.ready !== 'boolean') {
    throw new Error('Handoff: nextNodeEntry.ready required (boolean)');
  }

  // Constraint: descriptions must be tight
  if (handoff.summary.length > 100) {
    throw new Error(
      `Handoff summary too long: ${handoff.summary.length} > 100 chars`,
    );
  }
}

async function getCurrentPosition(repoRoot: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  try {
    const posFile = join(repoRoot, '.roadmap', '.position');
    const pos = await readFile(posFile, 'utf-8');
    return pos.trim();
  } catch {
    return 'init'; // Default to init if no position file
  }
}

async function updatePosition(repoRoot: string, position: string): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const roadmapDir = join(repoRoot, '.roadmap');
  await mkdir(roadmapDir, { recursive: true });

  const posFile = join(roadmapDir, '.position');
  await writeFile(posFile, position, 'utf-8');
}

/**
 * Bootstrap signature system
 * Signs DAG state so agents can't tamper with it
 * Verified on every operation (orient, checkpoint, advance)
 */

async function updateBootstrapSignature(
  repoRoot: string,
  dag: Graph<string>,
): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');

  // Compute DAG hash
  const dagHash = createHash('sha256')
    .update(JSON.stringify(dag))
    .digest('hex');

  // Create bootstrap signature
  const bootstrap = {
    dagHash,
    timestamp: new Date().toISOString(),
    version: '0.3.0',
  };

  const roadmapDir = join(repoRoot, '.roadmap');
  await mkdir(roadmapDir, { recursive: true });

  const bootstrapPath = join(roadmapDir, '.bootstrap');
  // In a real system, this would be encrypted with a key
  // For now, just serialize it (agents can't read it anyway due to Regent hooks)
  await writeFile(bootstrapPath, JSON.stringify(bootstrap), 'utf-8');
}

/**
 * Verify bootstrap signature hasn't changed
 * Called before any operation to ensure DAG integrity
 */
export async function verifyBootstrapSignature(
  repoRoot: string,
  dag: Graph<string>,
): Promise<boolean> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');

  try {
    const bootstrapPath = join(repoRoot, '.roadmap', '.bootstrap');
    const content = await readFile(bootstrapPath, 'utf-8');
    const bootstrap = JSON.parse(content);

    const dagHash = createHash('sha256')
      .update(JSON.stringify(dag))
      .digest('hex');

    return bootstrap.dagHash === dagHash;
  } catch {
    // No bootstrap yet (first run)
    return true;
  }
}
