// @module dag-candidate
// @exports CandidateEnvelope, writeCandidateDAG, loadCandidate, computeHeadSha, candidateExists, CANDIDATE_PATH
// @types CandidateEnvelope
// @entry roadmap

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Graph } from '../protocol.ts';

export const CANDIDATE_PATH = '.roadmap/head.candidate.json';

export interface CandidateEnvelope {
  schemaVersion: 1;
  baseSha: string;
  source: 'import' | 'expand';
  sourceDetail: string;
  createdAt: string;
  dag: Graph<string>;
}

/** sha256 of head.json content. Returns null if head.json missing. */
export function computeHeadSha(repoRoot: string): string | null {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) return null;
  const content = readFileSync(headPath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/** True if head.candidate.json exists. */
export function candidateExists(repoRoot: string): boolean {
  return existsSync(join(repoRoot, CANDIDATE_PATH));
}

/**
 * Write a candidate DAG to head.candidate.json.
 * Refuses if a candidate already exists (must accept/reject first).
 */
export function writeCandidateDAG(
  repoRoot: string,
  dag: Graph<string>,
  source: CandidateEnvelope['source'],
  sourceDetail: string,
  opts?: { replaceCurrent?: boolean },
): CandidateEnvelope {
  const candidatePath = join(repoRoot, CANDIDATE_PATH);

  if (!opts?.replaceCurrent && existsSync(candidatePath)) {
    throw new Error(
      'Candidate already exists at head.candidate.json — accept or reject before creating a new one. ' +
      'Use --replace-candidate to override.',
    );
  }

  const baseSha = computeHeadSha(repoRoot);
  if (!baseSha) throw new Error('No head.json found — cannot create candidate');

  const envelope: CandidateEnvelope = {
    schemaVersion: 1,
    baseSha,
    source,
    sourceDetail,
    createdAt: new Date().toISOString(),
    dag,
  };

  writeFileSync(candidatePath, JSON.stringify(envelope, null, 2) + '\n');
  return envelope;
}

/**
 * Load candidate envelope from head.candidate.json.
 * Returns null if no candidate exists.
 */
export function loadCandidate(repoRoot: string): CandidateEnvelope | null {
  const candidatePath = join(repoRoot, CANDIDATE_PATH);
  if (!existsSync(candidatePath)) return null;
  const raw = readFileSync(candidatePath, 'utf-8');
  return JSON.parse(raw) as CandidateEnvelope;
}
