#!/usr/bin/env npx tsx
// FR-GOV-006: CI DAG integrity gate.
//
// Modes (flags):
//   --define  Hard gate only: define() rejects cycles, missing init/term. Exit 1 on failure.
//   --verify  Advisory only: verify() + check(). Always exit 0. Reports contract debt.
//   (no flag) Both: define() hard, verify()/check() advisory. Exit 1 only on define() failure.
//
// stdout: JSON { ok, checks[] }

import { readFileSync } from 'fs';
import { join } from 'path';
import { define, verify, check } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

const args = process.argv.slice(2);
const modeDefine = args.includes('--define');
const modeVerify = args.includes('--verify');
const modeBoth = !modeDefine && !modeVerify;

const root = join(import.meta.dirname, '..');
const headPath = join(root, '.roadmap', 'head.json');

const dag: Graph<string> = JSON.parse(readFileSync(headPath, 'utf-8'));

const checks: { name: string; ok: boolean; blocking: boolean; detail?: unknown }[] = [];

// define: structure (cycles, init/term)
if (modeDefine || modeBoth) {
  try {
    define(dag);
    checks.push({ name: 'define', ok: true, blocking: true });
  } catch (e: any) {
    checks.push({ name: 'define', ok: false, blocking: true, detail: e.message });
  }
}

// verify: contracts (consumes satisfied by predecessor produces)
if (modeVerify || modeBoth) {
  const verifyErrors = verify(dag);
  checks.push({
    name: 'verify',
    ok: verifyErrors.length === 0,
    blocking: modeVerify,
    ...(verifyErrors.length > 0 ? { detail: { errors: verifyErrors.length, sample: verifyErrors.slice(0, 3) } } : {}),
  });

  // check: termination (all nodes reachable init→term)
  const checkResult = check(dag);
  checks.push({
    name: 'check',
    ok: checkResult.done,
    blocking: modeVerify,
    ...(checkResult.orphans.length > 0 ? { detail: { orphans: checkResult.orphans.length } } : {}),
  });
}

const ok = checks.filter(c => c.blocking).every(c => c.ok);
const result = { ok, checks };

process.stdout.write(JSON.stringify(result, null, 2) + '\n');

// --verify mode: always exit 0 (advisory)
if (modeVerify) process.exit(0);
process.exit(ok ? 0 : 1);
