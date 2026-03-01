// @module strategy
// @exports readActiveLatch, writeLatch, clearLatch, isLatched, readActiveStrategy, writeActiveStrategy
// @types -
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ActiveStrategy } from './schema.js';

const ACTIVE_PATH = '.roadmap/strategy/active.json';

interface LatchState {
  latched: boolean;
  matchedTokens: string[];
  latchedAt?: string;
}

interface ActiveFile {
  latch?: LatchState;
  strategy?: ActiveStrategy;
}

function resolvePath(root: string): string {
  return join(root, ACTIVE_PATH);
}

function readFile(root: string): ActiveFile {
  const p = resolvePath(root);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function writeFile(root: string, data: ActiveFile): void {
  const p = resolvePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function readActiveLatch(root: string): LatchState | undefined {
  return readFile(root).latch;
}

export function writeLatch(root: string, matchedTokens: string[]): void {
  const data = readFile(root);
  data.latch = { latched: true, matchedTokens, latchedAt: new Date().toISOString() };
  writeFile(root, data);
}

export function clearLatch(root: string): void {
  const data = readFile(root);
  delete data.latch;
  writeFile(root, data);
}

export function isLatched(root: string): boolean {
  const latch = readActiveLatch(root);
  return latch?.latched === true;
}

export function readActiveStrategy(root: string): ActiveStrategy | undefined {
  return readFile(root).strategy;
}

export function writeActiveStrategy(root: string, strategy: ActiveStrategy): void {
  const data = readFile(root);
  data.strategy = strategy;
  writeFile(root, data);
}
