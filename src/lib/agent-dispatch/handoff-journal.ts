// @module handoff-journal
// @exports writeInterimHandoff, writeFinalHandoff, loadHandoffChain, saveInterim, saveFinal, loadJournal, loadFinal, journalDir
// @types JournalEntry
// @entry roadmap/agent

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { InterimHandoff, FinalHandoff } from '../brief.ts';

export type JournalEntry = InterimHandoff | FinalHandoff;

/** Canonical journal base directory */
export function journalDir(repoRoot: string): string {
  return join(repoRoot, '.dispatch');
}

/**
 * Write an interim checkpoint.
 * @param nodeId - node being executed
 * @param entry - interim handoff data
 * @param dir - resolved journal directory (.dispatch/{nodeId})
 * Returns the sequence number assigned.
 */
export async function writeInterimHandoff(
  nodeId: string,
  entry: InterimHandoff,
  dir: string,
): Promise<number> {
  await mkdir(dir, { recursive: true });

  const existing = await readdir(dir).catch(() => []);
  const interims = existing.filter(f => f.startsWith('interim-') && f.endsWith('.json'));
  const seq = interims.length;

  const path = join(dir, `interim-${String(seq).padStart(3, '0')}.json`);
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  return seq;
}

/**
 * Write a final handoff. Overwrites any previous final.
 * @param nodeId - node being executed
 * @param entry - final handoff data
 * @param dir - resolved journal directory (.dispatch/{nodeId})
 */
export async function writeFinalHandoff(
  nodeId: string,
  entry: FinalHandoff,
  dir: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });

  const path = join(dir, 'handoff.json');
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
}

/**
 * Load the full handoff chain for a node: all interims then final.
 * @param nodeId - node to load journal for
 * @param dir - resolved journal directory (.dispatch/{nodeId})
 */
export async function loadHandoffChain(
  nodeId: string,
  dir: string,
): Promise<JournalEntry[]> {
  const files = await readdir(dir).catch(() => []);

  const interims = files
    .filter(f => f.startsWith('interim-') && f.endsWith('.json'))
    .sort();

  const journal: JournalEntry[] = [];

  for (const file of interims) {
    const content = await readFile(join(dir, file), 'utf-8');
    journal.push(JSON.parse(content) as InterimHandoff);
  }

  try {
    const content = await readFile(join(dir, 'handoff.json'), 'utf-8');
    journal.push(JSON.parse(content) as FinalHandoff);
  } catch {
    // No final yet
  }

  return journal;
}

/**
 * Load only the final handoff for a node. Returns undefined if not yet written.
 */
export async function loadFinal(
  nodeId: string,
  dir: string,
): Promise<FinalHandoff | undefined> {
  try {
    const content = await readFile(join(dir, 'handoff.json'), 'utf-8');
    return JSON.parse(content) as FinalHandoff;
  } catch {
    return undefined;
  }
}

// Convenience aliases — (repoRoot, nodeId, entry) → auto-resolve dir
export async function saveInterim(repoRoot: string, nodeId: string, entry: InterimHandoff): Promise<number> {
  return writeInterimHandoff(nodeId, entry, join(repoRoot, '.dispatch', nodeId));
}

export async function saveFinal(repoRoot: string, nodeId: string, entry: FinalHandoff): Promise<void> {
  return writeFinalHandoff(nodeId, entry, join(repoRoot, '.dispatch', nodeId));
}

export async function loadJournal(repoRoot: string, nodeId: string): Promise<JournalEntry[]> {
  return loadHandoffChain(nodeId, join(repoRoot, '.dispatch', nodeId));
}
