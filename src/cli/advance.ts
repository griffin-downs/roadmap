// @module cli/advance
// @description Advance command: single-node validation + evidence recording, batch advancement.
// @exports run

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import {
  define, check, verify, advanceBatch, validateNode,
} from '../protocol.ts';
import type { Graph } from '../protocol.ts';
import { CompletionStore, saveCompletionWithEvidence } from '../runtime/completion.ts';
import type { EvidenceRecord } from '../runtime/completion.ts';
import { loadContext } from '../runtime/context.ts';
import { getBrief } from '../lib/brief.ts';
import { buildTerminalBrief, type TerminalBrief } from '../lib/terminal-brief.ts';
import { archiveHead, readArchivedLinks, parseExecutionReport, type ExecutionReport } from '../lib/chain.ts';
import { tasksToDAG } from '../lib/intake/speckit-import.ts';
import type { FinalHandoff, InterimHandoff } from '../lib/brief.ts';
import { saveFinal, saveInterim } from '../lib/agent-dispatch/handoff-journal.ts';
import { computeExecutionReport } from '../lib/auto-execution-report.ts';
import { requireValidOrigin } from '../lib/intake/runtime-gate.ts';
import type { GapEntry } from '../lib/terminal-audit/detected.ts';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';
import {
  loadDAG, crossOrientWithState, appendTrail, recordTrailError,
  getCurrentBranch, retiredSet, loadSpecGoal, json,
} from './shared.ts';

export async function run(
  args: string[],
  repoRoot: string,
  note: string,
  hasLocalDAG: boolean,
  outputOpts: OutputOpts,
): Promise<void> {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Initialize with: roadmap spec plan --gallery --note "..."' }, outputOpts);
    process.exit(1);
    return;
  }

  requireValidOrigin(repoRoot);

  const dag = await loadDAG(repoRoot);
  const nodeId = args[1];

  if (nodeId) {
    return await advanceNode(dag, nodeId, args, repoRoot, note, outputOpts);
  }
  return await advanceBatchCmd(dag, args, repoRoot, note, outputOpts);
}

