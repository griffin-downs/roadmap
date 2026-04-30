// @module cli/dag
// @description DAG mutation commands: insert, remove, modify, log.
// @exports run

import { basename } from 'node:path';
import { insertNode, removeNode, modifyNode, commitMutation, loadMutationLog, MutationError } from '../lib/dag-mutator.ts';
import { requireValidOrigin } from '../lib/intake/runtime-gate.ts';
import { emit, ErrorCode, type OutputOpts } from '../lib/cli-envelope.ts';
import { lookupSchema, schemaToJsonSchema } from '../lib/schemas.ts';
import { loadDAG, appendTrail, json, hasFlag } from './shared.ts';

function schemaFields(key: string): { schema?: object; example?: object } {
  const s = lookupSchema(key);
  if (!s?.input) return {};
  const result: { schema?: object; example?: object } = { schema: schemaToJsonSchema(s.input) };
  if (s.examples?.[0]?.input) result.example = s.examples[0].input;
  return result;
}

export async function run(
  args: string[],
  repoRoot: string,
  note: string | undefined,
  hasLocalDAG: boolean,
  outputOpts: OutputOpts,
): Promise<void> {
  const sub = args[1];
  if (!sub || sub === 'help') {
    emit({ ok: true, cmd: outputOpts.cmd, data: {
      group: 'dag',
      desc: 'DAG mutation commands',
      subcommands: [
        { sub: 'insert', desc: 'Insert a new node into the DAG' },
        { sub: 'remove', desc: 'Remove a node (--cascade to remove dependents)' },
        { sub: 'modify', desc: 'Modify an existing node fields' },
        { sub: 'log',    desc: 'Show mutation history' },
      ],
      invariants: [
        'all mutations validate the DAG (define/verify/check) before committing',
        'provenance receipts are recorded in .roadmap/trail.jsonl',
      ],
      examples: [
        { sub: 'insert', cmd: "roadmap dag insert --node '{\"id\":\"x\",\"desc\":\"...\",\"produces\":[],\"consumes\":[],\"deps\":[\"init\"]}' --note \"why\"" },
        { sub: 'remove', cmd: 'roadmap dag remove my-node --note "why" --cascade' },
        { sub: 'modify', cmd: 'roadmap dag modify my-node --set \'{"desc":"new desc"}\' --note "why"' },
        { sub: 'log',    cmd: 'roadmap dag log' },
      ],
    } }, outputOpts);
    return;
  }

  if (!note && sub !== 'log') {
    json({ error: 'Missing --note "reason"', fix: `roadmap dag ${sub} --note "why"` }, outputOpts);
    process.exit(1);
    return;
  }

  switch (sub) {
    case 'insert': return await dagInsert(args, repoRoot, note!, hasLocalDAG, outputOpts);
    case 'remove': return await dagRemove(args, repoRoot, note!, hasLocalDAG, outputOpts);
    case 'modify': return await dagModify(args, repoRoot, note!, hasLocalDAG, outputOpts);
    case 'log':    return dagLog(args, repoRoot, outputOpts);
    default:
      json({ error: `Unknown dag subcommand: ${sub}`, fix: 'roadmap dag help', hint: "Run 'roadmap api --all' to see full command registry." }, outputOpts);
      process.exit(1);
  }
}

async function dagInsert(
  args: string[], repoRoot: string, note: string, hasLocalDAG: boolean, outputOpts: OutputOpts,
): Promise<void> {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' }, outputOpts);
    process.exit(1);
    return;
  }

  requireValidOrigin(repoRoot);

  const nodeIdx = args.indexOf('--node');
  if (nodeIdx === -1 || !args[nodeIdx + 1]) {
    json({ error: 'Missing --node', fix: 'roadmap dag insert --node \'{"id":"x","desc":"...","produces":[],"consumes":[],"deps":["y"]}\' --note "why"' }, outputOpts);
    process.exit(1);
    return;
  }

  let nodeSpec: any;
  try {
    nodeSpec = JSON.parse(args[nodeIdx + 1]);
  } catch {
    json({ error: 'Invalid JSON for --node', fix: 'Ensure --node value is valid JSON' }, outputOpts);
    process.exit(1);
    return;
  }

  if (!nodeSpec.id || !nodeSpec.desc) {
    json({ error: 'Node spec requires at least "id" and "desc"', fix: 'Include id and desc in the node JSON' }, outputOpts);
    process.exit(1);
    return;
  }

  const dag = await loadDAG(repoRoot);

  try {
    const { dag: mutated, receipt } = insertNode(dag, nodeSpec, note);
    commitMutation(repoRoot, mutated, receipt, (r) => {
      appendTrail({
        ts: new Date().toISOString(),
        cmd: 'dag.insert',
        note,
        repo: basename(repoRoot),
        detail: { nodeId: nodeSpec.id, receipt: r },
      }, repoRoot);
    });

    json({ ok: true, op: 'insert', nodeId: nodeSpec.id, receipt }, outputOpts);
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.insert'),
      } }, outputOpts);
      process.exit(1);
    }
    throw e;
  }
}

