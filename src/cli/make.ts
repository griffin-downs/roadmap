// @module cli/make
// @description Make command: create ideal DAG from spec, validate, commit.
// @exports run

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { tasksToDAG } from '../lib/intake/speckit-import.ts';
import { collectMakeErrors } from '../lib/make-validation.ts';
import type { SpecOrigin } from '../lib/intake/spec-origin.ts';
import { persistDAG } from '../lib/persist-dag.ts';
import { RoadmapError } from '../errors.ts';
import type { OutputOpts } from '../lib/cli-envelope.ts';
import { loadDAG, crossOrientWithState, appendTrail, json } from './shared.ts';

export async function run(
  args: string[],
  repoRoot: string,
  note: string,
  outputOpts: OutputOpts,
): Promise<void> {
  const specPath = args[1];
  if (!specPath) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap make <spec-path>',
      entry: 'bin/roadmap',
    }, 'Missing spec path');
  }

  const resolved = resolve(repoRoot, specPath);
  if (!existsSync(resolved)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: resolved,
      fix: `Create ${specPath} first`,
    }, `Spec not found: ${resolved}`);
  }

  const specContent = readFileSync(resolved, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(specContent);
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec is valid JSON',
    }, `Failed to parse spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Reject raw DAG JSON
  if (parsed.nodes && typeof parsed.nodes === 'object' && !parsed.tasks) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: [
        'Cannot create DAG from raw JSON.',
        'roadmap make expects a spec (with tasks[], metadata, schema_version), not a raw DAG definition.',
        '',
        'Proper workflow:',
        '  1. Author a spec.json with tasks[] (see /roadmap-spec skill)',
        '  2. roadmap make spec.json --note "..."',
        '  3. roadmap show <node-id> to inspect',
      ].join('\n'),
    }, 'Invalid spec: raw DAG detected. Author a spec with tasks[] first.');
  }

  // Validate required spec fields
  const specErrors: Array<{ gate: string; message: string; fix: string }> = [];
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "tasks" array', fix: 'Spec must have a "tasks" array. See /roadmap-spec skill for spec authoring.' });
  }
  if (!parsed.metadata || typeof parsed.metadata !== 'object') {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "metadata" object', fix: 'Spec must have a "metadata" object with "generated" and "compile_hash".' });
  }
  if (!parsed.schema_version) {
    specErrors.push({ gate: 'spec-structure', message: 'Missing "schema_version"', fix: 'Spec must have "schema_version".' });
  }
  if (specErrors.length > 0) {
    throw new RoadmapError('VALIDATION_FAILED', {
      errors: specErrors,
      fix: specErrors.map(e => `[${e.gate}] ${e.fix}`).join('\n'),
    }, `${specErrors.length} spec structure error(s) found`);
  }

  // Input artifact verification
  if (!args.includes('--skip-input-verification')) {
    if (!Array.isArray(parsed.inputs) || parsed.inputs.length === 0) {
      throw new RoadmapError('VALIDATION_FAILED', {
        fix: [
          'Spec must have a non-empty "inputs" array listing source files.',
          'Each entry: { path: "<file>", sha256: "<hash>", role: "spec"|"tasks"|"plan"|... }',
          'At least one input must have role "spec", "tasks", or "plan".',
        ].join('\n'),
      }, 'Invalid spec: missing or empty "inputs" array');
    }

    for (const inp of parsed.inputs) {
      if (!inp || typeof inp !== 'object' || !inp.path || !inp.sha256 || !inp.role) {
        throw new RoadmapError('VALIDATION_FAILED', {
          fix: 'Each input must have: { path: string, sha256: string, role: string }',
          entry: JSON.stringify(inp),
        }, 'Invalid spec: malformed input entry');
      }
    }

    const specRoles = new Set(['spec', 'tasks', 'plan']);
    const hasSpecRole = parsed.inputs.some((inp: any) => specRoles.has(inp.role));
    if (!hasSpecRole) {
      throw new RoadmapError('VALIDATION_FAILED', {
        fix: 'At least one input must have role "spec", "tasks", or "plan".',
        roles: parsed.inputs.map((inp: any) => inp.role),
      }, 'Invalid spec: no input with spec/tasks/plan role');
    }

    const warnings: string[] = [];
    const rehashes: string[] = [];
    for (const inp of parsed.inputs) {
      const inputPath = resolve(repoRoot, inp.path);
      if (!existsSync(inputPath)) {
        warnings.push(`input not found (skipped): ${inp.path}`);
        continue;
      }
      const content = readFileSync(inputPath, 'utf-8');
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== inp.sha256) {
        if (args.includes('--rehash')) {
          inp.sha256 = actual;
          rehashes.push(`${inp.path}: updated hash to ${actual}`);
        } else {
          throw new RoadmapError('VALIDATION_FAILED', {
            fix: `Input "${inp.path}" hash mismatch. Expected ${inp.sha256}, got ${actual}. Use --rehash to auto-update.`,
          }, `Input hash mismatch for ${inp.path}`);
        }
      }
    }

    if (warnings.length > 0) {
      (parsed as any)._inputWarnings = warnings;
    }
    if (rehashes.length > 0) {
      writeFileSync(resolved, JSON.stringify(parsed, null, 2) + '\n');
      (parsed as any)._rehashed = rehashes;
    }
  }

  // Hard cutover · §Sidecar-slot · per-task ad-hoc fields go in sidecar.{},
  // not flat-as-siblings. Engine invariant fields are the allowlist below; any extra
  // top-level key on a task throws — agents move it to sidecar.{} and re-compile.
  const TASK_INVARIANTS = new Set([
    'id', 'desc', 'description',
    'produces', 'consumes', 'mode', 'validate',
    'sidecar',
  ]);
  const sidecarErrors: Array<{ taskId: string; flatKeys: string[] }> = [];
  for (const t of parsed.tasks as any[]) {
    if (!t || typeof t !== 'object') continue;
    const flat = Object.keys(t).filter(k => !TASK_INVARIANTS.has(k));
    if (flat.length > 0) sidecarErrors.push({ taskId: t.id ?? '<unknown>', flatKeys: flat });
  }
  if (sidecarErrors.length > 0) {
    const fixLines = sidecarErrors.slice(0, 10).map(e =>
      `  ${e.taskId}: move ${e.flatKeys.map(k => `"${k}"`).join(', ')} into sidecar.{}`
    );
    throw new RoadmapError('VALIDATION_FAILED', {
      sidecarErrors,
      fix: [
        '§Sidecar-slot · ad-hoc per-task fields must live under tasks[].sidecar.{}',
        'not flat as siblings to required fields. Engine-allowed top-level keys:',
        `  ${[...TASK_INVARIANTS].join(', ')}`,
        'Migration:',
        ...fixLines,
        sidecarErrors.length > 10 ? `  ... and ${sidecarErrors.length - 10} more tasks` : '',
      ].filter(Boolean).join('\n'),
    }, `${sidecarErrors.length} task(s) have flat ad-hoc fields · use sidecar.{} per §Sidecar-promotion-rule`);
  }

  // Normalize tasks
  const normalizedTasks = (parsed.tasks as any[]).map((t: any) => ({
    ...t,
    mode: t.mode ?? 'execute',
    desc: t.desc ?? t.description ?? '',
  }));

  // Convert spec to DAG
  let dag: any;
  try {
    dag = tasksToDAG(normalizedTasks, { dagId: parsed.dag_id ?? parsed.id ?? 'ideal-dag', dagDesc: parsed.dag_desc });
  } catch (e) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'Ensure spec conforms to SpecIR format',
    }, `Failed to convert spec: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Auto-inject successor spec into term node produces + validator
  const _dagIdForSuccessor = dag.id ?? parsed.dag_id ?? 'unknown';
  const successorSpecFile = `docs/${_dagIdForSuccessor}-successor.spec.json`;
  const termNode = dag.nodes[dag.term];
  if (termNode && !termNode.produces.includes(successorSpecFile)) {
    termNode.produces = [...termNode.produces, successorSpecFile];
    // Validator: successor spec must exist and be valid JSON with dag_id or converged field
    const successorValidator = {
      type: 'shell' as const,
      command: `node -e "const d=JSON.parse(require('fs').readFileSync('${successorSpecFile}','utf-8')); if(!d.dag_id && !d.converged) process.exit(1)"`,
    };
    termNode.validate = [...(termNode.validate ?? []), successorValidator];
  }

  // Validate the DAG
  const isDryRun = args.includes('--dry-run');
  const allErrors = collectMakeErrors(dag, { skipTerminalIntent: args.includes('--skip-terminal-intent') });
  const errors = allErrors.filter((e: any) => e.severity !== 'warning');
  const makeWarnings = allErrors.filter((e: any) => e.severity === 'warning');
  if (errors.length > 0) {
    if (isDryRun) {
      json({ ok: false, dryRun: true, errors, warnings: makeWarnings, message: `${errors.length} validation error(s) found` }, outputOpts);
      return;
    }
    throw new RoadmapError('VALIDATION_FAILED', {
      errors,
      warnings: makeWarnings,
      fix: errors.map(e => `[${e.gate}] ${e.fix}`).join('\n'),
    }, `${errors.length} validation error(s) found`);
  }

  if (isDryRun) {
    const pos = await crossOrientWithState(dag, repoRoot);
    json({ ok: true, dryRun: true, dag, position: pos.position, level: pos.level, errors: [], message: 'Dry run: spec validates successfully (no files written)' }, outputOpts);
    return;
  }

  // Build spec-origin lineage
  const dagId = dag.id ?? parsed.dag_id ?? parsed.id ?? 'ideal-dag';
  const specHash = createHash('sha256').update(specContent).digest('hex');

  let compileHash = parsed.metadata?.compile_hash;
  if (!compileHash || compileHash === 'auto') {
    const tasksJson = JSON.stringify(parsed.tasks || []);
    compileHash = createHash('sha256').update(tasksJson).digest('hex');
  }

  const origin: SpecOrigin = {
    schemaVersion: 1,
    engine: parsed.engine?.name ?? 'spec-kit',
    version: parsed.engine?.version ?? '0.0.0',
    compile_hash: compileHash,
    spec_sha: specHash,
    importedAt: new Date().toISOString(),
    dagId,
  };

  // Embed _origin into DAG before persisting
  (dag as any)._origin = origin;

  // persistDAG writes head.json + heads/<dagId>.json atomically so
  // cli-auto-merge cannot race a mutator out of existence.
  persistDAG(repoRoot, dag);

  // Auto-complete init node (synthetic, no real work)
  const initNode = dag.nodes[dag.init];
  if (initNode && initNode.id === 'init') {
    try {
      const { saveCompletionWithEvidence } = await import('../runtime/completion.ts');
      saveCompletionWithEvidence(repoRoot, initNode.id, [
        { rule: 'auto-init', passed: true, evidence: 'Synthetic init auto-completed at make time' },
      ]);
    } catch { /* best-effort */ }
  }

  // Commit
  let commitWarning: string | undefined;
  try {
    execSync('git add .roadmap/head.json .roadmap/heads/', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "make: ideal DAG from ${specPath}"`, { cwd: repoRoot, stdio: 'pipe' });
  } catch (e: any) {
    const stderr = e.stderr?.toString().trim() || e.message || 'unknown error';
    commitWarning = `Git commit failed (head.json written but uncommitted): ${stderr.slice(0, 200)}`;
  }

  const pos = await crossOrientWithState(dag, repoRoot);

  appendTrail({
    ts: new Date().toISOString(),
    cmd: 'make',
    note,
    repo: basename(repoRoot),
    position: pos.position,
    level: pos.level,
    detail: { spec: specPath, nodes: Object.keys(dag.nodes ?? {}).length },
  }, repoRoot);

  json({
    ok: true,
    dag,
    position: pos.position,
    level: pos.level,
    message: 'Ideal DAG created from spec',
    ...(commitWarning ? { commitWarning } : {}),
  }, outputOpts);
}
