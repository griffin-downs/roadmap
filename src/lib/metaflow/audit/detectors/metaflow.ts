// @module metaflow/audit/detectors/metaflow
// @exports detectMetaflowCompliance, detectMissingSelfInsert, detectMissingSurfaceHeader, detectActiveRunNotPrinted, detectStateMutationWithoutRunBinding, detectDisplayReceiptMissingRunId, detectProcessEscapePostSelfInsert

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectorResult } from '../required-schema.ts';
import { ELIGIBLE_COMMANDS } from '../../execution/self-insert.ts';

export interface MetaflowDetectorOpts {
  base?: string;
}

interface Receipt {
  runId?: string;
  stepId?: string;
  cmd?: string;
  [key: string]: unknown;
}

interface SurfaceReceipt {
  stepId?: string;
  render?: { plainPath?: string };
  [key: string]: unknown;
}

function readReceipts(base: string, prefix: string): Receipt[] {
  const dir = join(base, '.roadmap', 'receipts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f: string) => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) as Receipt; }
      catch { return null; }
    })
    .filter((r): r is Receipt => r !== null);
}

function hasActiveRun(base: string): boolean {
  return existsSync(join(base, '.roadmap', 'metaflow', 'active-run.json'));
}

function readActiveRunId(base: string): string | null {
  const p = join(base, '.roadmap', 'metaflow', 'active-run.json');
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return data.runId ?? null;
  } catch { return null; }
}

function isEligibleCmd(cmd: string): boolean {
  return ELIGIBLE_COMMANDS.some(e => cmd.startsWith(e) || cmd === e);
}

function hasAuthorityPresent(base: string): boolean {
  return existsSync(join(base, '.roadmap', 'metaflow', 'authority.json'));
}

// MF-001: eligible command receipts without matching self-insert receipt
export function detectMissingSelfInsert(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  if (!hasActiveRun(base)) {
    evidence.push('no active-run.json — detector not applicable');
    return { code: 'MF-001', passed: true, evidence, fix };
  }

  const selfInserts = readReceipts(base, 'metaflow-self-insert-');
  const selfInsertStepIds = new Set(selfInserts.map(r => r.stepId));
  const wrapReceipts = readReceipts(base, 'metaflow-wrap-');

  for (const r of wrapReceipts) {
    if (!r.cmd || !isEligibleCmd(r.cmd)) continue;
    if (r.stepId && !selfInsertStepIds.has(r.stepId)) {
      passed = false;
      evidence.push(`${r.stepId}: eligible cmd "${r.cmd}" without self-insert receipt`);
      fix.push(`Ensure self-insert layer is active for eligible commands`);
    }
  }

  if (passed) evidence.push('all eligible commands have matching self-insert receipts');
  return { code: 'MF-001', passed, evidence, fix };
}

// MF-002: wrapped command receipt without surface header in render
export function detectMissingSurfaceHeader(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  const surfaceReceipts = readReceipts(base, 'metaflow-surface-') as SurfaceReceipt[];
  const surfaceStepIds = new Set(surfaceReceipts.map(r => r.stepId));
  const wrapReceipts = readReceipts(base, 'metaflow-wrap-');

  for (const r of wrapReceipts) {
    if (!r.stepId) continue;
    if (!surfaceStepIds.has(r.stepId)) {
      passed = false;
      evidence.push(`${r.stepId}: wrapped command without metaflow-surface receipt`);
      fix.push(`Check renderMetaflowHeader integration for wrapped commands`);
      continue;
    }
    // Check surface receipt render contains MetaFlow Run: + border
    const sr = surfaceReceipts.find(s => s.stepId === r.stepId);
    if (sr?.render?.plainPath && existsSync(sr.render.plainPath)) {
      const content = readFileSync(sr.render.plainPath, 'utf8');
      if (!content.includes('MetaFlow Run:') || !content.includes('━')) {
        passed = false;
        evidence.push(`${r.stepId}: surface render missing MetaFlow Run: or ━ border`);
        fix.push(`Re-run command to regenerate surface header`);
      }
    }
  }

  if (passed) evidence.push('all wrapped commands have valid surface header receipts');
  return { code: 'MF-002', passed, evidence, fix };
}

