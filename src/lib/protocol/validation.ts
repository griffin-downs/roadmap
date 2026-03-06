// @module protocol/validation
// @exports validateNode, validateBatch, validateGraph

import type {
  Graph, ValidationCheck, ValidationResult, IntentFailure,
  IntentJudgment, ExploreResult, ObservationResult,
} from './types.ts';
import { define, check, verify } from './operations.ts';

// --- Validation: Proof of delivery ---

/**
 * Execute validation rules for a node
 * Validates that the node delivered what it claimed (produces)
 */
export async function validateNode<T extends string>(
  g: Graph<T>,
  nodeId: string,
  exists: (artifact: string) => boolean,
  opts?: { intentJudgments?: IntentJudgment[]; exploreResults?: Array<{ script: string; success: boolean; result?: ExploreResult; error?: string }>; validating?: boolean; repoRoot?: string; branch?: string },
): Promise<ValidationResult> {
  const node = g.nodes[nodeId as keyof typeof g.nodes] as any;

  if (!node) {
    return {
      nodeId,
      passed: false,
      checks: [],
      failedReason: `Node "${nodeId}" not found`,
    };
  }

  const checks: ValidationCheck[] = [];
  let allPassed = true;

  // Execute each validation rule
  for (const rule of (node.validate || [])) {
    let passed = false;
    let evidence = '';

    if (rule.type === 'artifact-exists') {
      const artifact = rule.target ?? rule.path;
      if (!artifact) { evidence = 'artifact-exists rule missing both target and path'; }
      else if (Array.isArray(artifact)) {
        passed = artifact.every(a => exists(a));
        const missing = artifact.filter(a => !exists(a));
        evidence = passed ? `all artifacts exist: ${artifact.join(', ')}` : `missing artifacts: ${missing.join(', ')}`;
      }
      else { passed = exists(artifact); evidence = passed ? `artifact exists: ${artifact}` : `artifact missing: ${artifact}`; }
    } else if (rule.type === 'artifact-schema') {
      // TODO: Implement schema validation
      passed = false;
      evidence = 'schema validation not yet implemented';
    } else if (rule.type === 'function') {
      // Run shell command synchronously; exit 0 = pass, non-zero = fail
      // Guard against recursion (e.g. vitest validate → spawns vitest → validate → ...)
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const fnValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (fnValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.fn}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          execSync(rule.fn, {
            stdio: 'pipe',
            env: {
              ...process.env,
              ROADMAP_VALIDATING: '1',
              ROADMAP_NODE: nodeId,
              ROADMAP_REPO: opts?.repoRoot ?? process.cwd(),
              ROADMAP_BRANCH: opts?.branch ?? 'unknown',
            }
          });
          passed = true;
          evidence = `command passed: ${rule.fn}`;
        } catch (e: any) {
          passed = false;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          evidence = `command failed: ${rule.fn} — ${stderr.slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'expanded') {
      // Plan node expansion: check that children with expandedFrom exist
      const allNodes = Object.values(g.nodes) as any[];
      const children = allNodes.filter((n: any) => n.expandedFrom === nodeId);
      const minNodes = rule.minNodes ?? 1;
      passed = children.length >= minNodes;
      evidence = passed
        ? `expanded into ${children.length} node(s): ${children.map((c: any) => c.id).join(', ')}`
        : `expansion incomplete: found ${children.length} child node(s), need >= ${minNodes}`;
    } else if (rule.type === 'manual-approval') {
      // Manual approval requires external sign-off
      passed = false;
      evidence = `manual approval pending${rule.reviewer ? ` from ${rule.reviewer}` : ''}`;
    } else if (rule.type === 'shell') {
      // Run shell command; check exit code matches expectExitCode (default 0)
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const shellValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      const cmdLabel = 'argv' in rule ? rule.argv.join(' ') : String(rule.command);
      if (shellValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${cmdLabel}`;
      } else if ('argv' in rule) {
        // Argv path: spawnSync directly, no shell interpolation
        const { spawnSync } = await import('node:child_process');
        const expectedCode = rule.expectExitCode ?? 0;
        const proc = spawnSync(rule.argv[0], rule.argv.slice(1), {
          cwd: process.cwd(), env: { ...process.env, ROADMAP_VALIDATING: '1' },
          encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000,
        });
        const actualCode = proc.status ?? 1;
        passed = actualCode === expectedCode;
        const stderr = proc.stderr?.trim() ?? '';
        const codeInfo = `exit ${actualCode}, expected ${expectedCode}`;
        evidence = passed
          ? `argv passed (${codeInfo}): ${cmdLabel}`
          : `argv failed: ${cmdLabel} — ${codeInfo} — ${stderr.slice(0, 150)}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          const expectedCode = rule.expectExitCode ?? 0;
          execSync(rule.command, { stdio: 'pipe', env: { ...process.env, ROADMAP_VALIDATING: '1' } });
          passed = true;
          evidence = `command passed (exit ${expectedCode}): ${rule.command}`;
        } catch (e: any) {
          const actualCode = e.status ?? -1;
          const expectedCode = rule.expectExitCode ?? 0;
          passed = actualCode === expectedCode;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          const codeInfo = `exit ${actualCode}, expected ${expectedCode}`;
          evidence = passed
            ? `command exit code matches: ${rule.command} — ${codeInfo}`
            : `command failed: ${rule.command} — ${codeInfo} — ${stderr.slice(0, 150)}`;
        }
      }
    } else if (rule.type === 'build-produces') {
      // Run build command, then check all outputs exist
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const buildValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (buildValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.command}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          execSync(rule.command, { stdio: 'pipe', env: { ...process.env, ROADMAP_VALIDATING: '1' } });
          const missing = rule.outputs.filter((o: string) => !exists(o));
          passed = missing.length === 0;
          evidence = passed
            ? `build passed, all outputs present: ${rule.outputs.join(', ')}`
            : `build passed but missing outputs: ${missing.join(', ')}`;
        } catch (e: any) {
          passed = false;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          evidence = `build failed: ${rule.command} — ${stderr.slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'launch-check') {
      // Start a process, verify it produces a success signal or exits 0 within timeout
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const launchValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (launchValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.command}`;
      } else {
        const timeout = rule.timeout ?? 10000;
        const successSignal = rule.successSignal;
        try {
          const { spawnSync } = await import('node:child_process');
          const result = spawnSync(rule.command, {
            shell: true,
            timeout,
            stdio: 'pipe',
            env: {
              ...process.env,
              ROADMAP_VALIDATING: '1',
              ROADMAP_NODE: nodeId,
              ROADMAP_REPO: opts?.repoRoot ?? process.cwd(),
              ROADMAP_BRANCH: opts?.branch ?? 'unknown',
            },
          });
          const stdout = result.stdout?.toString() || '';
          if (successSignal) {
            passed = stdout.includes(successSignal);
            evidence = passed
              ? `process output contained signal: "${successSignal}"`
              : `process output missing signal: "${successSignal}"`;
          } else {
            passed = result.status === 0;
            evidence = passed
              ? `process exited 0 within ${timeout}ms`
              : `process failed or timed out: exit ${result.status}`;
          }
        } catch (e: any) {
          passed = false;
          evidence = `launch failed: ${rule.command} — ${String(e.message).slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'runtime-explore') {
      // CDP-based behavioral observation: launch app, run explore script, map observations
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const exploreValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (exploreValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.script}`;
      } else if (!opts?.exploreResults) {
        // No explore results provided — non-blocking, signal what needs exploration
        passed = true;
        evidence = `unevaluated: run with --explore to execute ${rule.script}`;
        checks.push({ rule, passed, evidence });
        continue;
      } else {
        const result = opts.exploreResults.find(r => r.script === rule.script);
        if (!result) {
          passed = false;
          evidence = `explore script not found in results: ${rule.script}`;
        } else if (!result.success) {
          passed = false;
          evidence = `explore failed: ${result.error ?? 'unknown error'}`;
        } else if (result.result) {
          // Map observations to individual checks
          const { mapObservationsToChecks } = await import('../exploration/runtime.ts');
          const obsChecks = mapObservationsToChecks(result.result.observations, rule);
          for (const oc of obsChecks) {
            checks.push(oc);
            if (!oc.passed) allPassed = false;
          }
          continue; // already pushed checks
        } else {
          passed = false;
          evidence = `explore result missing for: ${rule.script}`;
        }
      }
    } else if (rule.type === 'spec-conformance') {
      // Verify spec file exists and referenced story numbers appear in it.
      // Resolves spec path: absolute paths used as-is, relative paths resolved from cwd (= repoRoot in CLI context).
      try {
        const { readFileSync: rfs, existsSync: efs } = await import('node:fs');
        const { resolve: resolvePath } = await import('node:path');
        const specPath = resolvePath(process.cwd(), rule.spec);
        if (!efs(specPath)) {
          passed = false;
          evidence = `spec file not found: ${rule.spec}`;
        } else {
          const specContent = rfs(specPath, 'utf-8');
          const storyRefs = (rule.stories ?? []) as number[];
          const missingStories = storyRefs.filter(
            (s: number) =>
              !specContent.includes(`Story ${s}`) &&
              !specContent.includes(`US${s}`) &&
              !specContent.includes(`story-${s}`),
          );
          passed = missingStories.length === 0;
          evidence = passed
            ? `spec conformance: stories [${storyRefs.join(', ')}] found in ${rule.spec}`
            : `spec missing story refs: [${missingStories.join(', ')}] not found in ${rule.spec}`;
        }
      } catch (e: any) {
        passed = false;
        evidence = `spec-conformance error: ${String(e.message).slice(0, 200)}`;
      }
    } else if (rule.type === 'intent') {
      // Intent constraints require LLM judgment. The calling LLM reads the
      // context files and provides its evaluation via --evaluate '[{...}]'.
      // Without judgments: BLOCKING — agent must provide judgment to proceed.
      // With judgments: validates confidence >= rule.confidence + prompt answers.
      const judgment = opts?.intentJudgments?.find(j => j.statement === rule.statement);
      if (judgment) {
        passed = judgment.confidence >= rule.confidence;
        evidence = `confidence=${judgment.confidence.toFixed(2)} (threshold=${rule.confidence}) — ${judgment.reasoning.slice(0, 120)}`;

        // Validate structured reflection prompts if rule defines them
        if (passed && rule.prompt && rule.prompt.length > 0) {
          const answers = judgment.promptAnswers ?? [];
          const minLen = rule.minResponseLength ?? 50;

          if (answers.length < rule.prompt.length) {
            passed = false;
            evidence += ` | BLOCKED: ${rule.prompt.length} reflection prompts required, ${answers.length} answered`;
          } else {
            const tooShort = answers.filter((a, i) => i < rule.prompt.length && a.trim().length < minLen);
            if (tooShort.length > 0) {
              passed = false;
              evidence += ` | BLOCKED: ${tooShort.length} prompt answer(s) below minimum length (${minLen} chars)`;
            }
          }
        }

        checks.push({ rule, passed, evidence, judgment, intentStatus: 'evaluated' });
        if (!passed) allPassed = false;
      } else {
        // Unevaluated — BLOCKING. Agent must provide judgment via --evaluate.
        passed = false;
        const promptHint = rule.prompt && rule.prompt.length > 0
          ? ` Reflection prompts: ${JSON.stringify(rule.prompt)}`
          : '';
        evidence = `unevaluated — judgment required via --evaluate.${promptHint}`;
        checks.push({ rule, passed, evidence, intentStatus: 'unevaluated' });
        allPassed = false;
      }
      continue;
    }

    checks.push({ rule, passed, evidence });
    if (!passed) allPassed = false;
  }

  // Collect failing intents with expandOnFail for expansion
  const failingIntents: IntentFailure[] = [];
  for (const c of checks) {
    if (c.rule.type !== 'intent' || c.passed || c.intentStatus !== 'evaluated') continue;
    const rule = c.rule as { type: 'intent'; statement: string; confidence: number; context?: string[]; expandOnFail?: boolean };
    if (!rule.expandOnFail) continue;
    failingIntents.push({
      statement: rule.statement,
      achieved: c.judgment!.confidence,
      threshold: rule.confidence,
      reasoning: c.judgment!.reasoning,
      evidence: c.judgment!.evidence ?? [],
      context: rule.context,
    });
  }

  if (failingIntents.length > 0) {
    return {
      nodeId,
      passed: false,
      checks,
      failedReason: `${failingIntents.length} intent(s) failed with expandOnFail — expansion required`,
      expansionStatus: 'expanding',
      failingIntents,
    };
  }

  return {
    nodeId,
    passed: allPassed,
    checks,
    failedReason: allPassed ? undefined : `${checks.filter(c => !c.passed).length} validation(s) failed`,
  };
}

/**
 * Validate a batch of nodes (all nodes in a parallel execution group).
 * Batch validation is stricter than individual node validation:
 * - All nodes must pass validation
 * - All produced artifacts must exist (artifact materialization)
 * Returns pass/fail for the entire batch
 */
export async function validateBatch<T extends string>(
  g: Graph<T>,
  batch: string[],
  exists: (artifact: string) => boolean,
): Promise<{
  passed: boolean;
  results: ValidationResult[];
  summary: string;
  missingArtifacts: string[];
}> {
  // Validate each node in the batch
  const results: ValidationResult[] = [];
  const missingArtifacts: string[] = [];

  for (const nodeId of batch) {
    const result = await validateNode(g, nodeId, exists);
    results.push(result);
  }

  // Check that all produced artifacts exist (artifact materialization requirement)
  for (const nodeId of batch) {
    const node = g.nodes[nodeId as keyof typeof g.nodes] as any;
    if (node && node.produces) {
      for (const artifact of node.produces) {
        if (!exists(artifact)) {
          missingArtifacts.push(artifact);
        }
      }
    }
  }

  const allNodesPass = results.every(r => r.passed);
  const allArtifactsExist = missingArtifacts.length === 0;
  const passed = allNodesPass && allArtifactsExist;

  const summary = (() => {
    if (passed) {
      return `Batch complete: ${batch.length} node(s) validated, all artifacts present`;
    }
    const failedNodes = results.filter(r => !r.passed).length;
    const issues: string[] = [];
    if (failedNodes > 0) issues.push(`${failedNodes} node(s) failed validation`);
    if (missingArtifacts.length > 0) issues.push(`${missingArtifacts.length} artifact(s) missing`);
    return `Batch incomplete: ${issues.join(', ')}`;
  })();

  return { passed, results, summary, missingArtifacts };
}

/**
 * Validate all nodes in a graph
 * Returns summary of what passed/failed
 */
export async function validateGraph<T extends string>(
  g: Graph<T>,
  exists: (artifact: string) => boolean,
): Promise<{
  passed: boolean;
  results: ValidationResult[];
  summary: { total: number; passed: number; failed: number; structuralPassed: number; structuralFailed: number; artifactPassed: number; artifactFailed: number };
}> {
  const nodes = Object.keys(g.nodes);
  const results: ValidationResult[] = [];

  for (const nodeId of nodes) {
    const result = await validateNode(g, nodeId, exists);
    results.push(result);
  }

  // Structural: define/check/verify (graph integrity)
  let structuralPassed = 0;
  let structuralFailed = 0;
  try {
    define(g);
    check(g);
    const verifyErrors = verify(g);
    structuralPassed = verifyErrors.length === 0 ? nodes.length : nodes.length - verifyErrors.length;
    structuralFailed = verifyErrors.length;
  } catch {
    structuralFailed = nodes.length;
  }

  // Artifact: artifact-exists rules only
  let artifactPassed = 0;
  let artifactFailed = 0;
  for (const r of results) {
    const artifactChecks = r.checks.filter(c => c.rule.type === 'artifact-exists');
    artifactPassed += artifactChecks.filter(c => c.passed).length;
    artifactFailed += artifactChecks.filter(c => !c.passed).length;
  }

  const passed = results.every(r => r.passed);
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    structuralPassed,
    structuralFailed,
    artifactPassed,
    artifactFailed,
  };

  return { passed, results, summary };
}
