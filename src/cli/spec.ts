// @module cli/spec
// @description Spec pipeline commands: plan (gallery, select, status), migrate.
// @exports run

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { persistDAG } from '../lib/persist-dag.ts';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { define, check, verify } from '../lib/protocol/index.ts';
import { buildGallery } from '../lib/gallery-templates/index.ts';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';
import { appendTrail, json, hasFlag } from './shared.ts';

export async function run(
  args: string[],
  repoRoot: string,
  note: string | undefined,
  outputOpts: OutputOpts,
): Promise<void> {
  const sub = args[1];
  switch (sub) {
    case 'help':
    case '--help':
    case '-h':
      return specHelp(outputOpts);
    case 'plan':     return await planRouter(args, repoRoot, note!, outputOpts);
    case 'migrate':  return await specMigrate(args, repoRoot, note!, outputOpts);
    default:
      json({ error: `Unknown spec subcommand: ${sub}`, fix: 'roadmap spec [plan | migrate] ...', hint: "Run 'roadmap api --all' to see full command registry." }, outputOpts);
      process.exit(1);
  }
}

function specHelp(outputOpts: OutputOpts): void {
  json({
    command: 'spec',
    description: 'Spec planning pipeline',
    subcommands: [
      { name: 'plan', args: '[--gallery|select <id>|status]', description: 'Spec planning: gallery, selection, status' },
      { name: 'migrate', args: '<path>', description: 'Auto-fix legacy spec files with missing required fields' },
    ],
    examples: [
      'roadmap spec plan --gallery --note "show gallery"',
      'roadmap spec plan select auth-spec --note "select spec"',
      'roadmap spec plan status',
      'roadmap spec migrate legacy-spec.json --note "fix legacy spec"',
    ],
  }, outputOpts);
}

async function planRouter(
  args: string[], repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  if (args.includes('--gallery')) return await planGallery(args, repoRoot, note, outputOpts);
  if (args[2] === 'select') return await planSelect(args, repoRoot, note, outputOpts);
  if (args[2] === 'status') return await planStatus(args, repoRoot, outputOpts);
  json({ error: 'Unknown plan subcommand', fix: 'roadmap spec plan --gallery | spec plan select <id> --note "..." | spec plan status' }, outputOpts);
  process.exit(1);
}

async function planGallery(
  args: string[], repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';
  const evalDir = join(repoRoot, '.roadmap', 'evaluations');

  if (!existsSync(specSource)) {
    json({ error: `Spec source not found: ${specSource}`, fix: 'Run: roadmap spec compile --note "compile spec"' }, outputOpts);
    process.exit(1);
    return;
  }

  const jsonOutput = hasFlag(['--json', '-j'], args);
  const candidates = buildGallery(specSource, evalDir);

  if (jsonOutput) {
    appendTrail({
      ts: new Date().toISOString(), cmd: 'spec.plan.gallery', note,
      repo: basename(repoRoot),
      detail: { candidateCount: candidates.length, specSource },
    }, repoRoot);
    json({ candidates, specSource }, outputOpts);
    return;
  }

  const COL_WIDTHS = [20, 6, 14, 10, 8];
  const headers = ['id', 'nodes', 'wallClockMin', 'costUSD', 'risk'];
  const sep = headers.map((_, i) => '-'.repeat(COL_WIDTHS[i])).join('-+-');
  const headerRow = headers.map((h, i) => h.padEnd(COL_WIDTHS[i])).join(' | ');

  const lines: string[] = [];
  lines.push('');
  lines.push('Plan Gallery — Pareto-filtered candidates');
  lines.push('');
  lines.push(headerRow);
  lines.push(sep);

  for (const c of candidates) {
    const row = [
      c.id.padEnd(COL_WIDTHS[0]),
      String(c.estimates.nodes).padEnd(COL_WIDTHS[1]),
      c.estimates.wallClockMinutes.toFixed(1).padEnd(COL_WIDTHS[2]),
      c.estimates.costUSD.toFixed(4).padEnd(COL_WIDTHS[3]),
      c.estimates.risk.toFixed(2).padEnd(COL_WIDTHS[4]),
    ];
    lines.push(row.join(' | '));
  }

  lines.push('');
  const recommended = candidates.reduce((best, c) => c.estimates.risk < best.estimates.risk ? c : best, candidates[0]);
  lines.push(`Recommendation: ${recommended.id} (risk=${recommended.estimates.risk.toFixed(2)}, cost=$${recommended.estimates.costUSD.toFixed(4)})`);
  lines.push('');
  lines.push(`Select [${candidates.map((_, i) => String.fromCharCode(65 + i)).join('/')}]:`);
  lines.push('  roadmap spec plan select <id> --note "..."');
  lines.push('');

  appendTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.gallery', note,
    repo: basename(repoRoot),
    detail: { candidateCount: candidates.length, recommended: recommended.id, specSource },
  }, repoRoot);

  console.log(lines.join('\n'));
}

