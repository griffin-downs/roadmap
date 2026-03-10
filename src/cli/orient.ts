// @module cli/orient
// @description Orient command: batch position, briefs, chain context, claim annotations.
// @exports run

import { basename } from 'node:path';
import { loadClaims, annotateWithClaims } from '../lib/claims/claims.ts';
import { readPackageVersion } from '../lib/install-skills.ts';
import { requireValidOrigin, checkSpecDrift } from '../lib/intake/runtime-gate.ts';
import { getBrief } from '../lib/brief.ts';
import { loadContext } from '../runtime/context.ts';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';
import type { Graph } from '../lib/protocol/types.ts';
import type { OrientV1 } from '../lib/core/orient-schema.ts';
import {
  loadDAG, crossOrientWithState, appendTrail,
  getCurrentBranch, isWorktree, hasFlag, migrateSingleHead,
} from './shared.ts';

export async function run(
  args: string[],
  repoRoot: string,
  note: string | undefined,
  hasLocalDAG: boolean,
  outputOpts: OutputOpts,
): Promise<void> {
  migrateSingleHead(repoRoot);

  const isCheck = args.includes('--check');
  if (!hasLocalDAG) {
    if (!isCheck) {
      appendTrail({
        ts: new Date().toISOString(),
        cmd: 'orient',
        note: note ?? '',
        repo: basename(repoRoot),
        position: 'untracked',
      }, repoRoot);
    }
    if (hasFlag(['--json', '-j'], args)) {
      emit({ ok: true, cmd: outputOpts.cmd, data: {
        schema_version: 1,
        tool: { name: 'roadmap', version: readPackageVersion() },
        workspace: {
          root: repoRoot,
          package_manager: 'unknown',
          node: process.version,
          platform: process.platform,
        },
        inputs: { dag: false },
        position: [],
        level: -1,
        produces: [],
        consumes: [],
        batchRemaining: [],
        batchComplete: false,
        done: 0,
        remaining: 0,
        chainReady: false,
        errors: [{ kind: 'no_dag', message: 'No roadmap tracked in this repo' }],
        exit: { code: 0 },
      } satisfies OrientV1 }, outputOpts);
    } else {
      emit({ ok: true, cmd: outputOpts.cmd, data: {
        position: 'untracked', repo: basename(repoRoot), tracked: false,
      } }, outputOpts);
    }
    return;
  }

  requireValidOrigin(repoRoot);
  const drift = checkSpecDrift(repoRoot);

  const dag = await loadDAG(repoRoot);
  const pos = await crossOrientWithState(dag, repoRoot);

  let nextPosition = pos.position;
  let nextBatchRemaining = pos.batchRemaining;
  let nextLevel = pos.level;

  const batchModes: Record<string, string> = {};
  for (const nodeId of nextPosition) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (node?.mode === 'plan') batchModes[nodeId] = 'plan';
  }

  const claimStore = loadClaims(repoRoot);
  const claimAnnotations = annotateWithClaims(nextPosition, claimStore);

  const briefs: Record<string, any> = {};
  for (const nodeId of nextPosition) {
    try {
      briefs[nodeId] = await getBrief(dag, nodeId, repoRoot);
    } catch { /* best-effort */ }

    const node = (dag.nodes as any)[nodeId];
    if (node) {
      const intentRules = (node.validate ?? []).filter((r: any) => r.type === 'intent');
      if (intentRules.length > 0) {
        const templates = intentRules.map((r: any) => {
          const t: any = {
            statement: r.statement,
            confidence: r.confidence,
            reasoning: '<one paragraph: does the completed work satisfy this intent?>',
          };
          if (r.prompt && r.prompt.length > 0) {
            t.promptAnswers = r.prompt.map((p: string) => `<YOUR ANSWER TO: ${p.split('\n')[0]}>`);
          }
          return t;
        });
        if (!briefs[nodeId]) briefs[nodeId] = {};
        briefs[nodeId].intentGate = {
          hint: 'This node has an intent gate. When you advance, pass --evaluate-file <path> with a JSON file containing:',
          template: templates,
          prompts: intentRules.flatMap((r: any) => r.prompt ?? []),
        };
      }
    }
  }

  const ctx = loadContext(repoRoot);
  const chainLinks = ctx.chain.links;
  const nextChainIteration = chainLinks.length > 0
    ? Math.max(...chainLinks.map((l) => l.iteration)) + 1
    : 0;
  const lastChainLink = chainLinks.length > 0 ? chainLinks[chainLinks.length - 1] : null;
  const chainRootIntent = ctx.chain.rootIntent || (dag.desc ?? 'unknown');

  const chainContext = {
    iteration: nextChainIteration,
    predecessorId: lastChainLink?.predecessorId ?? null,
    dagId: dag.id ?? 'unknown',
    rootIntent: chainRootIntent,
  };

  const result: Record<string, unknown> = {
    position: nextPosition,
    level: nextLevel,
    produces: pos.produces,
    consumes: pos.consumes,
    batchRemaining: nextBatchRemaining,
    batchComplete: nextBatchRemaining.length === 0,
    done: pos.done.length,
    remaining: pos.remaining.length,
    chainReady: pos.remaining.length === 0,
    branch: getCurrentBranch(repoRoot),
    worktree: isWorktree(repoRoot),
    briefs,
    chain: chainContext,
  };

  // Surface legacy completions — nodes that pass without evidence
  if (pos.legacyCompletions && pos.legacyCompletions.length > 0) {
    result.legacyCompletions = pos.legacyCompletions;
  }

  if (result.chainReady) {
    const { scanPendingSpecs } = await import('../lib/orient-forward.ts');
    const dagId = dag.id ?? '';
    const pending = scanPendingSpecs(repoRoot, dagId);
    if (pending.length > 0) {
      result.pendingSpecs = pending;
      result.nextAction = `Load next spec: roadmap make ${pending[0].path} --note "..."`;
    } else {
      result.nextAction = 'DAG complete. Evaluate gaps and write successor spec if needed: roadmap make <spec> --note "..."';
    }
  }

  if (drift.drifted) {
    result.specDrift = { drifted: true, message: drift.message };
  }

  if (!isCheck) {
    appendTrail({
      ts: new Date().toISOString(),
      cmd: 'orient',
      note: note ?? '',
      repo: basename(repoRoot),
      position: nextPosition,
      level: nextLevel,
    }, repoRoot);
  }

  emit({ ok: true, cmd: outputOpts.cmd, data: result }, outputOpts);
}
