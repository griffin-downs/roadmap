// @module cost-estimator
// @exports CostEstimate, estimateCost
// @entry roadmap

import * as fs from 'fs';
import * as path from 'path';
import type { TemplateParams } from './gallery.ts';

export interface CostEstimate {
  wallClockMinutes: number;
  costUSD: number;
  confidence: 'cold-start' | 'low' | 'medium' | 'high';
}

// Cost per 1k tokens
const COST_PER_1K_OPUS = 0.015;
const COST_PER_1K_HAIKU = 0.00025;
const TOKENS_PER_NODE_K = 0.5; // 500 tokens/node = 0.5k

// Fallback duration baselines (minutes/node)
const MINUTES_PER_NODE_OPUS_HEAVY = 1.5;
const MINUTES_PER_NODE_HAIKU_HEAVY = 0.5;

// Parallelism factor: wall clock = sum / factor
const PARALLELISM_FACTOR = 2.5;

function computeCostUSD(nodeCount: number, modelAllocation: TemplateParams['modelAllocation']): number {
  const tokensK = nodeCount * TOKENS_PER_NODE_K;
  if (modelAllocation === 'opus-all') {
    return tokensK * COST_PER_1K_OPUS;
  }
  if (modelAllocation === 'opus-emit+haiku-fix') {
    return tokensK * (COST_PER_1K_OPUS * 0.6 + COST_PER_1K_HAIKU * 0.4);
  }
  // haiku-emit+opus-judge: 70% haiku, 30% opus
  return tokensK * (COST_PER_1K_HAIKU * 0.7 + COST_PER_1K_OPUS * 0.3);
}

function isOpusHeavy(modelAllocation: TemplateParams['modelAllocation']): boolean {
  return modelAllocation === 'opus-all' || modelAllocation === 'opus-emit+haiku-fix';
}

// Read checkpoint files and return array of duration values in minutes.
// Accepts `duration` (minutes) or `durationMs` (milliseconds) fields.
function readCheckpointDurations(checkpointDir: string): number[] {
  if (!fs.existsSync(checkpointDir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(checkpointDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const durations: number[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(checkpointDir, entry.name), 'utf8');
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (typeof obj['duration'] === 'number') {
        durations.push(obj['duration'] as number);
      } else if (typeof obj['durationMs'] === 'number') {
        durations.push((obj['durationMs'] as number) / 60_000);
      }
    } catch {
      // Malformed JSON — skip
    }
  }
  return durations;
}

// Count JSON files in a directory (for confidence from evaluations history).
function countJsonFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function confidenceFromCount(count: number): CostEstimate['confidence'] {
  if (count === 0) return 'cold-start';
  if (count <= 2) return 'low';
  if (count <= 9) return 'medium';
  return 'high';
}

export function estimateCost(params: {
  nodeCount: number;
  modelAllocation: TemplateParams['modelAllocation'];
  checkpointDir?: string;
  evaluationsDir?: string;
}): CostEstimate {
  const { nodeCount, modelAllocation, checkpointDir, evaluationsDir } = params;

  const costUSD = computeCostUSD(nodeCount, modelAllocation);

  // Gather duration history from checkpoints
  const checkpointDurations = checkpointDir ? readCheckpointDurations(checkpointDir) : [];

  let wallClockMinutes: number;
  if (checkpointDurations.length > 0) {
    // Average observed duration per node, scaled to nodeCount, divided by parallelism
    const avgNodeDuration = checkpointDurations.reduce((a, b) => a + b, 0) / checkpointDurations.length;
    wallClockMinutes = (avgNodeDuration * nodeCount) / PARALLELISM_FACTOR;
  } else {
    // Fallback baseline
    const minutesPerNode = isOpusHeavy(modelAllocation)
      ? MINUTES_PER_NODE_OPUS_HEAVY
      : MINUTES_PER_NODE_HAIKU_HEAVY;
    wallClockMinutes = (minutesPerNode * nodeCount) / PARALLELISM_FACTOR;
  }

  // Confidence from total history files (checkpoints + evaluations)
  const evalCount = evaluationsDir ? countJsonFiles(evaluationsDir) : 0;
  const totalHistoryCount = checkpointDurations.length + evalCount;
  const confidence = confidenceFromCount(totalHistoryCount);

  return { wallClockMinutes, costUSD, confidence };
}
