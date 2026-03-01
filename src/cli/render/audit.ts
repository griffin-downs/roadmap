// @module cli/render/audit
// @exports renderSurface, renderArchive, renderReport
// @entry roadmap/cli/render/audit

import type { FileRole } from '../../lib/audit/audit-schema.ts';

// --- Types ---

interface SurfaceData {
  total: number;
  byRole: Record<FileRole, number>;
  files: Array<{ path: string; role: string; sizeBytes: number; exports?: string[] }>;
}

interface ArchiveData {
  totalFiles: number;
  candidates: number;
  threshold: number;
  items: Array<{ path: string; score: number; reasons: string[]; role: string; inDegree: number }>;
}

interface ReportData {
  summary: { total: number; byRole: Record<string, number> };
  importGraph: { totalEdges: number; avgInDegree: number; avgOutDegree: number; maxInDegree: number; maxOutDegree: number };
  archival: { totalCandidates: number; topCandidates: Array<{ path: string; score: number; reasons: string[] }> };
}

// --- Renderers ---

export function renderSurface(data: SurfaceData): string {
  const lines: string[] = [];
  lines.push(`Surface: ${data.total} files`);
  lines.push('');
  lines.push('By role:');
  for (const [role, count] of Object.entries(data.byRole)) {
    if (count > 0) lines.push(`  ${role}: ${count}`);
  }
  return lines.join('\n');
}

export function renderArchive(data: ArchiveData): string {
  const lines: string[] = [];
  lines.push(`Archive candidates: ${data.candidates}/${data.totalFiles} (threshold: ${data.threshold})`);
  lines.push('');
  for (const item of data.items) {
    const badge = item.score >= 50 ? '!!' : item.score >= 30 ? '!' : ' ';
    lines.push(`${badge} [${String(item.score).padStart(3)}] ${item.path} (${item.role}, in:${item.inDegree})`);
    for (const r of item.reasons) lines.push(`       - ${r}`);
  }
  return lines.join('\n');
}

export function renderReport(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`Surface report: ${data.summary.total} files`);
  lines.push('');
  lines.push('Import graph:');
  lines.push(`  edges: ${data.importGraph.totalEdges}`);
  lines.push(`  avg in-degree: ${data.importGraph.avgInDegree}`);
  lines.push(`  avg out-degree: ${data.importGraph.avgOutDegree}`);
  lines.push(`  max in-degree: ${data.importGraph.maxInDegree}`);
  lines.push(`  max out-degree: ${data.importGraph.maxOutDegree}`);
  lines.push('');
  lines.push(`Archival: ${data.archival.totalCandidates} candidates`);
  for (const c of data.archival.topCandidates) {
    lines.push(`  [${String(c.score).padStart(3)}] ${c.path}`);
  }
  return lines.join('\n');
}
