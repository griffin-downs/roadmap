// @module audit/engine
// @exports scanSurface, buildImportGraph, scoreArchival, ArchivalScore, ImportGraph
// @entry roadmap/audit

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { SurfaceSchema, FileEntry, FileRole } from './audit-schema.ts';

// --- Types ---

export interface ImportEdge {
  from: string;    // importer path (relative to root)
  to: string;      // imported path (relative to root)
  specifier: string; // raw import specifier
}

export interface ImportGraph {
  nodes: string[];           // all file paths
  edges: ImportEdge[];       // directed import edges
  inDegree: Record<string, number>;   // how many files import this
  outDegree: Record<string, number>;  // how many files this imports
}

export interface ArchivalScore {
  path: string;
  score: number;         // 0-100, higher = more archivable
  reasons: string[];
  inDegree: number;
  outDegree: number;
  role: FileRole;
  sizeBytes: number;
  hasSideEffects: boolean;
}

// --- Constants ---

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.roadmap']);
const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|\n)(?:process\.exit|console\.\w+|fs\.\w+Sync|execSync)\s*\(/;

// --- Scanning ---

export function scanSurface(root: string): SurfaceSchema {
  const files: FileEntry[] = [];
  walkDir(root, root, files);

  const byRole: Record<string, number> = {};
  for (const f of files) {
    byRole[f.role] = (byRole[f.role] ?? 0) + 1;
  }

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    root,
    files,
    summary: {
      total: files.length,
      byRole: byRole as Record<FileRole, number>,
    },
  };
}

function walkDir(dir: string, root: string, out: FileEntry[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(full, root, out);
      continue;
    }

    const rel = relative(root, full);
    const ext = extname(name);
    if (!TS_EXTENSIONS.has(ext) && ext !== '.json' && ext !== '.md') continue;

    let content: string;
    try {
      content = readFileSync(full, 'utf-8');
    } catch {
      continue;
    }

    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const role = classifyRole(rel);
    const exports = TS_EXTENSIONS.has(ext) ? extractExports(content) : undefined;

    out.push({
      path: rel,
      role,
      hash,
      sizeBytes: stat.size,
      ...(exports?.length ? { exports } : {}),
    });
  }
}

function classifyRole(path: string): FileRole {
  if (path.startsWith('bin/')) return 'cli-entry';
  if (path.startsWith('src/cli/commands/')) return 'command';
  if (path.startsWith('tests/') || path.endsWith('.test.ts') || path.endsWith('.spec.ts')) return 'test';
  if (path.startsWith('scripts/')) return 'script';
  if (path.startsWith('docs/') || path.endsWith('.md')) return 'doc';
  if (path === 'tsconfig.json' || path === 'package.json' || path === 'vitest.config.ts') return 'config';
  if (path.endsWith('.schema.ts') || path.includes('generated')) return 'generated';
  if (path.startsWith('src/protocol.ts') || path.startsWith('src/errors.ts') || path.startsWith('src/predicates.ts')) return 'core';
  if (path.startsWith('src/lib/')) return 'lib';
  if (path.startsWith('src/')) return 'core';
  return 'lib';
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    exports.push(m[1]);
  }
  return exports;
}

// --- Import graph ---

export function buildImportGraph(surface: SurfaceSchema): ImportGraph {
  const tsFiles = surface.files.filter(f => TS_EXTENSIONS.has(extname(f.path)));
  const allPaths = new Set(surface.files.map(f => f.path));
  const edges: ImportEdge[] = [];
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};

  for (const p of allPaths) {
    inDegree[p] = 0;
    outDegree[p] = 0;
  }

  for (const file of tsFiles) {
    let content: string;
    try {
      content = readFileSync(join(surface.root, file.path), 'utf-8');
    } catch {
      continue;
    }

    const imports = extractImports(content);
    for (const spec of imports) {
      const resolved = resolveImport(file.path, spec, allPaths);
      if (!resolved) continue;

      edges.push({ from: file.path, to: resolved, specifier: spec });
      inDegree[resolved] = (inDegree[resolved] ?? 0) + 1;
      outDegree[file.path] = (outDegree[file.path] ?? 0) + 1;
    }
  }

  return {
    nodes: [...allPaths],
    edges,
    inDegree,
    outDegree,
  };
}

function extractImports(content: string): string[] {
  const results: string[] = [];
  let m;
  const re = new RegExp(IMPORT_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    const spec = m[1];
    if (spec.startsWith('.')) results.push(spec);  // only relative imports
  }
  return results;
}

function resolveImport(fromPath: string, specifier: string, known: Set<string>): string | null {
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '.';
  const candidates: string[] = [];

  // Normalize relative path
  const parts = (dir === '.' ? specifier.slice(2) : `${dir}/${specifier.slice(2)}`).split('/');
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  const base = resolved.join('/');

  // Try exact, then with extensions
  candidates.push(base);
  for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
    candidates.push(base.replace(/\.\w+$/, '') + ext);  // replace existing extension
    candidates.push(base + ext);                          // append extension
  }

  for (const c of candidates) {
    if (known.has(c)) return c;
  }
  return null;
}

// --- Side-effect detection ---

function hasSideEffects(root: string, path: string): boolean {
  if (!TS_EXTENSIONS.has(extname(path))) return false;
  try {
    const content = readFileSync(join(root, path), 'utf-8');
    return SIDE_EFFECT_RE.test(content);
  } catch {
    return false;
  }
}

// --- Archival scoring ---

export function scoreArchival(surface: SurfaceSchema, graph: ImportGraph): ArchivalScore[] {
  const scores: ArchivalScore[] = [];

  for (const file of surface.files) {
    const reasons: string[] = [];
    let score = 0;
    const se = hasSideEffects(surface.root, file.path);

    // High in-degree = many dependents = less archivable
    const inD = graph.inDegree[file.path] ?? 0;
    const outD = graph.outDegree[file.path] ?? 0;

    // Scripts are most archivable
    if (file.role === 'script') { score += 30; reasons.push('role: script'); }
    if (file.role === 'generated') { score += 25; reasons.push('role: generated'); }
    if (file.role === 'doc') { score += 15; reasons.push('role: doc'); }

    // Zero importers = nobody depends on this
    if (inD === 0 && file.role !== 'cli-entry' && file.role !== 'config' && file.role !== 'test') {
      score += 25;
      reasons.push('zero importers (dead code candidate)');
    }

    // Large files are archival candidates
    if (file.sizeBytes > 20000) { score += 10; reasons.push(`large file: ${Math.round(file.sizeBytes / 1024)}KB`); }

    // Side effects reduce archivability (might break things)
    if (se) { score -= 15; reasons.push('has side effects (risk)'); }

    // Tests: archivable if they cover archived code
    if (file.role === 'test' && inD === 0) { score += 10; reasons.push('orphan test'); }

    // CLI entries and config are not archivable
    if (file.role === 'cli-entry') { score -= 20; reasons.push('CLI entry (keep)'); }
    if (file.role === 'config') { score -= 20; reasons.push('config (keep)'); }

    // Core files have low archivability
    if (file.role === 'core') { score -= 10; reasons.push('core module'); }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    scores.push({
      path: file.path,
      score,
      reasons,
      inDegree: inD,
      outDegree: outD,
      role: file.role,
      sizeBytes: file.sizeBytes,
      hasSideEffects: se,
    });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  return scores;
}
