// @module cli/commands/audit
// @exports run
// @entry roadmap/cli/commands/audit

import { scanSurface, buildImportGraph, scoreArchival } from '../../lib/audit/audit-engine.ts';
import type { SurfaceSchema } from '../../lib/audit/audit-schema.ts';

// --- Command ---

export function run(args: string[], repoRoot: string): void {
  const subcommand = args[0] ?? 'surface';

  if (subcommand === 'surface') {
    const surface = scanSurface(repoRoot);
    console.log(JSON.stringify({ ok: true, cmd: 'audit surface', data: formatSurface(surface) }));
    return;
  }

  if (subcommand === 'archive') {
    const surface = scanSurface(repoRoot);
    const graph = buildImportGraph(surface);
    const scores = scoreArchival(surface, graph);
    const threshold = parseThreshold(args);
    const candidates = scores.filter(s => s.score >= threshold);
    console.log(JSON.stringify({
      ok: true,
      cmd: 'audit archive',
      data: {
        totalFiles: surface.files.length,
        candidates: candidates.length,
        threshold,
        items: candidates.map(s => ({
          path: s.path,
          score: s.score,
          reasons: s.reasons,
          role: s.role,
          inDegree: s.inDegree,
        })),
      },
    }));
    return;
  }

  if (subcommand === 'report') {
    const surface = scanSurface(repoRoot);
    const graph = buildImportGraph(surface);
    const scores = scoreArchival(surface, graph);
    console.log(JSON.stringify({
      ok: true,
      cmd: 'audit report',
      data: {
        summary: surface.summary,
        importGraph: {
          totalEdges: graph.edges.length,
          avgInDegree: avg(Object.values(graph.inDegree)),
          avgOutDegree: avg(Object.values(graph.outDegree)),
          maxInDegree: Math.max(0, ...Object.values(graph.inDegree)),
          maxOutDegree: Math.max(0, ...Object.values(graph.outDegree)),
        },
        archival: {
          totalCandidates: scores.filter(s => s.score > 0).length,
          topCandidates: scores.slice(0, 10).map(s => ({
            path: s.path,
            score: s.score,
            reasons: s.reasons,
          })),
        },
      },
    }));
    return;
  }

  console.log(JSON.stringify({
    ok: false,
    cmd: 'audit',
    error: `Unknown subcommand: ${subcommand}. Use: surface, archive, report`,
  }));
  process.exit(1);
}

// --- Helpers ---

function formatSurface(surface: SurfaceSchema) {
  return {
    total: surface.summary.total,
    byRole: surface.summary.byRole,
    files: surface.files.map(f => ({
      path: f.path,
      role: f.role,
      sizeBytes: f.sizeBytes,
      exports: f.exports,
    })),
  };
}

function parseThreshold(args: string[]): number {
  const idx = args.indexOf('--threshold');
  if (idx >= 0 && args[idx + 1]) {
    const v = parseInt(args[idx + 1], 10);
    if (!isNaN(v)) return v;
  }
  return 20; // default threshold
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100;
}
