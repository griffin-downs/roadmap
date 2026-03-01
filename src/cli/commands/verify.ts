// @module cli/commands/verify
// @exports run
// @entry roadmap/cli/commands/verify

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { define, check, verify } from '../../protocol.ts';
import { runVerify } from '../../lib/verify.ts';
import type { Graph } from '../../protocol.ts';

// --- Types ---

interface VerifyResult {
  dagId: string | null;
  structure: { valid: boolean; error?: string };
  contracts: { valid: boolean; errors: string[] };
  termination: { done: boolean; orphans?: string[] };
}

// --- Command ---

export function run(args: string[], repoRoot: string): void {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    console.log(JSON.stringify({ ok: false, error: 'No roadmap found at .roadmap/head.json' }));
    process.exit(1);
  }

  const dag: Graph<string> = JSON.parse(readFileSync(headPath, 'utf-8'));
  const result: VerifyResult = {
    dagId: dag.id ?? null,
    structure: { valid: true },
    contracts: { valid: true, errors: [] },
    termination: { done: false },
  };

  // Structure: define() validates cycles, init/term
  try {
    define(dag);
  } catch (e) {
    result.structure = { valid: false, error: (e as Error).message };
    console.log(JSON.stringify({ ok: false, cmd: 'verify', data: result }));
    process.exit(1);
  }

  // Contracts: verify() checks consumes satisfied by predecessors
  const contractErrors = verify(dag);
  if (contractErrors.length > 0) {
    result.contracts = { valid: false, errors: contractErrors };
  }

  // Termination: check() tests reachability
  const termResult = check(dag);
  result.termination = {
    done: termResult.done,
    ...(termResult.orphans.length ? { orphans: termResult.orphans } : {}),
  };

  // Full verify pass (filesystem-level)
  const fsVerify = runVerify(repoRoot);

  const ok = result.structure.valid && result.contracts.valid && result.termination.done;
  console.log(JSON.stringify({
    ok,
    cmd: 'verify',
    data: { ...result, filesystem: fsVerify },
  }));
  if (!ok) process.exit(1);
}
