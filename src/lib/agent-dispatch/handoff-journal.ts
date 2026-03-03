// @module agent-dispatch
// @exports HandoffJournal, writeInterimHandoff, writeFinalHandoff, loadJournal, loadFinal, journalDir, saveInterim, saveFinal
// @types JournalEntry, HandoffChain
// @entry roadmap/agent

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { InterimHandoff, FinalHandoff } from '../brief.ts';

/**
 * Journal entry for checkpoint storage (alias for InterimHandoff)
 */
export type JournalEntry = InterimHandoff;

/**
 * Handoff chain: interim checkpoints + final handoff
 */
export interface HandoffChain {
  nodeId: string;
  interims: InterimHandoff[];
  final: FinalHandoff | null;
  lastCheckpointTime?: string;
  totalCheckpoints: number;
}

/**
 * Handoff journal: manages interim checkpoints and final handoffs for agent continuity
 */
export class HandoffJournal {
  private repoRoot: string;
  private baseDir: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.baseDir = join(repoRoot, '.dispatch', 'handoffs');
  }

  /**
   * Ensure journal directory exists
   */
  private ensureDir(): void {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Save interim handoff checkpoint during node execution
   * Multiple checkpoints are saved with timestamps for continuity
   */
  async writeInterim(nodeId: string, handoff: InterimHandoff): Promise<void> {
    this.ensureDir();

    // Validate interim handoff
    if (!handoff.timestamp) {
      handoff.timestamp = new Date().toISOString();
    }
    if (handoff.progress < 0 || handoff.progress > 1) {
      throw new Error(`Invalid progress: ${handoff.progress} (must be 0.0–1.0)`);
    }

    // Write with timestamp in filename for chronological ordering
    const timestamp = handoff.timestamp.replace(/[:.]/g, '-').slice(0, -5); // Compact ISO: YYYY-MM-DDTHH-MM-SS
    const filePath = join(this.baseDir, `${nodeId}-interim-${timestamp}.json`);
    writeFileSync(filePath, JSON.stringify(handoff, null, 2));
  }

  /**
   * Save final handoff summary at node completion
   * Marks the end of work for this node, next agent reads this
   */
  async writeFinal(nodeId: string, handoff: FinalHandoff): Promise<void> {
    this.ensureDir();

    // Validate final handoff
    if (!handoff.timestamp) {
      handoff.timestamp = new Date().toISOString();
    }
    if (handoff.summary && handoff.summary.length > 100) {
      throw new Error(`Summary too long: ${handoff.summary.length} > 100 chars`);
    }

    const filePath = join(this.baseDir, `${nodeId}.json`);
    writeFileSync(filePath, JSON.stringify(handoff, null, 2));
  }

  /**
   * Load entire handoff chain for a node (all interims + final)
   */
  async loadChain(nodeId: string): Promise<HandoffChain> {
    const interims = this.loadInterims(nodeId);
    const final = this.loadFinal(nodeId);

    return {
      nodeId,
      interims,
      final,
      lastCheckpointTime: interims.length > 0 ? interims[interims.length - 1].timestamp : final?.timestamp,
      totalCheckpoints: interims.length + (final ? 1 : 0),
    };
  }

  /**
   * Load all interim checkpoints for a node (chronological order)
   */
  loadInterims(nodeId: string): InterimHandoff[] {
    if (!existsSync(this.baseDir)) {
      return [];
    }

    try {
      const files = readdirSync(this.baseDir)
        .filter((f: string) => f.startsWith(`${nodeId}-interim-`) && f.endsWith('.json'))
        .sort(); // Chronological order by timestamp in filename

      return files.map((f: string) => {
        const content = readFileSync(join(this.baseDir, f), 'utf-8');
        return JSON.parse(content) as InterimHandoff;
      });
    } catch {
      return [];
    }
  }

  /**
   * Load final handoff if it exists (next agent's starting point)
   */
  loadFinal(nodeId: string): FinalHandoff | null {
    const filePath = join(this.baseDir, `${nodeId}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as FinalHandoff;
    } catch {
      return null;
    }
  }

  /**
   * Clear all checkpoints for a node (idempotent cleanup)
   */
  clearNode(nodeId: string): void {
    if (!existsSync(this.baseDir)) {
      return;
    }

    try {
      const files = readdirSync(this.baseDir)
        .filter((f: string) => f.startsWith(`${nodeId}-`) || f === `${nodeId}.json`);

      for (const f of files) {
        const filePath = join(this.baseDir, f);
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore delete failures
        }
      }
    } catch {
      // Ignore read failures
    }
  }
}

/**
 * Get journal directory path
 */
export function journalDir(repoRoot: string): string {
  return join(repoRoot, '.dispatch', 'handoffs');
}

/**
 * Save interim handoff checkpoint (standalone function)
 */
export async function writeInterimHandoff(
  repoRoot: string,
  nodeId: string,
  handoff: InterimHandoff
): Promise<void> {
  const journal = new HandoffJournal(repoRoot);
  return journal.writeInterim(nodeId, handoff);
}

/**
 * Save final handoff summary (standalone function)
 */
export async function writeFinalHandoff(
  repoRoot: string,
  nodeId: string,
  handoff: FinalHandoff
): Promise<void> {
  const journal = new HandoffJournal(repoRoot);
  return journal.writeFinal(nodeId, handoff);
}

/**
 * Load all interim handoffs (checkpoint chain) for a node
 */
export function loadJournal(repoRoot: string, nodeId: string): InterimHandoff[] {
  const journal = new HandoffJournal(repoRoot);
  return journal.loadInterims(nodeId);
}

/**
 * Load final handoff if it exists
 */
export function loadFinal(repoRoot: string, nodeId: string): FinalHandoff | null {
  const journal = new HandoffJournal(repoRoot);
  return journal.loadFinal(nodeId);
}

/**
 * Compatibility aliases
 */
export async function saveInterim(repoRoot: string, nodeId: string, data: InterimHandoff): Promise<void> {
  return writeInterimHandoff(repoRoot, nodeId, data);
}

export async function saveFinal(repoRoot: string, nodeId: string, data: FinalHandoff): Promise<void> {
  return writeFinalHandoff(repoRoot, nodeId, data);
}
