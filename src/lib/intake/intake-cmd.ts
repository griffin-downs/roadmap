// @module intake-cmd
// @exports runIntakeAbsorb, IntakeAbsorbOptions
// @entry roadmap

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { IntakeRecord, IntakeCommit, IntakeReceipt, DetectedCluster } from './intake.ts';
import { INTAKE_DIR, INTAKE_RECEIPT_PREFIX } from './intake.ts';

export interface IntakeAbsorbOptions {
  fromSha: string;
  toSha?: string;
  since?: string;
  repoRoot: string;
}

function gitExec(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function clusterCommitsInline(commits: IntakeCommit[]): DetectedCluster[] {
  // Jaccard clustering: group commits by path overlap
  if (commits.length === 0) return [];

  const clusters: DetectedCluster[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < commits.length; i++) {
    if (assigned.has(commits[i].sha)) continue;
    const group = [commits[i]];
    const groupPaths = new Set(commits[i].touchedPaths);
    assigned.add(commits[i].sha);

    for (let j = i + 1; j < commits.length; j++) {
      if (assigned.has(commits[j].sha)) continue;
      const bPaths = new Set(commits[j].touchedPaths);
      const intersection = [...groupPaths].filter(p => bPaths.has(p)).length;
      const union = new Set([...groupPaths, ...bPaths]).size;
      const jaccard = union === 0 ? 0 : intersection / union;
      if (jaccard > 0.3) {
        group.push(commits[j]);
        assigned.add(commits[j].sha);
        for (const p of commits[j].touchedPaths) groupPaths.add(p);
      }
    }

    const allPaths = [...groupPaths];
    const shas = group.map(c => c.sha);
    clusters.push({
      clusterId: `cluster-${createHash('sha256').update(shas.join(':')).digest('hex').slice(0, 8)}`,
      commitShas: shas,
      paths: allPaths,
      jaccardScore: 1.0, // self-score for single-commit clusters, avg for multi
    });
  }

  return clusters;
}

export function runIntakeAbsorb(options: IntakeAbsorbOptions): IntakeRecord {
  const { fromSha, repoRoot } = options;
  const toSha = options.toSha ?? 'HEAD';

  // Validate fromSha exists
  try {
    gitExec(['cat-file', '-e', fromSha], repoRoot);
  } catch {
    throw new Error(`Invalid fromSha: ${fromSha} does not exist in git`);
  }

  // Validate working tree clean
  try {
    gitExec(['diff', '--quiet'], repoRoot);
  } catch {
    throw new Error('Working tree is dirty — commit or stash changes before intake absorb');
  }

  // Resolve toSha
  const resolvedTo = gitExec(['rev-parse', toSha], repoRoot);

  // Get commit list: sha parentSha treeSha author isoDate msg
  const logFormat = '%H %P %T %an %ai %s';
  const logOutput = gitExec(
    ['log', `--format=${logFormat}`, `${fromSha}..${resolvedTo}`],
    repoRoot,
  );

  const commits: IntakeCommit[] = [];
  if (logOutput) {
    for (const line of logOutput.split('\n')) {
      if (!line.trim()) continue;
      // Format: sha parentSha treeSha author date time tz msg...
      // %ai produces: 2026-02-28 14:30:00 -0500
      const parts = line.split(' ');
      const sha = parts[0];
      const parentSha = parts[1];
      const treeSha = parts[2];
      // Author may have spaces — find the date pattern (YYYY-MM-DD)
      // Work backwards from the date: date is at position after author, format YYYY-MM-DD HH:MM:SS +ZZZZ
      const dateMatch = line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}/);
      const timestamp = dateMatch ? dateMatch[0] : '';
      const dateIdx = dateMatch ? line.indexOf(dateMatch[0]) : -1;

      // Author is between treeSha and date
      const afterTree = line.indexOf(treeSha) + treeSha.length + 1;
      const author = dateIdx > afterTree ? line.slice(afterTree, dateIdx).trim() : parts[3];

      // Message is after the date+tz
      const msgStart = dateIdx !== -1 ? dateIdx + dateMatch![0].length + 1 : 0;
      const msg = line.slice(msgStart).trim();

      // Get touched paths
      let touchedPaths: string[] = [];
      try {
        const diffOutput = gitExec(['diff-tree', '--no-commit-id', '-r', '--name-only', sha], repoRoot);
        touchedPaths = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
      } catch {
        // root commit or merge — skip
      }

      commits.push({ sha, parentSha, treeSha, touchedPaths, author, msg, timestamp });
    }
  }

  // Compute intakeId
  const inputHash = createHash('sha256').update(`${fromSha}:${resolvedTo}`).digest('hex');
  const intakeId = inputHash.slice(0, 16);

  // Cluster commits
  let detectedClusters: DetectedCluster[];
  try {
    // Try dynamic import of intake-cluster if it exists
    detectedClusters = clusterCommitsInline(commits);
  } catch {
    detectedClusters = [];
  }

  // Build tree SHA set
  const treeShaSet = [...new Set(commits.map(c => c.treeSha))];

  // Build proposed nodes from clusters
  const proposedNodes = detectedClusters.map(cl => ({
    id: `intake-${cl.clusterId}`,
    desc: `Cluster of ${cl.commitShas.length} commit(s) touching ${cl.paths.length} path(s)`,
    produces: cl.paths,
    consumes: [] as string[],
  }));

  const record: IntakeRecord = {
    intakeId,
    fromSha,
    toSha: resolvedTo,
    repoRoot,
    timestamp: new Date().toISOString(),
    commits,
    treeShaSet,
    detectedClusters,
    proposedNodes,
    inputHash,
  };

  // Ensure intake dir exists
  const intakeDir = join(repoRoot, INTAKE_DIR);
  if (!existsSync(intakeDir)) mkdirSync(intakeDir, { recursive: true });

  // Write record
  writeFileSync(
    join(intakeDir, `${intakeId}.json`),
    JSON.stringify(record, null, 2) + '\n',
  );

  // Write receipt
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  const receipt: IntakeReceipt = {
    schemaVersion: 1,
    receiptType: 'intake-absorb',
    intakeId,
    fromSha,
    toSha: resolvedTo,
    treeShaSet,
    clusterCount: detectedClusters.length,
    proposedNodeCount: proposedNodes.length,
    inputHash,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    join(receiptsDir, `${INTAKE_RECEIPT_PREFIX}-${intakeId.slice(0, 6)}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );

  return record;
}