// MF-003: mf audit/mine/wrap receipts where plain render omits runId
export function detectActiveRunNotPrinted(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  const runId = readActiveRunId(base);
  if (!runId) {
    evidence.push('no active-run.json — detector not applicable');
    return { code: 'MF-003', passed: true, evidence, fix };
  }

  const mfCmds = ['mf audit', 'mf mine', 'mf wrap'];
  const wrapReceipts = readReceipts(base, 'metaflow-wrap-') as SurfaceReceipt[];

  for (const r of wrapReceipts) {
    const cmd = (r as unknown as Receipt).cmd ?? '';
    if (!mfCmds.some(c => cmd.includes(c))) continue;
    if (r.render?.plainPath && existsSync(r.render.plainPath)) {
      const content = readFileSync(r.render.plainPath, 'utf8');
      if (!content.includes(runId)) {
        passed = false;
        evidence.push(`${(r as unknown as Receipt).stepId}: mf render missing active runId "${runId}"`);
        fix.push(`Ensure mf commands include runId in rendered output`);
      }
    }
  }

  if (passed) evidence.push('all mf audit/mine/wrap renders contain active runId');
  return { code: 'MF-003', passed, evidence, fix };
}

// MF-004: completion/dispatch command without self-insert receipt (state mutation without binding)
export function detectStateMutationWithoutRunBinding(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  const mutationCmds = ['complete', 'dispatch'];
  const selfInserts = readReceipts(base, 'metaflow-self-insert-');
  const selfInsertCmds = new Set(selfInserts.map(r => r.cmd));

  const wrapReceipts = readReceipts(base, 'metaflow-wrap-');
  for (const r of wrapReceipts) {
    if (!r.cmd || !mutationCmds.some(c => r.cmd!.includes(c))) continue;
    if (!selfInsertCmds.has(r.cmd)) {
      passed = false;
      evidence.push(`${r.stepId}: state mutation "${r.cmd}" without self-insert receipt`);
      fix.push(`Ensure self-insert layer wraps all state-mutating commands`);
    }
  }

  if (passed) evidence.push('all state-mutating commands have self-insert binding');
  return { code: 'MF-004', passed, evidence, fix };
}

// MF-005: DisplayReceipt with --mf-run context but missing runId field
export function detectDisplayReceiptMissingRunId(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  const dir = join(base, '.roadmap', 'receipts');
  if (!existsSync(dir)) {
    evidence.push('no receipts directory');
    return { code: 'MF-005', passed: true, evidence, fix };
  }

  const files = readdirSync(dir).filter((f: string) => f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      // Check if it's a display receipt with --mf-run context
      if (data.cmd && typeof data.cmd === 'string' && data.cmd.includes('--mf-run')) {
        if (!data.runId) {
          passed = false;
          evidence.push(`${f}: display receipt with --mf-run context missing runId`);
          fix.push(`Add runId to display receipt`);
        }
      }
    } catch { /* skip unparseable */ }
  }

  if (passed) evidence.push('all display receipts with --mf-run include runId');
  return { code: 'MF-005', passed, evidence, fix };
}

// PE-002: eligible command without wrap when authority present + no self-insert receipt
export function detectProcessEscapePostSelfInsert(opts: MetaflowDetectorOpts = {}): DetectorResult {
  const base = opts.base ?? process.cwd();
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  if (!hasAuthorityPresent(base)) {
    evidence.push('no authority.json — detector not applicable');
    return { code: 'PE-002', passed: true, evidence, fix };
  }

  if (!hasActiveRun(base)) {
    evidence.push('no active-run.json — detector not applicable');
    return { code: 'PE-002', passed: true, evidence, fix };
  }

  const selfInserts = readReceipts(base, 'metaflow-self-insert-');
  const selfInsertCmds = new Set(selfInserts.map(r => r.cmd));
  const wrapReceipts = readReceipts(base, 'metaflow-wrap-');

  for (const r of wrapReceipts) {
    if (!r.cmd || !isEligibleCmd(r.cmd)) continue;
    if (!selfInsertCmds.has(r.cmd)) {
      passed = false;
      evidence.push(`${r.stepId}: eligible cmd "${r.cmd}" invoked without self-insert — process escape`);
      fix.push(`Self-insert layer must wrap all eligible commands when authority present`);
    }
  }

  if (passed) evidence.push('no process escape: all eligible commands have self-insert when authority present');
  return { code: 'PE-002', passed, evidence, fix };
}

// Aggregate detector
export function detectMetaflowCompliance(opts: MetaflowDetectorOpts = {}): DetectorResult[] {
  return [
    detectMissingSelfInsert(opts),
    detectMissingSurfaceHeader(opts),
    detectActiveRunNotPrinted(opts),
    detectStateMutationWithoutRunBinding(opts),
    detectDisplayReceiptMissingRunId(opts),
    detectProcessEscapePostSelfInsert(opts),
  ];
}
