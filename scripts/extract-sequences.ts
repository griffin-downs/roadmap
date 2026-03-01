#!/usr/bin/env node
// @script extract-sequences
// Extract command sequences from .roadmap/trail.jsonl, grouped by 5-minute windows

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const trailPath = '/home/griffin/src/roadmap/.roadmap/trail.jsonl';

interface TrailEntry {
  ts: string;
  cmd: string;
  note?: string;
  position?: string[];
  dagId?: string;
}

interface Sequence {
  window: string;
  commands: string[];
  count: number;
}

function main() {
  const content = readFileSync(trailPath, 'utf-8');
  const lines = content.trim().split('\n').filter((l) => l.trim());

  const windowMap = new Map<string, string[]>();
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  for (const line of lines) {
    try {
      const entry: TrailEntry = JSON.parse(line);
      if (!entry.ts || !entry.cmd) continue;

      const ts = new Date(entry.ts).getTime();
      const windowStart = Math.floor(ts / WINDOW_MS) * WINDOW_MS;
      const windowKey = new Date(windowStart).toISOString();

      if (!windowMap.has(windowKey)) {
        windowMap.set(windowKey, []);
      }
      windowMap.get(windowKey)!.push(entry.cmd);
    } catch {
      // Skip malformed lines
    }
  }

  const sequences: Sequence[] = Array.from(windowMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([window, commands]) => ({
      window,
      commands,
      count: commands.length,
    }));

  const output = {
    sequences,
    windowDurationMinutes: 5,
    totalSequences: sequences.length,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
