#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  define, check, verify, order, parallelOrder, orient,
  validateNode, validateGraph,
} from '../src/protocol.ts';
import { fileExists } from '../src/predicates.ts';
import { RoadmapError } from '../src/errors.ts';
import type { Graph } from '../src/protocol.ts';

const rawArgs = process.argv.slice(2);
const repoRoot = process.cwd();

// Extract --note and its value, return note + remaining positional args
function extractNote(argv: string[]): { note: string | undefined; positional: string[] } {
  const idx = argv.indexOf('--note');
  if (idx === -1) return { note: undefined, positional: argv };
  const note = argv[idx + 1];
  const positional = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { note, positional };
}

const { note: _note, positional: args } = extractNote(rawArgs);
const cmd = args[0] || 'help';

// Commands that don't require a note
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'trail', 'chart', 'install']);

interface TrailEntry {
  ts: string;
  cmd: string;
  note: string;
  repo: string;
  position?: string;
  dagId?: string;
  detail?: Record<string, unknown>;
}

const hasLocalDAG = existsSync(join(repoRoot, '.roadmap', 'head.json'));
const globalTrailDir = join(homedir(), '.roadmap');
const localTrailDir = join(repoRoot, '.roadmap');

function appendToTrail(dir: string, entry: TrailEntry) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'trail.jsonl'), JSON.stringify(entry) + '\n');
}

function recordTrail(entry: TrailEntry) {
  // Always write to global trail
  appendToTrail(globalTrailDir, entry);
  // Also write to local trail if this repo has a DAG
  if (hasLocalDAG) appendToTrail(localTrailDir, entry);
}

async function main() {
  const note = _note;

  if (!NOTE_EXEMPT.has(cmd) && !note) {
    json({ error: 'Missing --note "reason"', fix: `roadmap ${cmd} --note "why you are running this"` });
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'orient':    return cmdOrient(note!);
      case 'describe':  return cmdDescribe(note!);
      case 'validate':  return cmdValidate(note!);
      case 'expand':    return await cmdExpand(note!);
      case 'branch':    return cmdBranch(note!);
      case 'position':  return cmdOrient(note!); // alias
      case 'parallel':  return cmdParallel(note!);
      case 'trail':     return cmdTrail();
      case 'chart':     return cmdChart();
      case 'install':   return cmdInstall();
      case 'help':
      case '--help':
      case '-h':        return cmdHelp();
      default:
        json({ error: `Unknown command: ${cmd}`, fix: 'roadmap help' });
        process.exit(1);
    }
  } catch (e) {
    if (e instanceof RoadmapError) {
      json(e.toJSON());
    } else {
      json({ error: e instanceof Error ? e.message : String(e) });
    }
    process.exit(1);
  }
}

// --- Commands ---

function cmdOrient(note: string) {
  if (!hasLocalDAG) {
    const result = { position: 'untracked', repo: basename(repoRoot), tracked: false };
    recordTrail({
      ts: new Date().toISOString(),
      cmd: 'orient',
      note,
      repo: basename(repoRoot),
      position: 'untracked',
    });
    json(result);
    return;
  }

  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const result = {
    position: pos.position,
    produces: pos.produces,
    consumes: pos.consumes,
    done: pos.done.length,
    remaining: pos.remaining.length,
    complete: pos.position === dag.term,
  };
  recordTrail({
    ts: new Date().toISOString(),
    cmd: 'orient',
    note,
    repo: basename(repoRoot),
    position: pos.position,
    dagId: dag.id,
    detail: { done: result.done, remaining: result.remaining, complete: result.complete },
  });
  json(result);
}

function cmdDescribe(note: string) {
  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const batches = parallelOrder(dag);
  const apiSurface = scanExports();

  recordTrail({ ts: new Date().toISOString(), cmd: 'describe', note, repo: basename(repoRoot), position: pos.position, dagId: dag.id });

  json({
    id: dag.id,
    desc: dag.desc,
    nodes: Object.keys(dag.nodes).length,
    position: pos.position,
    complete: pos.position === dag.term,
    remaining: pos.remaining.length,
    parallelBatches: batches.length,
    entryPoints: {
      'roadmap': 'Full API — DAG ops + recovery + versioning + predicates + errors',
      'roadmap/protocol': 'Core — define, verify, orient, merge, branch, reconcile, parallelOrder',
      'roadmap/agent': 'Sealed agent API — getBrief, advance, checkpoint',
      'roadmap/recovery': 'CheckpointManager + AuditTrail',
      'roadmap/validation': 'validateNode, validateGraph',
      'roadmap/versioning': 'loadDAG, migration, compatibility',
    },
    exports: apiSurface,
    types: [
      'NodeSpec<TAll, TSelf>', 'Graph<T>', 'Orientation', 'Connection', 'Gap',
      'ValidationRule', 'ValidationCheck', 'ValidationResult',
      'Brief', 'FinalHandoff', 'InterimHandoff',
      'RoadmapError', 'ErrorCode',
    ],
  });
}

