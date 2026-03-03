// @module metrics-extractor
// @exports extractMetrics, MetricsExtractor, TrailEntry, SessionMetrics, NodeMetrics, BatchMetrics
// @types TrailEntry, SessionMetrics, NodeMetrics, BatchMetrics, MetricsSummary

import fs from 'fs';

// Trail entry: union of all fields seen across command types
export type TrailEntry = {
  ts?: string;
  timestamp?: string;
  cmd?: string;
  type?: string;
  note?: string;
  repo?: string;
  dagId?: string;
  position?: string[];
  level?: number;
  done?: number;
  remaining?: number;
  produces?: string[];
  consumes?: string[];
  nodeId?: string;
  label?: string;
  code?: string;
  operation?: string;
  detail?: {
    done?: number;
    remaining?: number;
    complete?: boolean;
    batchRemaining?: number;
  };
};

export type NodeMetrics = {
  nodeId: string;
  repo: string;
  dagId?: string;
  firstSeen: string;
  lastSeen: string;
  durationMs: number;
  commands: string[];
  completed: boolean;
};

export type BatchMetrics = {
  level: number;
  repo: string;
  dagId?: string;
  nodeCount: number;
  nodes: string[];
  firstSeen: string;
  lastSeen: string;
  durationMs: number;
  completionVelocity: number; // nodes per hour
};

export type SessionMetrics = {
  repo: string;
  dagId?: string;
  startTs: string;
  endTs: string;
  durationMs: number;
  commandCount: number;
  commandBreakdown: Record<string, number>;
  levelsTraversed: number;
  nodesCompleted: number;
};

export type MetricsSummary = {
  extractedAt: string;
  trailEntries: number;
  repos: string[];
  sessions: SessionMetrics[];
  nodes: NodeMetrics[];
  batches: BatchMetrics[];
  commandCounts: Record<string, number>;
  successRate: number;
  avgBatchDurationMs: number;
  avgCompletionVelocity: number;
};

function parseTs(entry: TrailEntry): number {
  const raw = entry.ts || entry.timestamp || '';
  return new Date(raw).getTime();
}

function normalizeCmd(entry: TrailEntry): string {
  return entry.cmd || entry.type || 'unknown';
}

// Session boundary: gap > 30 minutes between entries for same repo
const SESSION_GAP_MS = 30 * 60 * 1000;

export class MetricsExtractor {
  private entries: TrailEntry[];

  constructor(entries: TrailEntry[]) {
    this.entries = entries.filter(e => (e.ts || e.timestamp));
  }

  static fromFile(path: string): MetricsExtractor {
    if (!fs.existsSync(path)) return new MetricsExtractor([]);
    const content = fs.readFileSync(path, 'utf-8');
    const entries = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as TrailEntry[];
    return new MetricsExtractor(entries);
  }

  static fromFiles(...paths: string[]): MetricsExtractor {
    const all: TrailEntry[] = [];
    for (const p of paths) {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf-8');
      content.split('\n').filter(l => l.trim()).forEach(l => {
        try { all.push(JSON.parse(l)); } catch { /* skip */ }
      });
    }
    return new MetricsExtractor(all);
  }

  commandCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.entries) {
      const cmd = normalizeCmd(e);
      counts[cmd] = (counts[cmd] || 0) + 1;
    }
    return counts;
  }

  sessions(): SessionMetrics[] {
    // Group by repo, then split by time gaps
    const byRepo = new Map<string, TrailEntry[]>();
    for (const e of this.entries) {
      const repo = e.repo || 'unknown';
      if (!byRepo.has(repo)) byRepo.set(repo, []);
      byRepo.get(repo)!.push(e);
    }

    const sessions: SessionMetrics[] = [];
    for (const [repo, entries] of byRepo) {
      const sorted = entries.sort((a, b) => parseTs(a) - parseTs(b));
      let sessionStart = 0;
      for (let i = 0; i < sorted.length; i++) {
        const isLast = i === sorted.length - 1;
        const gapNext = isLast ? Infinity : parseTs(sorted[i + 1]) - parseTs(sorted[i]);
        if (gapNext > SESSION_GAP_MS || isLast) {
          const slice = sorted.slice(sessionStart, i + 1);
          const startTs = parseTs(slice[0]);
          const endTs = parseTs(slice[slice.length - 1]);
          const cmdBreakdown: Record<string, number> = {};
          for (const s of slice) {
            const cmd = normalizeCmd(s);
            cmdBreakdown[cmd] = (cmdBreakdown[cmd] || 0) + 1;
          }
          const levels = new Set(slice.map(s => s.level).filter(l => l !== undefined));
          const completions = slice.filter(s => normalizeCmd(s) === 'complete').length;
          const dagId = slice.find(s => s.dagId)?.dagId;

          sessions.push({
            repo,
            dagId,
            startTs: slice[0].ts || slice[0].timestamp || '',
            endTs: slice[slice.length - 1].ts || slice[slice.length - 1].timestamp || '',
            durationMs: endTs - startTs,
            commandCount: slice.length,
            commandBreakdown: cmdBreakdown,
            levelsTraversed: levels.size,
            nodesCompleted: completions,
          });
          sessionStart = i + 1;
        }
      }
    }
    return sessions;
  }

  nodeMetrics(): NodeMetrics[] {
    // Track nodes that appear in position arrays or via nodeId field
    const nodeMap = new Map<string, { entries: TrailEntry[]; repo: string; dagId?: string }>();

    for (const e of this.entries) {
      const repo = e.repo || 'unknown';
      const dagId = e.dagId;

      // Nodes from position array
      if (e.position) {
        for (const nid of e.position) {
          const key = `${repo}:${nid}`;
          if (!nodeMap.has(key)) nodeMap.set(key, { entries: [], repo, dagId });
          nodeMap.get(key)!.entries.push(e);
        }
      }

      // Nodes from explicit nodeId
      if (e.nodeId) {
        const key = `${repo}:${e.nodeId}`;
        if (!nodeMap.has(key)) nodeMap.set(key, { entries: [], repo, dagId });
        nodeMap.get(key)!.entries.push(e);
      }
    }

    const metrics: NodeMetrics[] = [];
    for (const [key, { entries, repo, dagId }] of nodeMap) {
      const nodeId = key.split(':').slice(1).join(':');
      const sorted = entries.sort((a, b) => parseTs(a) - parseTs(b));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const cmds = [...new Set(sorted.map(normalizeCmd))];
      const completed = sorted.some(e =>
        normalizeCmd(e) === 'complete' && e.nodeId === nodeId
      );

      metrics.push({
        nodeId,
        repo,
        dagId,
        firstSeen: first.ts || first.timestamp || '',
        lastSeen: last.ts || last.timestamp || '',
        durationMs: parseTs(last) - parseTs(first),
        commands: cmds,
        completed,
      });
    }
    return metrics;
  }

  batchMetrics(): BatchMetrics[] {
    // Group by (repo, level), compute metrics
    const batchMap = new Map<string, { entries: TrailEntry[]; nodes: Set<string>; repo: string; dagId?: string; level: number }>();

    for (const e of this.entries) {
      if (e.level === undefined || !e.position) continue;
      const repo = e.repo || 'unknown';
      const key = `${repo}:${e.level}`;
      if (!batchMap.has(key)) {
        batchMap.set(key, { entries: [], nodes: new Set(), repo, dagId: e.dagId, level: e.level });
      }
      const b = batchMap.get(key)!;
      b.entries.push(e);
      for (const n of e.position) b.nodes.add(n);
    }

    const metrics: BatchMetrics[] = [];
    for (const [, { entries, nodes, repo, dagId, level }] of batchMap) {
      const sorted = entries.sort((a, b) => parseTs(a) - parseTs(b));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const dur = parseTs(last) - parseTs(first);
      const hours = dur / (1000 * 60 * 60);
      const velocity = hours > 0 ? nodes.size / hours : nodes.size;

      metrics.push({
        level,
        repo,
        dagId,
        nodeCount: nodes.size,
        nodes: [...nodes],
        firstSeen: first.ts || first.timestamp || '',
        lastSeen: last.ts || last.timestamp || '',
        durationMs: dur,
        completionVelocity: Math.round(velocity * 100) / 100,
      });
    }
    return metrics.sort((a, b) => a.level - b.level);
  }

  successRate(): number {
    const completes = this.entries.filter(e => normalizeCmd(e) === 'complete').length;
    const errors = this.entries.filter(e => normalizeCmd(e) === 'error' || e.type === 'error' || e.code).length;
    const total = completes + errors;
    if (total === 0) return 1;
    return Math.round((completes / total) * 10000) / 10000;
  }

  summary(): MetricsSummary {
    const batches = this.batchMetrics();
    const batchDurations = batches.map(b => b.durationMs).filter(d => d > 0);
    const batchVelocities = batches.map(b => b.completionVelocity).filter(v => v > 0 && isFinite(v));

    return {
      extractedAt: new Date().toISOString(),
      trailEntries: this.entries.length,
      repos: [...new Set(this.entries.map(e => e.repo || 'unknown'))],
      sessions: this.sessions(),
      nodes: this.nodeMetrics(),
      batches,
      commandCounts: this.commandCounts(),
      successRate: this.successRate(),
      avgBatchDurationMs: batchDurations.length > 0
        ? Math.round(batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length)
        : 0,
      avgCompletionVelocity: batchVelocities.length > 0
        ? Math.round((batchVelocities.reduce((a, b) => a + b, 0) / batchVelocities.length) * 100) / 100
        : 0,
    };
  }
}

// Main: extract from local + global trail, write to .roadmap/metrics.jsonl
export function extractMetrics(
  trailPaths: string[],
  outputPath: string,
): MetricsSummary {
  const extractor = MetricsExtractor.fromFiles(...trailPaths);
  const summary = extractor.summary();

  // Write as JSONL (one entry per line for each metric type)
  const lines: string[] = [];
  lines.push(JSON.stringify({ type: 'summary', ...summary, sessions: undefined, nodes: undefined, batches: undefined }));
  for (const s of summary.sessions) lines.push(JSON.stringify({ type: 'session', ...s }));
  for (const n of summary.nodes) lines.push(JSON.stringify({ type: 'node', ...n }));
  for (const b of summary.batches) lines.push(JSON.stringify({ type: 'batch', ...b }));

  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n') + '\n');

  return summary;
}
