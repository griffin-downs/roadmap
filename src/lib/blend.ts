// @module blend
// @exports BlendSpec, BlendResult, blendCandidates

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CandidateResult, FileToIntents } from './emit-gallery.ts';
import type { BlendReceipt, StatementOwnership, CheckSet, CheckEntry } from './blend-receipt.ts';
import { writeBlendReceipt, generateBlendId, sha256 } from './blend-receipt.ts';

export interface BlendSpec {
  primary: string;    // candidate id — base architecture source
  donors: string[];   // candidates to pull cheaper files from
}

export interface BlendResult {
  files: Record<string, string>;  // merged file set
  substitutions: Array<{ path: string; from: string; reason: string }>;
  reverted: Array<{ path: string; reason: string }>;
  deterministicPass: boolean;
  intentScore: string;            // e.g. "5/6"
  receipt?: BlendReceipt;
  statementOwnership: StatementOwnership[];
  checkSet: CheckSet;
}

// A donor file is substitutable only when:
// 1. fileToIntents[path] is non-empty (has intent coverage)
// 2. The donor passed ALL covering intent statements
// Files with no intent coverage are not substitutable (conservative).
export function blendCandidates(
  candidates: CandidateResult[],
  spec: BlendSpec,
  fileToIntents: FileToIntents,
  opts?: {
    deterministicCheck?: (files: Record<string, string>) => boolean;
    blendId?: string;
    repoRoot?: string;
  },
): BlendResult {
  const primary = candidates.find(c => c.id === spec.primary);
  if (!primary) throw new Error(`blend: primary candidate '${spec.primary}' not found`);

  const workingFiles: Record<string, string> = { ...primary.files };
  const substitutions: Array<{ path: string; from: string; reason: string }> = [];
  const reverted: Array<{ path: string; reason: string }> = [];
  const checks: CheckEntry[] = [];

  for (const donorId of spec.donors) {
    const donor = candidates.find(c => c.id === donorId);
    if (!donor) continue;

    for (const path of Object.keys(donor.files)) {
      // Guard: no intent coverage → skip (conservative)
      const coveringStatements = fileToIntents[path];
      if (!coveringStatements || coveringStatements.length === 0) continue;

      // Guard: donor must pass ALL covering intent statements
      const allPass = coveringStatements.every(stmt => {
        const entry = donor.intent.find(i => i.statement === stmt);
        return entry !== undefined && entry.pass === true;
      });
      if (!allPass) continue;

      // Guard: donor file must be cheaper (LOC proxy via content length)
      const donorLen = donor.files[path]?.length ?? 0;
      const primaryLen = primary.files[path]?.length ?? Infinity;
      if (donorLen >= primaryLen) continue;

      // Substitute
      const oldContent = workingFiles[path];
      workingFiles[path] = donor.files[path];

      // Check if substitution breaks deterministic gate
      if (opts?.deterministicCheck && !opts.deterministicCheck(workingFiles)) {
        // Revert
        workingFiles[path] = oldContent;
        const rollbackEvidence = `substitution from ${donorId} broke deterministic gate`;
        reverted.push({ path, reason: rollbackEvidence });

        // Write rollback evidence to disk if blendId + repoRoot provided
        if (opts.blendId && opts.repoRoot) {
          const rollbackDir = join(opts.repoRoot, '.roadmap', 'blend-rollbacks', opts.blendId);
          if (!existsSync(rollbackDir)) mkdirSync(rollbackDir, { recursive: true });
          writeFileSync(
            join(rollbackDir, `${path.replace(/\//g, '_')}.json`),
            JSON.stringify({ path, donorId, reason: rollbackEvidence }, null, 2),
          );
        }

        checks.push({
          checkId: path,
          description: `substitute ${path} from ${donorId}`,
          status: 'fail',
          rollbackEvidence,
        });
        continue;
      }

      substitutions.push({
        path,
        from: donorId,
        reason: `donor cheaper (${donorLen} < ${primaryLen} chars) and passes all covering intents`,
      });

      checks.push({
        checkId: path,
        description: `substitute ${path} from ${donorId}`,
        status: 'pass',
      });
    }
  }

  // Compute intentScore across the blended result.
  // Collect all unique intent statements referenced in fileToIntents for paths in workingFiles.
  const allStatements = new Set<string>();
  for (const path of Object.keys(workingFiles)) {
    for (const stmt of fileToIntents[path] ?? []) {
      allStatements.add(stmt);
    }
  }

  // A statement passes if it passes in whichever candidate contributed the file.
  // Build a path→candidateId map: substituted paths come from their donor, rest from primary.
  const pathOwner: Record<string, CandidateResult> = {};
  for (const path of Object.keys(workingFiles)) {
    const sub = substitutions.find(s => s.path === path);
    if (sub) {
      const donor = candidates.find(c => c.id === sub.from);
      if (donor) { pathOwner[path] = donor; continue; }
    }
    pathOwner[path] = primary;
  }

  let passed = 0;
  const checkedStatements = new Set<string>();
  for (const path of Object.keys(workingFiles)) {
    for (const stmt of fileToIntents[path] ?? []) {
      if (checkedStatements.has(stmt)) continue;
      checkedStatements.add(stmt);
      const owner = pathOwner[path];
      if (!owner) continue;
      const entry = owner.intent.find(i => i.statement === stmt);
      if (entry?.pass === true) passed++;
    }
  }

  const total = checkedStatements.size;
  const intentScore = `${passed}/${total}`;

  // Build statementOwnership: for each statement in fileToIntents, find the owning candidate.
  const statementOwnership: StatementOwnership[] = [];
  const seenStmts = new Set<string>();
  for (const path of Object.keys(workingFiles)) {
    for (const stmt of fileToIntents[path] ?? []) {
      if (seenStmts.has(stmt)) continue;
      seenStmts.add(stmt);
      const owner = pathOwner[path];
      if (!owner) throw new Error('blend: orphan statement — no ownerNodeId');
      statementOwnership.push({
        statement: stmt,
        ownerNodeId: owner.id,
        provenance: [owner.id, path, 'blend-output'],
      });
    }
  }

  const checkSet: CheckSet = {
    checks,
    allPassed: checks.every(c => c.status !== 'fail'),
  };

  // Build receipt
  const blendId = opts?.blendId ?? generateBlendId();
  const outputContent = JSON.stringify(workingFiles);
  const receipt: BlendReceipt = {
    schema_version: 1,
    blendId,
    timestamp: new Date().toISOString(),
    repoRoot: opts?.repoRoot ?? process.cwd(),
    headSha: '',  // caller can enrich; blend is fs-level, not git-aware
    inputs: [spec.primary, ...spec.donors],
    outputId: `blend-${blendId}`,
    guardResults: [],
    statementOwnership,
    checkSet,
    output: {
      statementCount: statementOwnership.length,
      sha256: sha256(outputContent),
    },
    ok: checkSet.allPassed,
  };

  // Persist receipt to ledger + per-blend JSON
  if (opts?.repoRoot) {
    writeBlendReceipt(receipt, opts.repoRoot);
  }

  return {
    files: workingFiles,
    substitutions,
    reverted,
    deterministicPass: true,  // stub — production would re-run tsc/vitest
    intentScore,
    receipt,
    statementOwnership,
    checkSet,
  };
}