async function advanceNode(
  dag: Graph<string>, nodeId: string, args: string[],
  repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
  if (!node) {
    json({ error: `Node not found: ${nodeId}`, fix: `Check node IDs with: roadmap orient --note "..."` }, outputOpts);
    process.exit(1);
    return;
  }

  const pos = await crossOrientWithState(dag, repoRoot);
  if (!pos.batchRemaining.includes(nodeId) && !pos.position.includes(nodeId)) {
    json({
      error: `Node ${nodeId} is not in current batch`,
      currentBatch: pos.position,
      remaining: pos.batchRemaining,
      fix: 'Can only advance nodes in the current batch',
    }, outputOpts);
    process.exit(1);
    return;
  }

  // Parse intent judgments
  const evalIdx = args.indexOf('--evaluate');
  const evalFileIdx = args.indexOf('--evaluate-file');
  let intentJudgments: import('../protocol.ts').IntentJudgment[] | undefined;
  if (evalFileIdx !== -1 && args[evalFileIdx + 1]) {
    const evalPath = resolve(repoRoot, args[evalFileIdx + 1]);
    if (!existsSync(evalPath)) {
      json({ error: `--evaluate-file not found: ${evalPath}`, fix: 'Provide path to a JSON file containing intent judgments array' }, outputOpts);
      process.exit(1);
      return;
    }
    try {
      intentJudgments = JSON.parse(readFileSync(evalPath, 'utf-8'));
    } catch {
      json({ error: `Invalid JSON in --evaluate-file: ${evalPath}`, fix: 'File must contain a valid JSON array of IntentJudgment objects' }, outputOpts);
      process.exit(1);
      return;
    }
  } else if (evalIdx !== -1 && args[evalIdx + 1]) {
    try {
      intentJudgments = JSON.parse(args[evalIdx + 1]);
    } catch {
      json({ error: 'Invalid --evaluate JSON', fix: 'Pass valid JSON array: --evaluate \'[...]\' or use --evaluate-file <path>' }, outputOpts);
      process.exit(1);
      return;
    }
  }

  // Run validators
  const existsPredicate = (artifact: string) => existsSync(join(repoRoot, artifact));
  const readFilePredicate = (path: string): string | null => {
    try { return readFileSync(path, 'utf-8'); } catch { return null; }
  };
  const validationResult = await validateNode(dag, nodeId, existsPredicate, {
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    intentJudgments,
    readFile: readFilePredicate,
  });

  const checks: EvidenceRecord[] = validationResult.checks.map(c => {
    const ruleKey = c.rule.type === 'artifact-exists'
      ? `artifact-exists:${(c.rule.target ?? c.rule.path) || 'produces'}`
      : c.rule.type === 'shell'
      ? `shell:${((c.rule as any).command ?? (c.rule as any).argv?.join(' ') ?? 'unknown')}`
      : c.rule.type === 'intent'
      ? `intent:${c.rule.statement?.slice(0, 60) || 'ok'}`
      : `${c.rule.type}:${(c.rule as any).target || (c.rule as any).command || 'unknown'}`;

    const evidence = c.evidence ?? (c.passed ? 'passed' : 'failed');
    return { rule: ruleKey, passed: c.passed, evidence };
  });

  // Check produces artifacts
  const produces = node.produces ?? [];
  for (const artifact of produces) {
    const fullPath = join(repoRoot, artifact);
    const artifactExists = existsSync(fullPath);
    checks.push({
      rule: `artifact-exists:${artifact}`,
      passed: artifactExists,
      evidence: artifactExists ? 'file exists' : 'file missing',
    });
  }

  const allPassed = validationResult.passed && checks.every(c => c.passed);

  if (!allPassed) {
    const failedChecks = checks.filter(c => !c.passed);
    const interim: InterimHandoff = {
      timestamp: new Date().toISOString(),
      progress: 0.5,
      discovered: [],
      blockers: failedChecks.map(c => c.rule),
      currentFile: '',
    };
    try { await saveInterim(repoRoot, nodeId, interim); } catch { /* non-blocking */ }

    json({ error: `Validation failed for ${nodeId}`, checks, fix: 'Fix failing validators and retry' }, outputOpts);
    recordTrailError('advance', 'VALIDATION_FAILED', `Node ${nodeId}: ${checks.filter(c => !c.passed).map(c => c.rule).join(', ')}`, repoRoot, note);
    process.exit(1);
    return;
  }

  // Terminal advance: build terminal brief, chain if successor exists
  let terminalBrief: TerminalBrief | undefined;
  let chained = false;
  if (nodeId === dag.term) {
    // Auto-compute execution report; --evaluate-file overrides
    let executionReport: ExecutionReport | undefined;
    if (evalFileIdx !== -1 && args[evalFileIdx + 1]) {
      try {
        const evalPath = resolve(repoRoot, args[evalFileIdx + 1]);
        executionReport = parseExecutionReport(evalPath);
      } catch { /* non-fatal — fall through to auto-compute */ }
    }
    if (!executionReport) {
      executionReport = computeExecutionReport(repoRoot);
    }
    const advCtx = loadContext(repoRoot);
    terminalBrief = buildTerminalBrief(dag, repoRoot, executionReport, advCtx.chain);

    // Check for explicit successor spec in term node produces
    const termNode = dag.nodes[dag.term as keyof typeof dag.nodes] as any;
    const successorSpecPath = (termNode.produces ?? []).find(
      (p: string) => p.endsWith('.json') && !p.includes('artifact'),
    );

    if (successorSpecPath) {
      const fullSpecPath = join(repoRoot, successorSpecPath);
      if (existsSync(fullSpecPath)) {
        try {
          const specContent = JSON.parse(readFileSync(fullSpecPath, 'utf-8'));
          if (specContent.tasks) {
            const builtDag = tasksToDAG(specContent.tasks, {
              dagId: specContent.dag_id ?? `${dag.id}-successor`,
              dagDesc: specContent.dag_desc ?? 'Successor DAG',
            });
            define(builtDag); verify(builtDag); check(builtDag);

            const existingLinks = readArchivedLinks(repoRoot);
            const nextIteration = existingLinks.length > 0
              ? Math.max(...existingLinks.map(l => l.iteration)) + 1
              : 0;
            const completedAt = new Date().toISOString();
            archiveHead(repoRoot, {
              iteration: nextIteration,
              predecessorId: nextIteration > 0 ? dag.id ?? null : null,
              completedAt,
              executionReport,
            });
            const headPath = join(repoRoot, '.roadmap', 'head.json');
            writeFileSync(headPath, JSON.stringify(builtDag, null, 2) + '\n');
            chained = true;
          } else if (specContent.init && specContent.term && specContent.nodes) {
            define(specContent); verify(specContent); check(specContent);

            const existingLinks = readArchivedLinks(repoRoot);
            const nextIteration = existingLinks.length > 0
              ? Math.max(...existingLinks.map(l => l.iteration)) + 1
              : 0;
            const completedAt = new Date().toISOString();
            archiveHead(repoRoot, {
              iteration: nextIteration,
              predecessorId: nextIteration > 0 ? dag.id ?? null : null,
              completedAt,
              executionReport,
            });
            const headPath = join(repoRoot, '.roadmap', 'head.json');
            writeFileSync(headPath, JSON.stringify(specContent, null, 2) + '\n');
            chained = true;
          }
        } catch (e: any) {
          emit({ ok: false, cmd: outputOpts.cmd, error: {
            error: `Successor spec validation failed: ${e.message}`,
            successorSpec: successorSpecPath,
            fix: 'Fix the successor spec JSON and retry terminal advance',
            checks,
          } as any }, outputOpts);
          recordTrailError('advance', 'SUCCESSOR_VALIDATION_FAILED', `Terminal ${nodeId}: ${e.message}`, repoRoot, note);
          process.exit(1);
          return;
        }
      }
    }
  }

  // Attribution safety
  const attributionWarning = checkAttribution(repoRoot, produces);

  // Parallel-edit guard
  let parallelEditWarning: string | undefined;
  try {
    const completion = CompletionStore.loadOrEmpty(repoRoot);
    const currentBranch = getCurrentBranch(repoRoot);
    const now = Date.now();
    const sixtySecsAgo = now - (60 * 1000);

    for (const [id, _record] of completion.allIds().entries()) {
      if (id === nodeId) continue;
      const rec = completion.record(id);
      if (!rec || !rec.branch || rec.branch !== currentBranch) continue;
      const completedTime = new Date(rec.completedAt).getTime();
      if (completedTime > sixtySecsAgo) {
        parallelEditWarning = `Concurrent edits detected: ${id} completed ${Math.round((now - completedTime) / 1000)}s ago on same branch. Recommend using worktree isolation for parallel agents.`;
        break;
      }
    }
  } catch { /* non-blocking */ }

  saveCompletionWithEvidence(repoRoot, nodeId, checks);

  // Write final handoff
  const final: FinalHandoff = {
    timestamp: new Date().toISOString(),
    progress: 1.0,
    discovered: [],
    blockers: [],
    currentFile: '',
    summary: note ? note.slice(0, 100) : 'Node completed',
    keyDecisions: [],
    gotchas: [],
    nextNodeEntry: {
      consumes: node.produces ?? [],
      ready: true,
    },
  };
  try { await saveFinal(repoRoot, nodeId, final); } catch { /* non-blocking */ }

  // Re-orient
  const newPos = await crossOrientWithState(dag, repoRoot);

  // Extract intent gates as structured prompts
  const intentGates: Array<{
    statement: string;
    nodeDescription: string;
    produces: string[];
    shellEvidence: Array<{ command: string; passed: boolean; evidence: string }>;
    artifactEvidence: Array<{ artifact: string; exists: boolean }>;
    assessmentPrompt: string;
  }> = [];
  for (const c of validationResult.checks) {
    if (c.rule.type === 'intent') {
      const statement = (c.rule as any).statement ?? '';
      const shellEvidence = validationResult.checks
        .filter(sc => sc.rule.type === 'shell')
        .map(sc => ({
          command: (sc.rule as any).command ?? (sc.rule as any).argv?.join(' ') ?? 'unknown',
          passed: sc.passed,
          evidence: sc.evidence ?? (sc.passed ? 'exit 0' : 'failed'),
        }));
      const artifactEvidence = (node.produces ?? []).map((a: string) => ({
        artifact: a,
        exists: existsSync(join(repoRoot, a)),
      }));
      const passCount = shellEvidence.filter(s => s.passed).length;
      const artifactCount = artifactEvidence.filter((a: { artifact: string; exists: boolean }) => a.exists).length;
      intentGates.push({
        statement,
        nodeDescription: node.desc ?? '',
        produces: node.produces ?? [],
        shellEvidence,
        artifactEvidence,
        assessmentPrompt: [
          `INTENT: "${statement}"`,
          `Node ${nodeId}: ${node.desc ?? ''}`,
          `Shell validators: ${passCount}/${shellEvidence.length} passing`,
          `Artifacts: ${artifactCount}/${artifactEvidence.length} present`,
          shellEvidence.length > 0
            ? `Commands run: ${shellEvidence.map(s => `${s.command} → ${s.passed ? 'PASS' : 'FAIL'}`).join('; ')}`
            : 'No shell validators configured',
          `Does the completed work satisfy this intent?`,
        ].join('\n'),
      });
    }
  }

  const result: any = {
    completed: nodeId,
    checks,
    batchComplete: newPos.batchComplete,
    remaining: newPos.batchRemaining,
    ...(intentGates.length > 0 ? { intentGates } : {}),
    ...(terminalBrief ? { terminalBrief: {
      rootIntent: terminalBrief.rootIntent,
      iteration: terminalBrief.iteration,
      chainHistory: terminalBrief.chainHistory,
      detectedGaps: terminalBrief.detectedGaps,
      ...(terminalBrief.scoring ? { scoring: terminalBrief.scoring } : {}),
      ...(chained ? { chained: true, message: 'Successor DAG installed — run orient to continue' } : {}),
    } } : {}),
    ...(attributionWarning ? { attributionWarning } : {}),
    ...(parallelEditWarning ? { parallelEditWarning } : {}),
  };

  if (newPos.batchRemaining.length > 0) {
    try { result.nextBrief = await getBrief(dag, newPos.batchRemaining[0], repoRoot); } catch { /* best-effort */ }
  }

  if (newPos.batchComplete) {
    const completion = CompletionStore.loadOrEmpty(repoRoot);
    const next = advanceBatch(dag, completion, retiredSet(repoRoot));
    if (!next || next.position.length === 0) {
      result.advanced = true;

      // Completion gate: gaps detected and no successor chained → not done
      const hasGaps = terminalBrief && terminalBrief.detectedGaps.gaps.length > 0;
      if (hasGaps && !chained) {
        result.done = false;
        result.chainRequired = true;
        result.message = 'DAG nodes complete but gaps remain. Write a successor spec and run: roadmap make <spec> --note "chain from ' + (dag.id ?? 'unknown') + '"';
        result.gaps = terminalBrief!.detectedGaps.gaps;
        result.rootIntent = terminalBrief!.rootIntent;
        result.iteration = terminalBrief!.iteration;
      } else {
        result.chainReady = true;
        result.rootIntent = terminalBrief?.rootIntent ?? dag.desc;
        result.iteration = terminalBrief?.iteration ?? 0;
        result.gaps = terminalBrief?.detectedGaps.gaps ?? [];
        result.scoring = terminalBrief?.scoring ?? undefined;
        result.convergenceAssessment = terminalBrief?.convergence ?? undefined;
        result.improvementAreas = deriveImprovementAreas(terminalBrief?.detectedGaps.gaps ?? []);
        result.message = 'DAG complete. chainReady output contains gaps, scoring, and improvementAreas for successor spec authoring. Run: roadmap make <spec> --note "chain from ' + (dag.id ?? 'unknown') + '"';
      }

      const goal = loadSpecGoal(dag.id ?? '', repoRoot);
      if (goal) {
        result.goalAssessment = {
          goal: goal.statement,
          ...(goal.satisfied_when ? { satisfiedWhen: goal.satisfied_when } : {}),
          ...(goal.known_remaining?.length ? { knownRemaining: goal.known_remaining } : {}),
          requiredAction: 'Assess whether the goal is satisfied before closing session. Surface any known_remaining items to the user.',
        };
      }
    } else {
      result.advanced = true;
      result.nextPosition = next.position;
      result.nextLevel = next.level;
      result.nextProduces = next.produces;
      result.nextConsumes = next.consumes;
      try { result.nextBrief = await getBrief(dag, next.position[0], repoRoot); } catch { /* best-effort */ }
    }
  }

  emit({ ok: true, cmd: outputOpts.cmd, data: result }, outputOpts);

  appendTrail({
    ts: new Date().toISOString(),
    cmd: 'advance',
    note,
    repo: basename(repoRoot),
    position: newPos.position,
    level: newPos.level,
    detail: { completed: nodeId, checks: checks.length, passed: allPassed },
  }, repoRoot);
}

