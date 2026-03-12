// @module runtime/loop
// @description Loop receipt storage — .roadmap/loops/<iteration>.json with SHA linking
// @exports writeLoopReceipt, readLoopHistory, computeLoopSha
// @entry roadmap

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { parseLoopReceipt, type LoopReceipt } from '../lib/fleet-types.ts';

const LOOPS_DIR = '.roadmap/loops';

/** Deterministic SHA-256 of a loop receipt (excludes own sha field) */
export function computeLoopSha(receipt: LoopReceipt): string {
  const { sha, ...rest } = receipt;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/** Write a loop receipt, computing and attaching its SHA */
export function writeLoopReceipt(repoRoot: string, receipt: LoopReceipt): LoopReceipt {
  const loopsDir = join(repoRoot, LOOPS_DIR);
  if (!existsSync(loopsDir)) mkdirSync(loopsDir, { recursive: true });

  const withSha = { ...receipt, sha: computeLoopSha(receipt) };
  const filePath = join(loopsDir, `${receipt.iteration}.json`);
  writeFileSync(filePath, JSON.stringify(withSha, null, 2) + '\n');
  return withSha;
}

/** Read all loop receipts, sorted by iteration ascending */
export function readLoopHistory(repoRoot: string): LoopReceipt[] {
  const loopsDir = join(repoRoot, LOOPS_DIR);
  if (!existsSync(loopsDir)) return [];

  const files = readdirSync(loopsDir).filter(f => f.endsWith('.json'));
  const receipts: LoopReceipt[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(loopsDir, file), 'utf-8');
      receipts.push(parseLoopReceipt(JSON.parse(content)));
    } catch {
      // Skip malformed receipts
    }
  }

  return receipts.sort((a, b) => a.iteration - b.iteration);
}

/** Verify SHA chain integrity across loop history */
export function verifyLoopChain(receipts: LoopReceipt[]): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (i === 0) {
      if (r.previousSha !== null) return { valid: false, brokenAt: r.iteration };
      continue;
    }

    const prev = receipts[i - 1];
    if (!prev.sha) return { valid: false, brokenAt: r.iteration };
    if (r.previousSha !== prev.sha) return { valid: false, brokenAt: r.iteration };
  }
  return { valid: true };
}
