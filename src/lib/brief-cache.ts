// @module brief-cache
// @exports writeNodeCache, readNodeCache, NodeContextCache
// @types NodeContextCache, FileSummary
// @entry roadmap

// Convention cache: extracts bounded summaries from produced files
// after advance, writes to .roadmap/.cache/<node-id>.context.json.
// Orient reads these to build backward cone slices for enriched briefs.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Graph } from '../protocol.ts';
import { node } from '../core/access.ts';

const CACHE_DIR = '.roadmap/.cache';
const MAX_CHARS = 2000; // ~500 tokens budget
const HEAD_LINES = 20;

export interface FileSummary {
  path: string;
  headLines: string[];
  exports: string[];
  signatures: string[];
}

export interface NodeContextCache {
  nodeId: string;
  timestamp: string;
  files: FileSummary[];
  conventions: {
    importStyle: string | null;
    exportStyle: string | null;
    namingHint: string | null;
  };
}

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h',
]);

function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path));
}

export function extractFileSummary(filePath: string, repoRoot: string): FileSummary | null {
  const abs = join(repoRoot, filePath);
  if (!existsSync(abs)) return null;
  if (!isCodeFile(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const headLines = lines.slice(0, HEAD_LINES);

  // Extract exports
  const exports: string[] = [];
  for (const line of lines) {
    if (/^export\s+(function|const|class|interface|type|enum|default)\b/.test(line)) {
      // Trim to signature only (no body)
      const sig = line.replace(/\{.*$/, '').replace(/=.*$/, '').trim();
      if (sig.length < 200) exports.push(sig);
    }
    // Python
    if (/^def\s+\w+/.test(line) || /^class\s+\w+/.test(line)) {
      exports.push(line.trim());
    }
  }

  // Extract function/method signatures (non-exported)
  const signatures: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(async\s+)?function\s+\w+/.test(trimmed) && !trimmed.startsWith('export')) {
      const sig = trimmed.replace(/\{.*$/, '').trim();
      if (sig.length < 200) signatures.push(sig);
    }
  }

  return {
    path: filePath,
    headLines,
    exports: exports.slice(0, 10),
    signatures: signatures.slice(0, 10),
  };
}

function detectConventions(files: FileSummary[]): NodeContextCache['conventions'] {
  let importStyle: string | null = null;
  let exportStyle: string | null = null;
  let namingHint: string | null = null;

  for (const f of files) {
    for (const line of f.headLines) {
      // Import style detection
      if (!importStyle) {
        if (/^import\s+\{/.test(line)) importStyle = 'named';
        else if (/^import\s+\w+\s+from/.test(line)) importStyle = 'default';
        else if (/^import\s+type\s+/.test(line)) importStyle = 'type-import';
        else if (/^const\s+\w+\s*=\s*require\(/.test(line)) importStyle = 'require';
      }
    }

    // Export style detection
    if (!exportStyle && f.exports.length > 0) {
      if (f.exports.some(e => e.startsWith('export default'))) exportStyle = 'default-export';
      else if (f.exports.some(e => e.startsWith('export function') || e.startsWith('export const'))) exportStyle = 'named-export';
    }

    // Naming hint from function names
    if (!namingHint) {
      const allNames = [
        ...f.exports,
        ...f.signatures,
      ].join(' ');
      if (/[a-z][A-Z]/.test(allNames)) namingHint = 'camelCase';
      else if (/_[a-z]/.test(allNames)) namingHint = 'snake_case';
    }
  }

  return { importStyle, exportStyle, namingHint };
}

function truncateCache(cache: NodeContextCache): NodeContextCache {
  let budget = MAX_CHARS;
  const truncatedFiles: FileSummary[] = [];

  for (const f of cache.files) {
    const serialized = JSON.stringify(f);
    if (budget - serialized.length < 0 && truncatedFiles.length > 0) break;
    budget -= serialized.length;
    truncatedFiles.push(f);
  }

  return { ...cache, files: truncatedFiles };
}

/**
 * Write convention cache for a completed node.
 * Reads produced files, extracts bounded summary, writes to .roadmap/.cache/.
 * Non-blocking: returns false on failure instead of throwing.
 */
export function writeNodeCache(
  nodeId: string,
  dag: Graph<string>,
  repoRoot: string,
): boolean {
  const spec = node(dag, nodeId);
  if (!spec) return false;

  const files: FileSummary[] = [];
  for (const produce of spec.produces) {
    const summary = extractFileSummary(produce, repoRoot);
    if (summary) files.push(summary);
  }

  if (files.length === 0) return false;

  const cache: NodeContextCache = {
    nodeId,
    timestamp: new Date().toISOString(),
    files,
    conventions: detectConventions(files),
  };

  const bounded = truncateCache(cache);

  const cacheDir = join(repoRoot, CACHE_DIR);
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  try {
    writeFileSync(
      join(cacheDir, `${nodeId}.context.json`),
      JSON.stringify(bounded, null, 2) + '\n',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read cached convention context for a node.
 * Returns null if no cache exists.
 */
export function readNodeCache(
  nodeId: string,
  repoRoot: string,
): NodeContextCache | null {
  const cachePath = join(repoRoot, CACHE_DIR, `${nodeId}.context.json`);
  if (!existsSync(cachePath)) return null;

  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}
