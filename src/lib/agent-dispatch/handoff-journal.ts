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

function nodeDir(repoRoot: string, nodeId: string): string {
  return join(repoRoot, '.dispatch', nodeId);
}

/**
 * Write an interim checkpoint. Auto-resolves .dispatch/{nodeId}/.
 * Returns the sequence number assigned.
 */
export async function writeInterimHandoff(
  repoRoot: string,
  nodeId: string,
  entry: InterimHandoff,
): Promise<number> {
  const dir = nodeDir(repoRoot, nodeId);
  await mkdir(dir, { recursive: true });

  const existing = await readdir(dir).catch(() => []);
  const interims = existing.filter(f => f.startsWith('interim-') && f.endsWith('.json'));
  const seq = interims.length;

  const path = join(dir, `interim-${String(seq).padStart(3, '0')}.json`);
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  return seq;
}

/** Write a final handoff. Overwrites any previous final. */
export async function writeFinalHandoff(
  repoRoot: string,
  nodeId: string,
  entry: FinalHandoff,
): Promise<void> {
  const dir = nodeDir(repoRoot, nodeId);
  await mkdir(dir, { recursive: true });

  const path = join(dir, 'handoff.json');
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
}

/** Load the full handoff chain: all interims then final. */
export async function loadHandoffChain(
  repoRoot: string,
  nodeId: string,
): Promise<JournalEntry[]> {
  const dir = nodeDir(repoRoot, nodeId);
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

/** Load only the final handoff. Returns undefined if not yet written. */
export async function loadFinal(
  repoRoot: string,
  nodeId: string,
): Promise<FinalHandoff | undefined> {
  try {
    const content = await readFile(join(nodeDir(repoRoot, nodeId), 'handoff.json'), 'utf-8');
    return JSON.parse(content) as FinalHandoff;
  } catch {
    return undefined;
  }
}

// Aliases
export const saveInterim = writeInterimHandoff;
export const saveFinal = writeFinalHandoff;
export const loadJournal = loadHandoffChain;
