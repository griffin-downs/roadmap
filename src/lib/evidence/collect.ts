// @module evidence
// @exports collectEvidence, getGitDiff, getFileReads, getCheckResults
// @types EvidenceBundle, GitDiffItem, FileReadProof, CheckResult
// @entry roadmap/evidence

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { EvidenceBundle, GitDiffItem, FileReadProof, CheckResult } from './schema.ts';

/**
 * collectEvidence: gather proof of work done
 * Compares before/after commit shas to extract git diffs, file reads, and check results
 */
export function collectEvidence(
  repoRoot: string,
  beforeSha: string,
  afterSha: string,
  readPaths: string[] = []
): EvidenceBundle {
  const timestamp = Date.now();

  const gitDiffs = getGitDiff(repoRoot, beforeSha, afterSha);
  const reads = readPaths.map((path) => ({
    path,
    timestamp,
    lineCount: getLineCount(repoRoot, path),
  }));
  const checks: CheckResult[] = [];

  return {
    schema_version: 1,
    timestamp,
    headSha: afterSha,
    baseSha: beforeSha,
    gitDiffs,
    reads,
    checks,
    entries: [],
  };
}

/**
 * getGitDiff: extract file-level changes between two commits
 */
export function getGitDiff(repoRoot: string, beforeSha: string, afterSha: string): GitDiffItem[] {
  try {
    // Get raw diff stats
    const diffOutput = execSync(
      `cd ${repoRoot} && git diff --numstat ${beforeSha}...${afterSha}`,
      { encoding: 'utf-8' }
    );

    if (!diffOutput.trim()) return [];

    return diffOutput
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split('\t');
        if (parts.length < 3) return null;

        const additions = parseInt(parts[0], 10) || 0;
        const deletions = parseInt(parts[1], 10) || 0;
        const file = parts[2];

        // Determine status from git diff-tree
        const diffStatus = getDiffStatus(repoRoot, beforeSha, afterSha, file);

        return {
          file,
          status: diffStatus,
          additions,
          deletions,
        };
      })
      .filter((item): item is GitDiffItem => item !== null);
  } catch {
    return [];
  }
}

/**
 * getDiffStatus: determine if file was added, deleted, modified, or renamed
 */
function getDiffStatus(
  repoRoot: string,
  beforeSha: string,
  afterSha: string,
  file: string
): 'added' | 'deleted' | 'modified' | 'renamed' {
  try {
    const output = execSync(
      `cd ${repoRoot} && git diff --name-status ${beforeSha}...${afterSha} | grep "${file.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8' }
    ).trim();

    const status = output.charAt(0);
    if (status === 'A') return 'added';
    if (status === 'D') return 'deleted';
    if (status === 'R') return 'renamed';
    return 'modified';
  } catch {
    return 'modified';
  }
}

/**
 * getLineCount: count lines in a file
 */
function getLineCount(repoRoot: string, filePath: string): number {
  try {
    const fullPath = `${repoRoot}/${filePath}`;
    const content = readFileSync(fullPath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * addCheckResult: append a test/lint/build result to evidence
 */
export function addCheckResult(
  bundle: EvidenceBundle,
  type: 'test' | 'lint' | 'typecheck' | 'build' | 'custom',
  name: string,
  passed: boolean,
  duration?: number
): EvidenceBundle {
  return {
    ...bundle,
    checks: [
      ...bundle.checks,
      {
        type,
        name,
        passed,
        duration,
        timestamp: Date.now(),
      },
    ],
  };
}

/**
 * addClaim: add an entry that maps a claim to backing evidence
 */
export function addClaim(
  bundle: EvidenceBundle,
  claim: string,
  backingEvidence: {
    gitDiffs?: GitDiffItem[];
    reads?: FileReadProof[];
    checks?: CheckResult[];
  }
): EvidenceBundle {
  return {
    ...bundle,
    entries: [
      ...bundle.entries,
      {
        claim,
        backingEvidence,
      },
    ],
  };
}
