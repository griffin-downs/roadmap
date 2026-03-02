/**
 * Completion sharding schema: per-agent JSONL completion records
 */

export interface CompletionRecord {
  readonly timestamp: string; // ISO8601
  readonly agentId: string;
  readonly nodeId: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
  readonly artifacts: readonly string[];
  readonly checkpointId: string;
}

export function validateCompletionRecord(r: unknown): r is CompletionRecord {
  if (!r || typeof r !== 'object') return false;
  const rec = r as Record<string, unknown>;
  const validArtifacts = Array.isArray(rec.artifacts) &&
    rec.artifacts.every(a => typeof a === 'string');
  const validStatus = ['pending', 'in_progress', 'completed', 'failed'].includes(rec.status as string);
  return (
    typeof rec.timestamp === 'string' &&
    typeof rec.agentId === 'string' &&
    typeof rec.nodeId === 'string' &&
    validStatus &&
    validArtifacts &&
    typeof rec.checkpointId === 'string'
  );
}

export async function readShards(completionsDir: string): Promise<Map<string, CompletionRecord[]>> {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { existsSync } = await import('node:fs');

  if (!existsSync(completionsDir)) {
    return new Map();
  }

  const shards = new Map<string, CompletionRecord[]>();
  const files = await readdir(completionsDir);

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;

    const agentId = file.replace('.jsonl', '');
    const filePath = join(completionsDir, file);
    const content = await readFile(filePath, 'utf-8');
    const records: CompletionRecord[] = [];

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

    shards.set(agentId, records);
  }

  return shards;
}
