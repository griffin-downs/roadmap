// @module cli/orient
// @description Orient command: batch position, briefs, chain context, claim annotations.
// @exports run

import { basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadClaims, annotateWithClaims } from '../lib/claims/claims.ts';
import { readPackageVersion } from '../lib/install-skills.ts';
import { requireValidOrigin, checkSpecDrift } from '../lib/intake/runtime-gate.ts';
import { getBrief } from '../lib/brief.ts';
import { loadContext } from '../runtime/context.ts';
import { loadFleetContext } from '../runtime/fleet.ts';
import { readLoopHistory } from '../runtime/loop.ts';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';
import type { Graph } from '../lib/protocol/types.ts';
import type { OrientV1 } from '../lib/core/orient-schema.ts';
import type { FleetStatus, FleetFrontierNode, RepoStatus } from '../lib/fleet-types.ts';
import {
  loadDAG, crossOrientWithState, appendTrail,
  getCurrentBranch, isWorktree, hasFlag, migrateSingleHead,
} from './shared.ts';

/** Fleet orient: cross-repo rollup status */
async function runFleetOrient(repoRoot: string, outputOpts: OutputOpts): Promise<void> {
  const fleet = loadFleetContext(repoRoot);
  const loopHistory = readLoopHistory(repoRoot);
  const iteration = loopHistory.length > 0
    ? Math.max(...loopHistory.map(r => r.iteration)) + 1
    : 0;

  let headCommit: string | null = null;
  try {
    headCommit = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch { /* not a git repo */ }

  const repos: RepoStatus[] = [];
  const blockers: string[] = [];

  // Collect per-repo frontier data for cross-repo resolution
  interface RepoDagInfo {
    repoName: string;
    dagId: string;
    dag: Graph<string>;
    position: string[];
    allProduced: Set<string>; // paths produced by completed nodes
  }
  const repoDagInfos: RepoDagInfo[] = [];

  for (const rc of fleet.repos) {
    const activeDAGs = rc.activeDAGs.length > 0 ? [...rc.activeDAGs] : undefined;

    if (!rc.context) {
      repos.push({
        name: rc.entry.name, path: rc.resolvedPath,
        dagId: null, status: 'no-dag', level: null,
        reason: rc.warning ?? 'unknown',
        activeDAGs,
      });
      blockers.push(`${rc.entry.name}: ${rc.warning}`);
      continue;
    }

    // Build list of DAG files to load: all active heads/*.json DAGs
    const headsDirectory = join(rc.resolvedPath, '.roadmap', 'heads');
    const dagFiles: { dagPath: string; dagId: string }[] = [];

    if (rc.activeDAGs.length > 0 && existsSync(headsDirectory)) {
      for (const summary of rc.activeDAGs) {
        const candidatePath = join(headsDirectory, `${summary.dagId}.json`);
        if (existsSync(candidatePath)) {
          dagFiles.push({ dagPath: candidatePath, dagId: summary.dagId });
        }
      }
    }

    // Fallback: if no heads/ DAGs found, use head.json
    if (dagFiles.length === 0) {
      const headPath = join(rc.resolvedPath, '.roadmap', 'head.json');
      if (!existsSync(headPath)) {
        repos.push({
          name: rc.entry.name, path: rc.resolvedPath,
          dagId: null, status: 'no-dag', level: null,
          activeDAGs,
        });
        continue;
      }
      const head = JSON.parse(readFileSync(headPath, 'utf-8')) as { id?: string };
      dagFiles.push({ dagPath: headPath, dagId: head.id ?? rc.entry.name });
    }

    // Load each active DAG and compute its frontier
    let repoHasActive = false;
    let repoTotalDone = 0;
    let repoTotalRemaining = 0;
    const repoBatch: string[] = [];

    for (const { dagPath, dagId } of dagFiles) {
      try {
        const dag = await loadDAG(rc.resolvedPath, dagPath);
        const pos = await crossOrientWithState(dag, rc.resolvedPath);

        const allProduced = new Set<string>();
        for (const doneId of pos.done) {
          const node = (dag.nodes as unknown as Record<string, { produces?: readonly string[] }>)[doneId];
          if (node?.produces) node.produces.forEach(p => allProduced.add(p));
        }

        repoDagInfos.push({
          repoName: rc.entry.name,
          dagId,
          dag,
          position: pos.position,
          allProduced,
        });

        repoTotalDone += pos.done.length;
        repoTotalRemaining += pos.remaining.length;
        if (pos.remaining.length > 0) {
          repoHasActive = true;
          repoBatch.push(...pos.position);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        blockers.push(`${rc.entry.name}/${dagId}: ${message}`);
      }
    }

    if (repoHasActive) {
      repos.push({
        name: rc.entry.name, path: rc.resolvedPath,
        dagId: dagFiles.length === 1 ? dagFiles[0].dagId : null,
        status: 'active', level: null,
        batch: repoBatch,
        done: repoTotalDone, remaining: repoTotalRemaining,
        activeDAGs,
      });
    } else if (repoTotalDone > 0) {
      repos.push({
        name: rc.entry.name, path: rc.resolvedPath,
        dagId: dagFiles.length === 1 ? dagFiles[0].dagId : null,
        status: 'complete', level: null,
        done: repoTotalDone, remaining: 0,
        activeDAGs,
      });
    } else {
      repos.push({
        name: rc.entry.name, path: rc.resolvedPath,
        dagId: null, status: 'no-dag', level: null,
        activeDAGs,
      });
    }
  }

  // Build unified frontier: all nodes whose single-DAG deps are satisfied,
  // filtered to remove those blocked by cross-repo consume dependencies.
  const allProducedAcrossRepos = new Set<string>();
  for (const info of repoDagInfos) {
    for (const p of info.allProduced) allProducedAcrossRepos.add(p);
  }

  const globalFrontier: FleetFrontierNode[] = [];
  for (const info of repoDagInfos) {
    for (const nodeId of info.position) {
      const node = (info.dag.nodes as unknown as Record<string, { produces?: readonly string[]; consumes?: readonly (string | { artifact: string })[] }>)[nodeId];
      if (!node) continue;

      // Check if any consumes path is unsatisfied by another repo (cross-repo blocker)
      const consumes = (node.consumes ?? []).map(c =>
        typeof c === 'string' ? c : c.artifact,
      );
      const crossRepoBocked = consumes.some(path => {
        // If path is produced by this repo's done nodes, not cross-repo blocked
        if (info.allProduced.has(path)) return false;
        // If produced by another repo's done nodes, satisfied
        if (allProducedAcrossRepos.has(path)) return false;
        // Check if it's produced by any DAG at all (not yet done = blocked)
        for (const other of repoDagInfos) {
          if (other === info) continue;
          for (const otherNodeId of Object.keys(other.dag.nodes)) {
            const otherNode = (other.dag.nodes as unknown as Record<string, { produces?: readonly string[] }>)[otherNodeId];
            if (otherNode?.produces?.includes(path)) return true; // cross-repo dep, not yet done
          }
        }
        return false;
      });

      if (!crossRepoBocked) {
        globalFrontier.push({
          repo: info.repoName,
          dagId: info.dagId,
          nodeId,
          produces: [...(node.produces ?? [])],
        });
      }
    }
  }

  const allDone = repos.every(r => r.status === 'complete');
  const loopReady = repos.length > 0 && allDone;

  const fleetStatus: FleetStatus = {
    iteration,
    compiler: { repo: '.', headCommit },
    repos,
    loopReady,
    blockers,
    globalFrontier,
  };

  emit({ ok: true, cmd: outputOpts.cmd, data: fleetStatus }, outputOpts);
}

export async function run(
  args: string[],
  repoRoot: string,
  note: string | undefined,
  hasLocalDAG: boolean,
  outputOpts: OutputOpts,
): Promise<void> {
  // Auto-detect fleet: if fleet.json exists, run fleet orient (unless --no-fleet)
  const noFleet = args.includes('--no-fleet');
  const fleetJsonPath = join(repoRoot, '.roadmap', 'fleet.json');
  if (!noFleet && (args.includes('--fleet') || existsSync(fleetJsonPath))) {
    return runFleetOrient(repoRoot, outputOpts);
  }

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

  // Fleet note: if fleet.json exists but --no-fleet was used, note it
  if (noFleet && existsSync(fleetJsonPath)) {
    result.fleet = { exists: true, note: 'Fleet auto-orient suppressed by --no-fleet' };
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