async function cmdValidate(note: string) {
  const dag = loadDAG();
  const nodeId = args[1];

  recordTrail({ ts: new Date().toISOString(), cmd: 'validate', note, repo: basename(repoRoot), dagId: dag.id, detail: { nodeId: nodeId || 'all' } });

  if (nodeId) {
    const result = await validateNode(dag, nodeId, fileExists(repoRoot));
    json(result);
  } else {
    const result = await validateGraph(dag, fileExists(repoRoot));
    json(result.summary);
  }
}

async function cmdExpand(note: string) {
  const scriptPath = args[1];
  if (!scriptPath) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap expand <script.ts>',
      entry: 'bin/roadmap',
    }, 'Missing expansion script path');
  }

  const resolved = resolve(repoRoot, scriptPath);
  if (!existsSync(resolved)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: resolved,
      fix: `Create ${scriptPath} first`,
    }, `Expansion script not found: ${resolved}`);
  }

  // Snapshot before
  const dagBefore = loadDAG();
  const nodesBefore = Object.keys(dagBefore.nodes).length;

  // Run the expansion script
  execSync(`node --experimental-strip-types ${resolved}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  // Snapshot after
  const dagAfter = loadDAG();
  const nodesAfter = Object.keys(dagAfter.nodes).length;
  const added = nodesAfter - nodesBefore;

  // Validate
  const checkResult = check(dagAfter);
  const verifyErrors = verify(dagAfter);

  if (!checkResult.done || verifyErrors.length) {
    throw new RoadmapError('VALIDATION_FAILED', {
      attempted: scriptPath,
      fix: 'Fix the expansion script and re-run',
    }, `Expansion produced invalid DAG: ${verifyErrors.length} errors`);
  }

  // Commit
  execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
  const msg = `roadmap: expand — ${added} nodes added via ${scriptPath}`;
  execSync(`git commit -m "${msg}"`, { cwd: repoRoot, stdio: 'pipe' });
  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  recordTrail({ ts: new Date().toISOString(), cmd: 'expand', note, repo: basename(repoRoot), dagId: dagAfter.id, detail: { script: scriptPath, added, commit: hash } });

  json({
    expanded: true,
    script: scriptPath,
    nodesBefore,
    nodesAfter,
    added,
    commit: hash,
  });
}

function cmdBranch(note: string) {
  const branchName = args[1];
  const dagFile = args[2];

  if (!branchName) {
    throw new RoadmapError('VALIDATION_FAILED', {
      fix: 'roadmap branch <name> [dag.json]',
    }, 'Missing branch name');
  }

  // Create git branch
  execSync(`git checkout -b ${branchName}`, { cwd: repoRoot, stdio: 'pipe' });

  if (dagFile) {
    // Copy separate DAG as the branch's head.json
    const dagPath = resolve(repoRoot, dagFile);
    if (!existsSync(dagPath)) {
      throw new RoadmapError('NODE_NOT_FOUND', {
        attempted: dagPath,
        fix: `Create ${dagFile} first`,
      });
    }

    const dagContent = readFileSync(dagPath, 'utf-8');
    const dag = JSON.parse(dagContent);

    // Validate
    const checkResult = check(dag);
    const verifyErrors = verify(dag);
    if (!checkResult.done || verifyErrors.length) {
      execSync('git checkout -', { cwd: repoRoot, stdio: 'pipe' });
      throw new RoadmapError('VALIDATION_FAILED', {
        attempted: dagFile,
        fix: 'Fix the DAG and re-run',
      });
    }

    // Write as the branch's DAG
    const headPath = join(repoRoot, '.roadmap', 'head.json');
    writeFileSync(headPath, JSON.stringify(dag, null, 2));
    execSync('git add .roadmap/head.json', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "roadmap: branch ${branchName} — separate DAG"`, { cwd: repoRoot, stdio: 'pipe' });
  }

  const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

  recordTrail({ ts: new Date().toISOString(), cmd: 'branch', note, repo: basename(repoRoot), detail: { branch: branchName, dagFile: dagFile || null, commit: hash } });

  json({
    branch: branchName,
    dagFile: dagFile || '(inherited from parent)',
    commit: hash,
  });
}

function cmdParallel(note: string) {
  const dag = loadDAG();
  const batches = parallelOrder(dag);
  recordTrail({ ts: new Date().toISOString(), cmd: 'parallel', note, repo: basename(repoRoot), dagId: dag.id });

  json({
    batches: batches.map((b, i) => ({ level: i, nodes: b, count: b.length })),
    totalLevels: batches.length,
    maxParallelism: Math.max(...batches.map(b => b.length)),
  });
}

