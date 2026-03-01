// @module cli/commands/receipts
// @exports run
// @entry roadmap/cli/commands/receipts

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CompletionStore } from '../../lib/completion-context.ts';
import { listNodeReceipts } from '../../lib/receipts-ux.ts';
import type { Graph } from '../../protocol.ts';

// --- Command ---

export function run(args: string[], repoRoot: string): void {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    console.log(JSON.stringify({ ok: false, error: 'No roadmap found at .roadmap/head.json' }));
    process.exit(1);
  }

  const sub = args[0];
  if (sub === 'show') return showReceipt(args.slice(1), repoRoot);
  if (sub === 'list' || !sub) return listReceipts(args.slice(sub ? 1 : 0), repoRoot);

  console.log(JSON.stringify({
    ok: false,
    error: `Unknown receipts subcommand: ${sub}`,
    fix: 'Usage: cli receipts list [--node <id>] | cli receipts show <node-id>',
  }));
  process.exit(1);
}

function listReceipts(args: string[], repoRoot: string): void {
  const dag: Graph<string> = JSON.parse(readFileSync(join(repoRoot, '.roadmap', 'head.json'), 'utf-8'));
  const store = CompletionStore.loadOrEmpty(repoRoot);
  const allNodes = Object.keys(dag.nodes);

  const nodeIdx = args.indexOf('--node');
  const filterNode = nodeIdx !== -1 ? args[nodeIdx + 1] : undefined;

  const receipts: Array<{
    nodeId: string;
    completedAt?: string;
    owner?: string;
    passing: boolean;
    checks: number;
    gitSha?: string;
  }> = [];

  for (const id of allNodes) {
    if (filterNode && id !== filterNode) continue;
    const record = store.record(id);
    if (!record) continue;
    receipts.push({
      nodeId: id,
      completedAt: record.completedAt,
      owner: record.owner,
      passing: store.hasPassing(id),
      checks: (record.validationChecks ?? []).length,
      gitSha: record.gitSha,
    });
  }

  console.log(JSON.stringify({ ok: true, cmd: 'receipts.list', data: { receipts, count: receipts.length } }));
}

function showReceipt(args: string[], repoRoot: string): void {
  const nodeId = args[0];
  if (!nodeId) {
    console.log(JSON.stringify({ ok: false, error: 'Missing node ID', fix: 'cli receipts show <node-id>' }));
    process.exit(1);
  }

  const dag: Graph<string> = JSON.parse(readFileSync(join(repoRoot, '.roadmap', 'head.json'), 'utf-8'));
  const nodes = dag.nodes as Record<string, unknown>;
  if (!nodes[nodeId]) {
    console.log(JSON.stringify({ ok: false, error: `Node "${nodeId}" not found in DAG` }));
    process.exit(1);
  }

  const store = CompletionStore.loadOrEmpty(repoRoot);
  const record = store.record(nodeId);
  const fileReceipts = listNodeReceipts(repoRoot, nodeId);

  console.log(JSON.stringify({
    ok: true,
    cmd: 'receipts.show',
    data: {
      nodeId,
      completion: record ? {
        completedAt: record.completedAt,
        owner: record.owner,
        passing: store.hasPassing(nodeId),
        failing: store.hasFailing(nodeId),
        gitSha: record.gitSha,
        checks: record.validationChecks ?? [],
      } : null,
      fileReceipts,
    },
  }));
}
