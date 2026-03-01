// @module patch-stack-cmd
// @exports runPatchStack, PatchStackOptions
// @entry roadmap

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { PatchRecord, PatchReceipt, NodeCommitMapping } from './patch-stack.ts';
import { PATCH_DIR, PATCH_BRANCH_PREFIX, branchName } from './patch-stack.ts';

export interface PatchStackOptions {
  nodeIds: string[];
  baseSha: string;
  repoRoot: string;
}

export function runPatchStack(options: PatchStackOptions): PatchRecord {
  const { nodeIds, baseSha, repoRoot } = options;

  // Validate baseSha exists
  execFileSync('git', ['cat-file', '-e', baseSha], { cwd: repoRoot, stdio: 'pipe' });

  // Deterministic patchId: sha256(baseSha + sorted nodeIds)
  const sortedIds = [...nodeIds].sort();
  const inputHash = createHash('sha256')
    .update(baseSha + ':' + sortedIds.join(','))
    .digest('hex');
  const patchId = inputHash.slice(0, 6);

  // Create branches
  const branches: string[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    const branch = branchName(patchId, i, nodeIds[i]);
    try {
      execFileSync('git', ['branch', branch, baseSha], { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Branch already exists — skip gracefully
      console.error(`warning: branch ${branch} already exists, skipping`);
    }
    branches.push(branch);
  }

  // Build empty node mappings (commits added by user per node)
  const nodeMapping: NodeCommitMapping[] = nodeIds.map(nodeId => ({
    nodeId,
    commitShas: [],
  }));

  const timestamp = new Date().toISOString();
  const record: PatchRecord = {
    patchId,
    baseSha,
    nodeIds,
    nodeMapping,
    branchPrefix: `${PATCH_BRANCH_PREFIX}/${patchId}`,
    branches,
    timestamp,
    inputHash,
  };

  // Write PatchRecord
  const patchDir = join(repoRoot, PATCH_DIR);
  if (!existsSync(patchDir)) mkdirSync(patchDir, { recursive: true });
  writeFileSync(join(patchDir, `${patchId}.json`), JSON.stringify(record, null, 2) + '\n');

  // Write receipt
  const receipt: PatchReceipt = {
    schemaVersion: 1,
    receiptType: 'patch-stack',
    patchId,
    baseSha,
    nodeIds,
    branchCount: branches.length,
    inputHash,
    timestamp,
  };
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(join(receiptsDir, `patch-stack-${patchId}.json`), JSON.stringify(receipt, null, 2) + '\n');

  return record;
}
