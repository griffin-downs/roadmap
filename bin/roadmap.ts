#!/usr/bin/env node

// @module cli
// @description Thin router — delegates to src/cli/ modules.
// @exports (CLI binary — no programmatic exports)
// @entry bin/roadmap

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RoadmapError } from '../src/errors.ts';
import { emit, emitError, parseOutputOpts, ErrorCode, setRepoRoot } from '../src/lib/cli-envelope.ts';
import type { OutputOpts } from '../src/lib/cli-envelope.ts';
import { resolveWidth } from '../src/lib/render/layout.ts';
import { renderOrient, renderPlanGallery, renderPlanSelect, renderPlanStatus } from '../src/lib/cli-human.ts';
import type { OrientData, GalleryData, PlanSelectData, PlanStatusData } from '../src/lib/cli-human.ts';
import { lookupSchema, listCommands, schemaToJsonSchema } from '../src/lib/schemas.ts';
import { getMakeInvariants } from '../src/lib/api-invariants.ts';
import type { RenderOpts } from '../src/lib/render/index.ts';
import {
  findRepoRoot, setRepoRoot as setCliRepoRoot,
  extractNote, initGitsafe, enforceMainBranch,
  recordTrailError, ensureDAGConsolidated,
} from '../src/cli/shared.ts';

// --- CLI modules ---
import * as cliOrient from '../src/cli/orient.ts';
import * as cliAdvance from '../src/cli/advance.ts';
import * as cliMake from '../src/cli/make.ts';
import * as cliStatus from '../src/cli/status.ts';
import * as cliApi from '../src/cli/api.ts';
import * as cliHelp from '../src/cli/help.ts';
import * as cliDag from '../src/cli/dag.ts';
import * as cliSpec from '../src/cli/spec.ts';
import * as cliInit from '../src/cli/init.ts';
import * as cliViewer from '../src/cli/viewer.ts';

// --- Init ---
const rawArgs = process.argv.slice(2);
const repoRoot = findRepoRoot(process.cwd());
setRepoRoot(repoRoot);
initGitsafe(repoRoot);

const { note: _note, positional: args } = extractNote(rawArgs);
const cmd = args[0] || 'help';

// --- Output opts ---
function deriveEnvelopeCmd(): string {
  if (cmd === 'spec') {
    if (args[1] === 'plan') {
      if (args.includes('--gallery')) return 'spec.plan.gallery';
      if (args[2] === 'select') return 'spec.plan.select';
      if (args[2] === 'status') return 'spec.plan.status';
      return 'spec.plan';
    }
    return 'spec';
  }
  return cmd;
}
const _outputOpts = parseOutputOpts(rawArgs, deriveEnvelopeCmd());

// --- Human renderers ---
const _humanRenderers: Record<string, (data: unknown) => string> = {
  orient: (d) => renderOrient(d as OrientData),
  'spec.plan.gallery': (d) => renderPlanGallery(d as GalleryData),
  'spec.plan.select': (d) => renderPlanSelect(d as PlanSelectData),
  'spec.plan.status': (d) => renderPlanStatus(d as PlanStatusData),
};
if (_humanRenderers[_outputOpts.cmd]) {
  _outputOpts.humanRenderer = _humanRenderers[_outputOpts.cmd];
}

// --- Known commands gate ---
const KNOWN_COMMANDS = new Set(['orient', 'advance', 'make', 'init', 'status', 'spec', 'dag', 'api', 'help', 'viewer', '--help', '-h']);
if (!KNOWN_COMMANDS.has(cmd)) {
  const available = listCommands().map(c => c.command);
  emit({ ok: false, cmd: _outputOpts.cmd, error: {
    code: 'UNKNOWN_COMMAND',
    message: `Unknown command: ${cmd}`,
    fix: [`Mainline: {make, orient, advance, status}. Group: {spec, dag}. Discovery: {api, help}.`],
    hint: `Run 'roadmap api --all' to see full command registry with schemas.`,
    available,
  } }, _outputOpts);
  recordTrailError(cmd, 'UNKNOWN_COMMAND', `Unknown command: ${cmd}`, repoRoot);
  process.exit(1);
}

// --- Per-command --help ---
if (args.slice(1).some(a => a === '--help' || a === '-h')) {
  showCommandHelp();
  process.exit(0);
}

// --- Note requirement ---
const NOTE_EXEMPT = new Set(['help', '--help', '-h', 'spec', 'dag', 'api', 'init', 'viewer']);
const isOrientCheck = (cmd === 'orient') && args.includes('--check');
if (isOrientCheck) NOTE_EXEMPT.add('orient');

if (!NOTE_EXEMPT.has(cmd) && !isOrientCheck && !_note) {
  emit({ ok: false, cmd: _outputOpts.cmd, error: {
    code: 'MISSING_NOTE',
    message: 'Missing --note "reason"',
    fix: [`roadmap ${cmd} --note "why you are running this"`],
  } }, _outputOpts);
  recordTrailError(cmd, 'MISSING_NOTE', 'Missing --note argument', repoRoot);
  process.exit(1);
}

