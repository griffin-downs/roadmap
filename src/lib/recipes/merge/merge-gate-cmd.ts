// @module merge-gate-cmd
// @exports runMergeGate, MergeGateOptions
// @entry roadmap

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MergeGateResult, ReceiptCheck, MergeGateError } from './merge-gate.ts';
import { REQUIRED_RECEIPTS } from './merge-gate.ts';
import { loadKernel } from './kernel-config.ts';

export interface MergeGateOptions {
  target?: string;
  repoRoot: string;
}

export function runMergeGate(options: MergeGateOptions): MergeGateResult {
  const { repoRoot, target = 'main' } = options;
  const checks: ReceiptCheck[] = [];
  const errors: MergeGateError[] = [];

  // Read head.json for DAG hash and node list
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  let headSha = '';
  let dagNodes: Set<string> = new Set();
  if (existsSync(headPath)) {
    try {
      const head = JSON.parse(readFileSync(headPath, 'utf-8'));
      headSha = head.dag_hash ?? head.id ?? '';
      if (head.nodes && typeof head.nodes === 'object') {
        dagNodes = new Set(Object.keys(head.nodes));
      }
    } catch { /* headSha stays empty, caught by kernel check */ }
  }

  // 1. plan-select: receipt exists and headSha matches
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  let planSelectFound = false;
  if (existsSync(receiptsDir)) {
    const files = readdirSync(receiptsDir).filter(f => f.startsWith('plan-select-') && f.endsWith('.json'));
    for (const f of files) {
      try {
        const receipt = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8'));
        if (receipt.headSha === headSha) {
          planSelectFound = true;
          break;
        }
      } catch { /* skip malformed */ }
    }
  }
  checks.push({ receiptName: 'plan-select', found: planSelectFound, required: true });
  if (!planSelectFound) {
    errors.push({
      code: 'MISSING_PLAN_SELECT',
      message: 'No plan-select receipt found matching current DAG hash',
      fix: ['Run: roadmap plan select <id> --note "select execution plan"'],
    });
  }

  // 2. spec-origin (conditional): only if spec-origin.json exists
  const specOriginPath = join(repoRoot, '.roadmap', 'spec-origin.json');
  if (existsSync(specOriginPath)) {
    let specImportFound = false;
    if (existsSync(receiptsDir)) {
      const files = readdirSync(receiptsDir).filter(f => f.startsWith('spec-import-') && f.endsWith('.json'));
      specImportFound = files.length > 0;
    }
    checks.push({ receiptName: 'spec-origin', found: specImportFound, required: true });
    if (!specImportFound) {
      errors.push({
        code: 'MISSING_SPEC_IMPORT',
        message: 'spec-origin.json exists but no spec-import receipt found',
        fix: ['Run: roadmap import --spec-compiled <path> --note "import spec"'],
      });
    }
  }

  // 3. kernel-verify: loadKernel must succeed with schemaVersion >= 1
  let kernelOk = false;
  const kernelPath = join(repoRoot, '.roadmap', 'kernel.json');
  try {
    const kernel = loadKernel(repoRoot);
    kernelOk = kernel.schemaVersion >= 1;
  } catch { /* kernelOk stays false */ }
  const kernelExists = existsSync(kernelPath);
  checks.push({ receiptName: 'kernel-verify', found: kernelOk && kernelExists, path: kernelPath, required: true });
  if (!kernelOk || !kernelExists) {
    errors.push({
      code: 'KERNEL_VERIFY_FAILED',
      message: kernelExists ? 'kernel.json exists but schemaVersion < 1 or parse error' : 'kernel.json not found',
      fix: ['Create .roadmap/kernel.json with schemaVersion >= 1'],
    });
  }

  // 4. no-orphans: scan receipts for unbound nodeId references (warning, not hard fail)
  if (existsSync(receiptsDir)) {
    const orphans: string[] = [];
    for (const f of readdirSync(receiptsDir).filter(f => f.endsWith('.json'))) {
      try {
        const receipt = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8'));
        if (receipt.nodeId && typeof receipt.nodeId === 'string' && !dagNodes.has(receipt.nodeId)) {
          orphans.push(`${f} → ${receipt.nodeId}`);
        }
      } catch { /* skip */ }
    }
    const noOrphans = orphans.length === 0;
    checks.push({ receiptName: 'no-orphans', found: noOrphans, required: false });
    if (!noOrphans) {
      errors.push({
        code: 'ORPHAN_RECEIPTS',
        message: `${orphans.length} receipt(s) reference unknown nodes: ${orphans.join(', ')}`,
        fix: ['Review orphaned receipts — they may reference deleted or renamed nodes'],
      });
    }
  } else {
    checks.push({ receiptName: 'no-orphans', found: true, required: false });
  }

  // 5. intake (conditional): pending-certify.json blocks merge
  const pendingCertifyPath = join(repoRoot, '.roadmap', 'pending-certify.json');
  if (existsSync(pendingCertifyPath)) {
    checks.push({ receiptName: 'intake', found: false, required: true });
    errors.push({
      code: 'INTAKE_PENDING',
      message: 'Intake certification required before merge',
      fix: ['Run: roadmap certify --note "certify intake"'],
    });
  }

  // Compute pass: all required checks must pass
  const pass = checks.filter(c => c.required).every(c => c.found);

  return {
    pass,
    target,
    checkedAt: new Date().toISOString(),
    checks,
    errors,
    headSha,
  };
}
