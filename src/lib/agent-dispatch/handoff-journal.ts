// @module handoff-journal
// @exports writeInterimHandoff, writeFinalHandoff, loadHandoffChain

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { InterimHandoff, FinalHandoff } from '../../../roadmap/src/lib/brief.ts';

/**
 * Write interim handoff (checkpoint) to journal
 *
 * Given: current execution state
 * When: agent checkpoints progress
 * Then: write interim handoff to journal
 */
export function writeInterimHandoff(
  nodeId: string,
  interim: InterimHandoff,
  journalDir: string
): void {
  try {
    mkdirSync(journalDir, { recursive: true });
  } catch {
    // Already exists
  }

  // Find next checkpoint number
  let checkpointNum = 1;
  while (true) {
    const path = join(journalDir, `interim-${checkpointNum}.json`);
    try {
      readFileSync(path);
      checkpointNum++;
    } catch {
      break;
    }
  }

  const path = join(journalDir, `interim-${checkpointNum}.json`);
  writeFileSync(path, JSON.stringify(interim, null, 2));
}

/**
 * Write final handoff and mark node complete
 *
 * Given: node execution complete with validation passed
 * When: agent calls advance(nodeId, handoff)
 * Then: write final handoff and mark node done
 */
export function writeFinalHandoff(
  nodeId: string,
  final: FinalHandoff,
  journalDir: string
): void {
  try {
    mkdirSync(journalDir, { recursive: true });
  } catch {
    // Already exists
  }

  const path = join(journalDir, 'handoff.json');
  writeFileSync(path, JSON.stringify(final, null, 2));
}

/**
 * Load prior node's handoff (for context flow)
 *
 * Given: nodeId
 * When: next agent starts
 * Then: return prior handoff from predecessor
 */
export function loadHandoffChain(
  nodeId: string,
  journalDir: string
): FinalHandoff | null {
  const path = join(journalDir, 'handoff.json');
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data) as FinalHandoff;
  } catch {
    return null;
  }
}