function cmdTrail() {
  const useGlobal = args.includes('--global');
  const dir = useGlobal ? globalTrailDir : (hasLocalDAG ? localTrailDir : globalTrailDir);
  const trailPath = join(dir, 'trail.jsonl');
  const source = useGlobal ? 'global' : (hasLocalDAG ? 'local' : 'global');

  if (args.includes('--archive')) {
    if (!existsSync(trailPath)) {
      json({ archived: false, reason: 'no trail to archive' });
      return;
    }
    const lines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);

    if (source === 'local') {
      // Local trail: commit to git then truncate
      execSync('git add .roadmap/trail.jsonl', { cwd: repoRoot, stdio: 'pipe' });
      execSync(`git commit -m "roadmap: archive trail (${lines.length} entries)"`, { cwd: repoRoot, stdio: 'pipe' });
      const hash = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
      writeFileSync(trailPath, '');
      json({ archived: true, source, entries: lines.length, commit: hash });
    } else {
      // Global trail: just truncate (no git repo to commit to)
      writeFileSync(trailPath, '');
      json({ archived: true, source, entries: lines.length });
    }
    return;
  }

  if (!existsSync(trailPath)) {
    json({ entries: [], count: 0, source });
    return;
  }
  const lines = readFileSync(trailPath, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  const limit = args.includes('--last') ? parseInt(args[args.indexOf('--last') + 1]) || 10 : undefined;
  const repoFilter = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : undefined;
  let filtered = repoFilter ? entries.filter((e: any) => e.repo === repoFilter) : entries;
  filtered = limit ? filtered.slice(-limit) : filtered;

  json({ entries: filtered, count: entries.length, source });
}

function cmdChart() {
  if (!hasLocalDAG) {
    console.log('📭 No roadmap in this repo. Run `roadmap install` to set up.');
    return;
  }

  const dag = loadDAG();
  const pos = orient(dag, fileExists(repoRoot));
  const batches = parallelOrder(dag);
  const nodeIds = Object.keys(dag.nodes);
  const doneSet = new Set(pos.done);
  const totalNodes = nodeIds.length;
  const doneCount = pos.done.length;
  const pct = Math.round((doneCount / totalNodes) * 100);

  // Overall progress bar
  const barLen = 30;
  const filled = Math.round((doneCount / totalNodes) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const statusEmoji = pct === 100 ? '🏁' : pct > 75 ? '🔥' : pct > 50 ? '⚡' : pct > 25 ? '🚧' : '🌱';

  console.log('');
  console.log(`${statusEmoji} ${dag.id} — ${dag.desc}`);
  console.log(`  ${bar} ${pct}% (${doneCount}/${totalNodes} nodes)`);
  console.log(`  📍 position: ${pos.position}`);
  console.log('');

  // Per-batch progress
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchDone = batch.filter(n => doneSet.has(n)).length;
    const batchPct = Math.round((batchDone / batch.length) * 100);
    const bFilled = Math.round((batchDone / batch.length) * 15);
    const bBar = '█'.repeat(bFilled) + '░'.repeat(15 - bFilled);

    const levelEmoji = batchPct === 100 ? '✅' : batchDone > 0 ? '🔶' : '⬜';
    const nodeList = batch.map(n => {
      if (n === pos.position) return `👉 ${n}`;
      if (doneSet.has(n)) return `✅ ${n}`;
      return `⬜ ${n}`;
    }).join('  ');

    console.log(`  ${levelEmoji} L${String(i).padStart(2, '0')} ${bBar} ${String(batchPct).padStart(3)}%  ${nodeList}`);
  }

  console.log('');
  if (pct === 100) {
    console.log('  🎉 ROADMAP COMPLETE');
  } else {
    const next = pos.remaining[0];
    if (next) {
      const nextNode = dag.nodes[next as keyof typeof dag.nodes] as any;
      console.log(`  ➡️  Next: ${next} — ${nextNode?.desc || ''}`);
    }
  }
  console.log('');
}