async function advanceBatchCmd(
  dag: Graph<string>, args: string[],
  repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  const pos = await crossOrientWithState(dag, repoRoot);

  if (!pos.batchComplete) {
    json({
      error: 'Batch not complete',
      remaining: pos.batchRemaining.length,
      nodes: pos.batchRemaining,
      fix: `Complete nodes: ${pos.batchRemaining.map(n => `roadmap advance ${n} --note "..."`).join(', ')}`,
    }, outputOpts);
    process.exit(1);
    return;
  }

  const completion = CompletionStore.loadOrEmpty(repoRoot);

  for (const nid of pos.position) {
    const node = dag.nodes[nid as keyof typeof dag.nodes] as any;
    if (!node) continue;
    const produces = node.produces ?? [];
    if (!completion.hasPassing(nid) && produces.length > 0) {
      json({
        error: `Missing completion evidence for ${nid}`,
        produces,
        fix: `Record completion: roadmap advance ${nid} --note "..."`,
      }, outputOpts);
      process.exit(1);
      return;
    }
  }

  const next = advanceBatch(dag, completion, retiredSet(repoRoot));

  if (!next || next.position.length === 0) {
    const goal = loadSpecGoal(dag.id ?? '', repoRoot);
    const goalAssessment = goal ? {
      goal: goal.statement,
      ...(goal.satisfied_when ? { satisfiedWhen: goal.satisfied_when } : {}),
      ...(goal.known_remaining?.length ? { knownRemaining: goal.known_remaining } : {}),
      requiredAction: 'Assess whether the goal is satisfied before closing session. Surface any known_remaining items to the user.',
    } : undefined;
    emit({ ok: true, cmd: outputOpts.cmd, data: {
      advanced: true, level: pos.level + 1, position: [], message: 'DAG complete. Evaluate gaps and write successor spec if needed.', chainReady: true,
      ...(goalAssessment ? { goalAssessment } : {}),
    } }, outputOpts);

    appendTrail({
      ts: new Date().toISOString(), cmd: 'advance', note, repo: basename(repoRoot),
      position: [], level: pos.level + 1, detail: { chainReady: true },
    }, repoRoot);
    return;
  }

  emit({ ok: true, cmd: outputOpts.cmd, data: {
    advanced: true, previousLevel: pos.level, level: next.level,
    position: next.position, batchRemaining: next.batchRemaining,
    produces: next.produces, consumes: next.consumes,
  } }, outputOpts);

  appendTrail({
    ts: new Date().toISOString(), cmd: 'advance', note, repo: basename(repoRoot),
    position: next.position, level: next.level,
  }, repoRoot);
}