async function dagRemove(
  args: string[], repoRoot: string, note: string, hasLocalDAG: boolean, outputOpts: OutputOpts,
): Promise<void> {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' }, outputOpts);
    process.exit(1);
    return;
  }

  requireValidOrigin(repoRoot);

  const nodeId = args[2];
  if (!nodeId || nodeId.startsWith('--')) {
    json({ error: 'Missing node-id', fix: 'roadmap dag remove <node-id> --note "why"' }, outputOpts);
    process.exit(1);
    return;
  }

  const cascade = args.includes('--cascade');
  const dag = await loadDAG(repoRoot);

  try {
    const { dag: mutated, receipt } = removeNode(dag, nodeId, note, { cascade });
    commitMutation(repoRoot, mutated, receipt, (r) => {
      appendTrail({
        ts: new Date().toISOString(),
        cmd: 'dag.remove',
        note,
        repo: basename(repoRoot),
        detail: { nodeId, cascade, receipt: r },
      }, repoRoot);
    });

    json({ ok: true, op: 'remove', nodeId, cascade, receipt }, outputOpts);
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.remove'),
      } }, outputOpts);
      process.exit(1);
    }
    if (e instanceof Error) {
      json({ error: e.message }, outputOpts);
      process.exit(1);
    }
    throw e;
  }
}

async function dagModify(
  args: string[], repoRoot: string, note: string, hasLocalDAG: boolean, outputOpts: OutputOpts,
): Promise<void> {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap make <spec> --note "..."' }, outputOpts);
    process.exit(1);
    return;
  }

  requireValidOrigin(repoRoot);

  const nodeId = args[2];
  if (!nodeId || nodeId.startsWith('--')) {
    json({ error: 'Missing node-id', fix: 'roadmap dag modify <node-id> --set \'{"desc":"..."}\' --note "why"' }, outputOpts);
    process.exit(1);
    return;
  }

  const setIdx = args.indexOf('--set');
  if (setIdx === -1 || !args[setIdx + 1]) {
    json({ error: 'Missing --set', fix: 'roadmap dag modify <node-id> --set \'{"desc":"new desc"}\' --note "why"' }, outputOpts);
    process.exit(1);
    return;
  }

  let changes: any;
  try {
    changes = JSON.parse(args[setIdx + 1]);
  } catch {
    json({ error: 'Invalid JSON for --set', fix: 'Ensure --set value is valid JSON' }, outputOpts);
    process.exit(1);
    return;
  }

  const dag = await loadDAG(repoRoot);

  try {
    const { dag: mutated, receipt } = modifyNode(dag, nodeId, changes, note);
    commitMutation(repoRoot, mutated, receipt, (r) => {
      appendTrail({
        ts: new Date().toISOString(),
        cmd: 'dag.modify',
        note,
        repo: basename(repoRoot),
        detail: { nodeId, changes, receipt: r },
      }, repoRoot);
    });

    json({ ok: true, op: 'modify', nodeId, receipt }, outputOpts);
  } catch (e) {
    if (e instanceof MutationError) {
      emit({ ok: false, cmd: outputOpts.cmd, error: {
        code: ErrorCode.VALIDATION_FAILED, message: e.message,
        fix: e.errors, ...schemaFields('dag.modify'),
      } }, outputOpts);
      process.exit(1);
    }
    if (e instanceof Error) {
      json({ error: e.message }, outputOpts);
      process.exit(1);
    }
    throw e;
  }
}

function dagLog(args: string[], repoRoot: string, outputOpts: OutputOpts): void {
  const log = loadMutationLog(repoRoot);
  const lastN = args.includes('--last') ? parseInt(args[args.indexOf('--last') + 1] || '10', 10) : undefined;
  const mutations = lastN ? log.mutations.slice(-lastN) : log.mutations;
  json({ ok: true, count: mutations.length, total: log.mutations.length, mutations }, outputOpts);
}