// --- DAG presence check ---
let hasLocalDAG = false;
try {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const headsDir = join(repoRoot, '.roadmap', 'heads');
  hasLocalDAG = existsSync(headPath) || (existsSync(headsDir) && readdirSync(headsDir).some(f => f.endsWith('.json')));
} catch {}

// --- Schema helpers ---
function deriveSchemaKey(): string {
  if (cmd === 'dag' && args[1]) return `dag.${args[1]}`;
  if (cmd === 'spec' && args[1]) return `spec.${args[1]}`;
  return cmd;
}

function schemaFields(key: string): { schema?: object; example?: object } {
  const s = lookupSchema(key);
  if (!s?.input) return {};
  const result: { schema?: object; example?: object } = { schema: schemaToJsonSchema(s.input) };
  if (s.examples?.[0]?.input) result.example = s.examples[0].input;
  return result;
}

function showCommandHelp() {
  const key = deriveSchemaKey();
  const schema = lookupSchema(key);
  const out: any = { command: key, hint: `roadmap api ${key}  — full schema + examples` };
  if (schema) {
    out.description = schema.description;
    out.input = schema.input ? schemaToJsonSchema(schema.input) : null;
    out.examples = schema.examples ?? [];
  }
  if (cmd === 'make') {
    const invariants = getMakeInvariants();
    out.skipFlags = invariants.filter(i => i.skipFlag).map(i => ({ flag: i.skipFlag, skips: i.requirement }));
    out.invariants = invariants;
  }
  emit({ ok: true, cmd: 'api', data: out }, _outputOpts);
}

// --- Main ---
async function main() {
  await ensureDAGConsolidated(repoRoot);

  const note = _note;

  // Branch enforcement for DAG-mutating commands
  const BRANCH_EXEMPT = new Set(['help', '--help', '-h', 'api', 'orient', 'advance', 'status', 'spec', 'init', 'viewer']);
  if (!BRANCH_EXEMPT.has(cmd) && !(cmd === 'make' && args.includes('--dry-run'))) {
    enforceMainBranch(repoRoot);
  }

  try {
    switch (cmd) {
      case 'orient':    return await cliOrient.run(args, repoRoot, note, hasLocalDAG, _outputOpts);
      case 'advance':   return await cliAdvance.run(args, repoRoot, note!, hasLocalDAG, _outputOpts);
      case 'make':      return await cliMake.run(args, repoRoot, note!, _outputOpts);
      case 'status':    return await cliStatus.run(args, repoRoot, hasLocalDAG, _outputOpts);
      case 'spec':      return await cliSpec.run(args, repoRoot, note, _outputOpts);
      case 'dag':       return await cliDag.run(args, repoRoot, note, hasLocalDAG, _outputOpts);
      case 'init':      return await cliInit.run(args, repoRoot, note ?? '', _outputOpts);
      case 'viewer':    return await cliViewer.run(args, repoRoot, note ?? '', _outputOpts);
      case 'api':       return cliApi.run(args, _outputOpts);
      case 'help':
      case '--help':
      case '-h':        return cliHelp.run();
      default:
        emit({ ok: false, cmd: _outputOpts.cmd, error: {
          code: 'UNKNOWN_COMMAND',
          message: `Unknown command: ${cmd}`,
          fix: [`Mainline: {make, orient, advance, status}. Group: {spec, dag}. Discovery: {api, help}.`],
        } }, _outputOpts);
        process.exit(1);
    }
  } catch (e) {
    if (e instanceof RoadmapError) {
      const rej = e.toJSON();
      const code = rej.code ?? ErrorCode.INTERNAL_ERROR;
      const message = rej.message ?? String(e);
      recordTrailError(cmd, code, message, repoRoot, note);

      const { fix: ctxFix, ...restContext } = rej.context ?? {};
      const errorPayload: any = { code, message, fix: ctxFix ? [ctxFix] : undefined, ...restContext };
      if (code === 'VALIDATION_FAILED') {
        Object.assign(errorPayload, schemaFields(deriveSchemaKey()));
        errorPayload.hint = `Run 'roadmap api ${deriveSchemaKey()}' to see full schema, invariants, and skip flags.`;
      }

      emit({ ok: false, cmd: _outputOpts.cmd, error: errorPayload }, _outputOpts);
      process.exit(1);
    } else {
      const message = e instanceof Error ? e.message : String(e);
      recordTrailError(cmd, ErrorCode.INTERNAL_ERROR, message, repoRoot, note);
      emit({ ok: false, cmd: _outputOpts.cmd, error: { code: ErrorCode.INTERNAL_ERROR, message } }, _outputOpts);
      process.exit(2);
    }
  }
}

main();