async function planSelect(
  args: string[], repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  const selectId = args[2];
  if (!selectId) {
    json({ error: 'Missing candidate ID', fix: 'roadmap spec plan select <id> --note "..."' }, outputOpts);
    process.exit(1);
    return;
  }

  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';
  const evalDir = join(repoRoot, '.roadmap', 'evaluations');
  const headPath = join(repoRoot, '.roadmap', 'head.json');

  const candidates = buildGallery(specSource, evalDir);
  const selected = candidates.find(c => c.id === selectId);

  if (!selected) {
    json({ error: `Candidate "${selectId}" not found in gallery`, available: candidates.map(c => c.id) }, outputOpts);
    process.exit(1);
    return;
  }

  if (!existsSync(evalDir)) mkdirSync(evalDir, { recursive: true });
  const runId = Date.now().toString(36);
  const selectionRecord = {
    phase: `plan-selection:${runId}`,
    selectedId: selected.id,
    manualOverride: true,
    specSource,
    ts: new Date().toISOString(),
  };
  appendFileSync(join(evalDir, 'plan-selection.jsonl'), JSON.stringify(selectionRecord) + '\n', 'utf-8');

  try {
    define(selected.dag as any);
    const verifyErrors = verify(selected.dag as any);
    if (verifyErrors.length > 0) {
      json({
        error: 'Selected execution plan failed validation',
        details: verifyErrors,
        fix: 'The strategy DAG has contract violations. This is a bug in the strategy generation.',
      }, outputOpts);
      process.exit(1);
    }
    const checkResult = check(selected.dag as any);
    if (!checkResult.done) {
      json({
        error: 'Selected execution plan is incomplete',
        orphans: checkResult.orphans,
        fix: 'The strategy DAG has unreachable nodes. This is a bug in the strategy generation.',
      }, outputOpts);
      process.exit(1);
    }
  } catch (e: any) {
    json({
      error: 'Selected execution plan failed structural validation',
      reason: e.message || String(e),
      fix: 'The strategy DAG is malformed. This is a bug in the strategy generation.',
    }, outputOpts);
    process.exit(1);
  }

  persistDAG(repoRoot, selected.dag as any);

  try {
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "roadmap: strategy select ${selected.id} — execution plan with gates baked in"`, {
      cwd: repoRoot, stdio: 'pipe',
    });
  } catch { /* commit might fail if no changes */ }

  appendTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.select', note,
    repo: basename(repoRoot),
    detail: { selectedId: selected.id, runId, specSource, manualOverride: true },
  }, repoRoot);

  json({ selected: selected.id, committed: true, headPath: '.roadmap/head.json', recovery: 'roadmap dig .roadmap/head.json --restore' }, outputOpts);
}

async function planStatus(
  args: string[], repoRoot: string, outputOpts: OutputOpts,
): Promise<void> {
  const specSourceIdx = args.indexOf('--from');
  const specSource = specSourceIdx !== -1 ? args[specSourceIdx + 1] : '.roadmap/spec-source.json';

  if (!existsSync(specSource)) {
    json({ error: `Spec source not found: ${specSource}` }, outputOpts);
    process.exit(1);
    return;
  }

  const evalDir = join(repoRoot, '.roadmap', 'evaluations');
  const selectionPath = join(evalDir, 'plan-selection.jsonl');

  let selectedId = undefined;
  if (existsSync(selectionPath)) {
    const lines = readFileSync(selectionPath, 'utf-8').split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const latest = JSON.parse(lines[lines.length - 1]);
      selectedId = latest.selectedId;
    }
  }

  const candidates = buildGallery(specSource, evalDir);

  appendTrail({
    ts: new Date().toISOString(), cmd: 'spec.plan.status', note: '', repo: basename(repoRoot),
    detail: { selectedId, candidates: candidates.length },
  }, repoRoot);

  json({ candidates, selected: selectedId, totalCandidates: candidates.length }, outputOpts);
}

async function specMigrate(
  args: string[], repoRoot: string, note: string, outputOpts: OutputOpts,
): Promise<void> {
  const specPath = args[2];

  if (!specPath) {
    json({ error: 'Missing spec path', fix: 'roadmap spec migrate <path> --note "reason"' }, outputOpts);
    process.exit(1);
  }

  if (!existsSync(specPath)) {
    json({ error: `Spec file not found: ${specPath}` }, outputOpts);
    process.exit(1);
  }

  try {
    const content = readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(content) as any;
    const fixed: string[] = [];

    if (!spec.inputs || !Array.isArray(spec.inputs) || spec.inputs.length === 0) {
      const sha256 = createHash('sha256').update(content).digest('hex');
      spec.inputs = [{ path: specPath, sha256, role: 'spec' }];
      fixed.push('inputs');
    }

    if (!spec.metadata) spec.metadata = {};
    if (!spec.metadata.compile_hash) {
      spec.metadata.compile_hash = 'auto';
      fixed.push('metadata.compile_hash');
    }
    if (!spec.metadata.generated) {
      spec.metadata.generated = new Date().toISOString();
      fixed.push('metadata.generated');
    }

    if (!spec.engine) {
      spec.engine = { name: 'spec-kit', version: '1.0.0', config_hash: null };
      fixed.push('engine');
    }

    if (!spec.dag_desc && spec.tasks && spec.tasks.length > 0) {
      spec.dag_desc = spec.tasks[0].desc;
      fixed.push('dag_desc');
    }

    if (!spec.schema_version) {
      spec.schema_version = 1;
      fixed.push('schema_version');
    }

    writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

    appendTrail({
      ts: new Date().toISOString(), cmd: 'spec.migrate', note,
      repo: basename(repoRoot),
      detail: { path: specPath, fixed },
    }, repoRoot);

    json({ ok: true, fixed, path: specPath }, outputOpts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json({ error: `Failed to migrate spec: ${message}`, path: specPath }, outputOpts);
    process.exit(1);
  }
}