function cmdInstall() {
  // Resolve the absolute path to this CLI
  const scriptDir = resolve(import.meta.dirname || join(repoRoot, 'bin'));
  const binPath = join(scriptDir, 'roadmap');

  const claudeMdPath = args[1] || join(repoRoot, '.claude', 'CLAUDE.md');
  const resolvedPath = resolve(claudeMdPath);

  const ANCHOR_START = '<!-- ROADMAP-PROTOCOL-START -->';
  const ANCHOR_END = '<!-- ROADMAP-PROTOCOL-END -->';

  const protocolBlock = `${ANCHOR_START}
## Roadmap Protocol

Every interaction that mutates state (code, files, config, infra, docs) is roadmap-governed. Only pure reasoning (Q&A, explanation, no artifacts) is exempt. Planning is a task — it produces a DAG.

### Session protocol

**Start** — run this before anything else:
\`\`\`
${binPath} orient --note "session start — <intent>"
\`\`\`
Then **reprint the chart verbatim**:
\`\`\`
${binPath} chart
\`\`\`
The chart output is the project status. Print it as-is in your response — do not summarize, paraphrase, or omit any part. This is how the user sees progress.

**During work** — orient after completing logical units:
\`\`\`
${binPath} orient --note "<what changed>"
${binPath} chart
\`\`\`
Reprint the chart after each orient. The user should always see current progress.

**End** — archive the session trail:
\`\`\`
${binPath} trail --archive
\`\`\`

### Behavior
- Position comes from orient, not memory — never infer
- If no local DAG exists: orient returns \`position: "untracked"\`, breadcrumb still records globally
- For multi-step work in an untracked repo: create \`.roadmap/head.json\` (init → term, expand between)
- Trail: \`trail --global\` for cross-project view, \`trail --repo <name>\` to filter, \`trail --last N\` for recent

### Chart
Run \`${binPath} chart\` frequently. **Always reprint the full output verbatim.** This is the canonical progress view — emoji progress bars, per-batch breakdown, current position. Never summarize it.
${ANCHOR_END}`;

  if (!existsSync(resolvedPath)) {
    // Create new CLAUDE.md with just the protocol
    const dir = resolve(resolvedPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedPath, protocolBlock + '\n');
    console.log(`✅ Created ${resolvedPath} with roadmap protocol`);
    console.log(`   bin: ${binPath}`);
    return;
  }

  // Read existing, splice or append
  let content = readFileSync(resolvedPath, 'utf-8');

  if (content.includes(ANCHOR_START) && content.includes(ANCHOR_END)) {
    // Replace existing block
    const re = new RegExp(
      escapeRegex(ANCHOR_START) + '[\\s\\S]*?' + escapeRegex(ANCHOR_END),
    );
    content = content.replace(re, protocolBlock);
    writeFileSync(resolvedPath, content);
    console.log(`🔄 Updated roadmap protocol in ${resolvedPath}`);
  } else {
    // Append
    content = content.trimEnd() + '\n\n' + protocolBlock + '\n';
    writeFileSync(resolvedPath, content);
    console.log(`➕ Appended roadmap protocol to ${resolvedPath}`);
  }
  console.log(`   bin: ${binPath}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cmdHelp() {
  console.log(`roadmap — DAG expansion protocol CLI

Commands:
  orient              Current position + produces/consumes (JSON)
  describe            Full API surface + project state (JSON)
  validate [node]     Run validation rules (all nodes or specific)
  expand <script.ts>  Run expansion script, validate DAG, commit
  branch <name> [dag] Create git branch with optional separate DAG
  parallel            Show parallel execution batches
  chart               Pretty-print progress chart with emoji bars
  trail [--last N]    Read the invocation trail (local or global)
  trail --global      Cross-project trail (~/.roadmap/trail.jsonl)
  trail --repo <name> Filter trail by repo name
  trail --archive     Commit trail (local) or truncate (global)
  install [path]      Install protocol into CLAUDE.md (default: .claude/CLAUDE.md)
  help                This message

All commands (except help/trail/chart/install) require --note "reason".

Examples:
  roadmap orient --note "session start"
  roadmap chart
  roadmap install
  roadmap install ~/.claude/CLAUDE.md
  roadmap trail --global --last 5`);
}

// --- Helpers ---

function loadDAG(): Graph<string> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    throw new RoadmapError('NODE_NOT_FOUND', {
      attempted: headPath,
      fix: 'Initialize roadmap: create .roadmap/head.json',
      entry: 'roadmap orient',
    }, 'No roadmap found at .roadmap/head.json');
  }
  return JSON.parse(readFileSync(headPath, 'utf-8'));
}

function json(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function scanExports(): Record<string, string[]> {
  const srcDir = join(repoRoot, 'src');
  const result: Record<string, string[]> = {};

  try {
    const files = execSync('ls src/*.ts', { cwd: repoRoot, encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);

    for (const file of files) {
      const content = readFileSync(join(repoRoot, file), 'utf-8');
      const match = content.match(/^\/\/ @exports (.+)$/m);
      if (match) {
        result[file] = match[1].split(',').map(s => s.trim());
      }
    }
  } catch {
    // Non-fatal: return what we found
  }

  return result;
}

await main();