function checkAttribution(root: string, produces: string[]): string | undefined {
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (!status) return undefined;

    const changedFiles = status.split('\n')
      .map(line => line.slice(3).trim())
      .filter(f => f.length > 0);

    const producesSet = new Set(produces.map(p => (p.startsWith('/') ? p.slice(1) : p)));
    const outsideFiles = changedFiles.filter(f => !producesSet.has(f) && !f.startsWith('.roadmap/'));

    if (outsideFiles.length > 0) {
      return `Branch has ${outsideFiles.length} changed file(s) outside this node's produces: ${outsideFiles.slice(0, 5).join(', ')}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Derive actionable improvement areas from detected gaps.
 * Each string describes what the next spec should address.
 */
function deriveImprovementAreas(gaps: GapEntry[]): string[] {
  const areas: string[] = [];
  const seen = new Set<string>();

  // Group by gap type for deduplication
  const byType = new Map<string, GapEntry[]>();
  for (const gap of gaps) {
    if (!byType.has(gap.type)) byType.set(gap.type, []);
    byType.get(gap.type)!.push(gap);
  }

  const uncovered = byType.get('uncovered-consume') ?? [];
  if (uncovered.length > 0) {
    const nodes = [...new Set(uncovered.map(g => g.nodeId))];
    const msg = `Add shell validators for consumed artifacts in: ${nodes.join(', ')} (${uncovered.length} unguarded contracts)`;
    if (!seen.has(msg)) { seen.add(msg); areas.push(msg); }
  }

  const untested = byType.get('untested-produce') ?? [];
  if (untested.length > 0) {
    const nodes = [...new Set(untested.map(g => g.nodeId))];
    const msg = `Add acceptance tests for produced artifacts in: ${nodes.join(', ')} (${untested.length} untested outputs)`;
    if (!seen.has(msg)) { seen.add(msg); areas.push(msg); }
  }

  const noShell = byType.get('no-shell-coverage') ?? [];
  if (noShell.length > 0) {
    const nodes = [...new Set(noShell.map(g => g.nodeId))];
    const msg = `Upgrade artifact-exists-only nodes to include shell validators: ${nodes.join(', ')} (existence checked, correctness not tested)`;
    if (!seen.has(msg)) { seen.add(msg); areas.push(msg); }
  }

  const untestedEvidence = byType.get('untested-evidence') ?? [];
  if (untestedEvidence.length > 0) {
    const nodes = [...new Set(untestedEvidence.map(g => g.nodeId))];
    const msg = `Nodes completed without shell test evidence: ${nodes.join(', ')} — add runtime tests to validate correctness, not just existence`;
    if (!seen.has(msg)) { seen.add(msg); areas.push(msg); }
  }

  const velocityDecay = byType.get('velocity-decay') ?? [];
  if (velocityDecay.length > 0) {
    const nodes = [...new Set(velocityDecay.map(g => g.nodeId))];
    const msg = `Velocity decay detected in nodes: ${nodes.join(', ')} — consider splitting large nodes or reducing scope per batch`;
    if (!seen.has(msg)) { seen.add(msg); areas.push(msg); }
  }

  return areas;
}
