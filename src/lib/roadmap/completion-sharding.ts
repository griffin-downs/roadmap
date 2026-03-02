// @module completion-sharding
// @exports writeCompletion, readShards
// @types CompletionRecord
// @entry roadmap/optimization

import { type CompletionRecord, validateCompletionRecord, readShards as readShardsSchema } from './completion-sharding.schema.ts';

export type { CompletionRecord } from './completion-sharding.schema.ts';
export { readShards } from './completion-sharding.schema.ts';

/**
 * Write a completion record atomically to per-agent shard file
 * Appends JSON line to .roadmap/completions/{agentId}.jsonl
 * No locking — relies on atomic append semantics
 */
export async function writeCompletion(
  repoRoot: string,
  agentId: string,
  nodeId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  artifacts: string[],
  checkpointId: string,
): Promise<void> {
  const { appendFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const completionsDir = join(repoRoot, '.roadmap', 'completions');
  await mkdir(completionsDir, { recursive: true });

  const record: CompletionRecord = {
    timestamp: new Date().toISOString(),
    agentId,
    nodeId,
    status,
    artifacts,
    checkpointId,
  };

  const line = JSON.stringify(record) + '\n';
  const filePath = join(completionsDir, `${agentId}.jsonl`);

  // Atomic append with 'a' flag ensures data consistency
  try {
    await appendFile(filePath, line, { flag: 'a' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOSPC') {
      throw new Error(`Disk full writing completion shard for agent ${agentId}`);
    }
    if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied writing completion shard for agent ${agentId}`);
    }
    throw err;
  }
}

/**
 * Read all completion shards and merge into unified record map by nodeId
 * Returns map: nodeId -> array of completion records (all agents)
 */
export async function mergeShards(
  repoRoot: string,
): Promise<Map<string, CompletionRecord[]>> {
  const { join } = await import('node:path');
  const completionsDir = join(repoRoot, '.roadmap', 'completions');

  const shards = await readShardsSchema(completionsDir);
  const merged = new Map<string, CompletionRecord[]>();

  for (const records of shards.values()) {
    for (const record of records) {
      if (!merged.has(record.nodeId)) {
        merged.set(record.nodeId, []);
      }
      merged.get(record.nodeId)!.push(record);
    }
  }

  return merged;
}

/**
 * Get latest completion record for a specific node across all agents
 * Returns most recent record by timestamp for the node, or null if not found
 */
export async function getLatestCompletion(
  repoRoot: string,
  nodeId: string,
): Promise<CompletionRecord | null> {
  const merged = await mergeShards(repoRoot);
  const records = merged.get(nodeId);

  if (!records || records.length === 0) return null;

  // Sort by timestamp descending, take first
  const sorted = [...records].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return sorted[0] || null;
}

/**
 * Get all completion records for a specific node across all agents
 */
export async function getNodeCompletions(
  repoRoot: string,
  nodeId: string,
): Promise<CompletionRecord[]> {
  const merged = await mergeShards(repoRoot);
  return merged.get(nodeId) || [];
}

/**
 * Get completion records for a specific agent
 */
export async function getAgentCompletions(
  repoRoot: string,
  agentId: string,
): Promise<CompletionRecord[]> {
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');

  const filePath = join(repoRoot, '.roadmap', 'completions', `${agentId}.jsonl`);

  if (!existsSync(filePath)) {
    return [];
  }

  const records: CompletionRecord[] = [];
  try {
    const content = await readFile(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (validateCompletionRecord(parsed)) {
          records.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied reading completions for agent ${agentId}`);
    }
    throw err;
  }

  return records;
}
