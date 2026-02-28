// @module batch-conflicts
// @exports detectBatchConflicts, BatchConflict, BatchConflictReport
// @types BatchConflict, BatchConflictReport
// @entry roadmap

export interface BatchConflict {
  file: string;
  writers: string[];
  type: 'produces-overlap';
}

export interface BatchConflictReport {
  level: number;
  conflicts: BatchConflict[];
}

/**
 * Detect when two or more nodes in the same batch both write the same file.
 * Returns conflicts array — non-empty = gate rejects batch before execution.
 */
export function detectBatchConflicts(
  batch: Array<{ nodeId: string; produces: string[] }>,
): BatchConflict[] {
  const fileWriters = new Map<string, string[]>();
  for (const node of batch) {
    for (const file of node.produces) {
      const writers = fileWriters.get(file) ?? [];
      writers.push(node.nodeId);
      fileWriters.set(file, writers);
    }
  }
  const conflicts: BatchConflict[] = [];
  for (const [file, writers] of fileWriters) {
    if (writers.length > 1) {
      conflicts.push({ file, writers, type: 'produces-overlap' });
    }
  }
  return conflicts;
}
