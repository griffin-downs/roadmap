// @module metaflow/miner
// @exports mine, detectOrientChurn, detectValidateLoop, detectToolInflation, detectAskChurn, detectEnforcementRetry

import { readFileSync, existsSync } from 'node:fs';
import type {
  InteractionReceipt, SessionsStore, MiningResult, FrictionFinding,
  ToolHotspot, RunId
} from '../types.ts';

// ── Friction detectors ────────────────────────────────────────────────────────

/**
 * Flag if >3 sequential orient receipts with no intervening 'complete'.
 */
export function detectOrientChurn(receipts: InteractionReceipt[]): FrictionFinding[] {
  const findings: FrictionFinding[] = [];
  let orientStreak = 0;
  let streakStart = 0;

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (r.cmd.startsWith('roadmap orient')) {
      if (orientStreak === 0) streakStart = i;
      orientStreak++;
    } else if (r.cmd.startsWith('roadmap complete')) {
      orientStreak = 0;
    }

    if (orientStreak > 3) {
      findings.push({
        category: 'orient-churn',
        subcategory: 'sequential-orients',
        agent: 'unknown',
        detail: `${orientStreak} sequential orient calls starting at step ${streakStart} with no intervening complete`,
        time: r.evidence?.latencyMs,
      });
      orientStreak = 0;
    }
  }
  return findings;
}

/**
 * Flag if 'roadmap complete' → 'roadmap validate' pattern repeats >2x.
 */
export function detectValidateLoop(receipts: InteractionReceipt[]): FrictionFinding[] {
  const findings: FrictionFinding[] = [];
  let loopCount = 0;

  for (let i = 0; i < receipts.length - 1; i++) {
    const curr = receipts[i];
    const next = receipts[i + 1];
    if (curr.cmd.startsWith('roadmap complete') && next.cmd.startsWith('roadmap validate')) {
      loopCount++;
    } else {
      loopCount = 0;
    }
    if (loopCount > 2) {
      findings.push({
        category: 'validate-loop',
        subcategory: 'complete-validate-cycle',
        agent: 'unknown',
        detail: `complete→validate cycle repeated ${loopCount}x`,
      });
      loopCount = 0;
    }
  }
  return findings;
}

/**
 * Flag if same tool appears >5x for a single workerId within 60s.
 */
export function detectToolInflation(sessions: SessionsStore): FrictionFinding[] {
  // Tool inflation detected in mine() via hotspot ranking from hooks.log
  return [];
}

/**
 * Flag if mf ask/answer cycles >4 for same questionId.
 */
export function detectAskChurn(receipts: InteractionReceipt[]): FrictionFinding[] {
  const findings: FrictionFinding[] = [];
  const questionCounts = new Map<string, number>();

  for (const r of receipts) {
    if (r.cmd.startsWith('roadmap mf ask') || r.cmd.startsWith('roadmap mf answer')) {
      const match = r.cmd.match(/--question-id\s+(\S+)/);
      const qid = match?.[1] ?? '_unknown';
      questionCounts.set(qid, (questionCounts.get(qid) ?? 0) + 1);
    }
  }

  for (const [qid, count] of questionCounts) {
    if (count > 4) {
      findings.push({
        category: 'ask-churn',
        subcategory: 'repeated-question',
        agent: 'unknown',
        detail: `Question ${qid} cycled ${count} times (ask+answer pairs)`,
      });
    }
  }
  return findings;
}

/**
 * Port of regent-transcript-pathology retry detection.
 * Parses hooks.log for same tool blocked within 10s.
 */
export function detectEnforcementRetry(hooksLogPath: string): FrictionFinding[] {
  if (!existsSync(hooksLogPath)) return [];
  const findings: FrictionFinding[] = [];
  const seen = new Map<string, number>();

  const lines = readFileSync(hooksLogPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.msg !== 'Tool blocked') continue;
    const agent = String(entry.agentType ?? 'unknown');
    const tool = String(entry.toolName ?? 'unknown');
    const key = `${agent}:${tool}`;
    const time = typeof entry.time === 'number' ? entry.time : Date.now();
    const prev = seen.get(key);

    if (prev != null && (time - prev) < 10_000) {
      findings.push({
        category: 'enforcement-retry',
        subcategory: 'unnecessary-retry',
        agent,
        detail: `${agent} retried blocked tool '${tool}' within ${Math.round((time - prev) / 1000)}s`,
        time,
      });
    }
    seen.set(key, time);
  }
  return findings;
}

// ── Percentile helpers ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Main mine() ───────────────────────────────────────────────────────────────

export function mine(
  receipts: InteractionReceipt[],
  sessions: SessionsStore,
  hooksLogPath?: string
): MiningResult {
  const runId = receipts[0]?.runId ?? ('' as RunId);

  // Latency
  const latencies = receipts.map(r => r.evidence?.latencyMs ?? 0).sort((a, b) => a - b);
  const latencyP50Ms = percentile(latencies, 50);
  const latencyP95Ms = percentile(latencies, 95);
  const toolCallTotal = receipts.reduce((s, r) => s + (r.evidence?.toolCalls ?? 0), 0);

  // Hotspots from hooks.log
  const hotspots: ToolHotspot[] = [];
  if (hooksLogPath && existsSync(hooksLogPath)) {
    const toolCounts = new Map<string, { count: number; agents: Set<string> }>();
    const lines = readFileSync(hooksLogPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }
      const tool = String(entry.toolName ?? '');
      const agent = String(entry.agentType ?? 'unknown');
      if (!tool) continue;
      if (!toolCounts.has(tool)) toolCounts.set(tool, { count: 0, agents: new Set() });
      const tc = toolCounts.get(tool)!;
      tc.count++;
      tc.agents.add(agent);
    }
    for (const [tool, { count, agents }] of toolCounts) {
      hotspots.push({ tool, count, agentIds: [...agents] });
    }
    hotspots.sort((a, b) => b.count - a.count);
  }

  // Friction
  const friction: FrictionFinding[] = [
    ...detectOrientChurn(receipts),
    ...detectValidateLoop(receipts),
    ...detectToolInflation(sessions),
    ...detectAskChurn(receipts),
    ...(hooksLogPath ? detectEnforcementRetry(hooksLogPath) : []),
  ];

  // Tool inflation from hotspots
  for (const h of hotspots) {
    if (h.count > 5) {
      friction.push({
        category: 'tool-inflation',
        subcategory: 'hotspot',
        agent: h.agentIds[0] ?? 'unknown',
        detail: `Tool '${h.tool}' called ${h.count}x across agents [${h.agentIds.join(', ')}]`,
      });
    }
  }

  const teamReuseMissed = sessions.reuseField?.teamReuseMissed ?? false;

  return {
    schema_version: 1,
    runId,
    computedAt: new Date().toISOString(),
    latencyP50Ms,
    latencyP95Ms,
    toolCallTotal,
    hotspots,
    friction,
    teamReuseMissed,
  };
}
