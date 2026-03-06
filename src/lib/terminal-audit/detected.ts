// @module terminal-audit/detected
// @description Mechanically detect audit gaps — uncovered consumes, scope leaks, untested produces
// @exports DetectedGap, GapType, DetectionResult, detectGaps

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

// --- Types ---

export type GapType = 'uncovered-consume' | 'scope-leak' | 'untested-produce';

export interface DetectedGap {
  type: GapType;
  nodeId: string;
  artifact: string;
  detail: string;
}

export interface DetectionResult {
  gaps: DetectedGap[];
  summary: { uncoveredConsumes: number; scopeLeaks: number; untestedProduces: number; total: number };
}

// --- Implementation ---

/**
 * Detect gaps mechanically from DAG structure + filesystem state.
 *
 * Three detection passes:
 * 1. uncovered-consume: consumes[] entries not covered by any artifact-exists or shell validator
 *    across the DAG (i.e., no node validates that the consumed artifact actually exists)
 * 2. scope-leak: changed files that fall outside every node's produces[]
 * 3. untested-produce: produce files not referenced in any shell validator command
 *
 * @param dag - The graph being audited
 * @param changedFiles - Files changed in the working tree (e.g. from git diff)
 */
export function detectGaps(
  dag: Graph<string>,
  changedFiles: string[],
): DetectionResult {
  const gaps: DetectedGap[] = [];

  // Collect all produces and all validated artifacts across the DAG
  const allProduces = new Set<string>();
  const validatedArtifacts = new Set<string>();
  const shellCommands: string[] = [];

  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const p of node.produces ?? []) allProduces.add(p);

    for (const rule of node.validate ?? []) {
      collectValidatedArtifacts(rule, validatedArtifacts, shellCommands);
    }
  }

  // Pass 1: Uncovered consumes — consume not validated by artifact-exists anywhere
  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const consume of node.consumes ?? []) {
      const artifact = consumeArtifact(consume);
      if (!validatedArtifacts.has(artifact) && !isInitMarker(artifact)) {
        gaps.push({
          type: 'uncovered-consume',
          nodeId,
          artifact,
          detail: `consumes "${artifact}" but no node validates its existence via artifact-exists or shell`,
        });
      }
    }
  }

  // Collect files referenced in shell commands (test files, etc.) — not scope leaks
  const shellReferencedFiles = extractShellReferencedFiles(shellCommands);

  // Pass 2: Scope leaks — changed files outside any produces[] or shell-referenced files
  for (const file of changedFiles) {
    if (!allProduces.has(file) && !isInfraFile(file) && !shellReferencedFiles.has(file)) {
      gaps.push({
        type: 'scope-leak',
        nodeId: '',
        artifact: file,
        detail: `changed file "${file}" is not in any node's produces[]`,
      });
    }
  }

  // Pass 3: Untested produces — produce files not referenced in any shell command
  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const produce of node.produces ?? []) {
      if (!isReferencedByShell(produce, shellCommands) && !isInitMarker(produce)) {
        gaps.push({
          type: 'untested-produce',
          nodeId,
          artifact: produce,
          detail: `produces "${produce}" but no shell validator references it`,
        });
      }
    }
  }

  const uncoveredConsumes = gaps.filter(g => g.type === 'uncovered-consume').length;
  const scopeLeaks = gaps.filter(g => g.type === 'scope-leak').length;
  const untestedProduces = gaps.filter(g => g.type === 'untested-produce').length;

  return {
    gaps,
    summary: {
      uncoveredConsumes,
      scopeLeaks,
      untestedProduces,
      total: gaps.length,
    },
  };
}

// --- Helpers ---

/** Extract artifact paths validated by a rule + collect shell command strings */
function collectValidatedArtifacts(
  rule: ValidationRule,
  artifacts: Set<string>,
  shellCommands: string[],
): void {
  if (rule.type === 'artifact-exists') {
    const target = rule.target ?? rule.path;
    if (target) artifacts.add(target);
  } else if (rule.type === 'shell') {
    const cmd = 'argv' in rule ? rule.argv.join(' ') : String(rule.command);
    shellCommands.push(cmd);
  } else if (rule.type === 'build-produces') {
    shellCommands.push(rule.command);
  }
}

/** Init markers are synthetic — never flag them */
function isInitMarker(artifact: string): boolean {
  return artifact === 'init.marker' || artifact.endsWith('.marker');
}

/** Infrastructure files (.roadmap/*, .git/*, package.json, etc.) are not scope leaks */
function isInfraFile(file: string): boolean {
  return file.startsWith('.roadmap/') || file.startsWith('.git/') ||
    file === 'package.json' || file === 'package-lock.json' ||
    file === 'pnpm-lock.yaml' || file === 'tsconfig.json';
}

/** Extract file paths referenced in shell commands (e.g. test files passed to vitest/jest) */
function extractShellReferencedFiles(shellCommands: string[]): Set<string> {
  const files = new Set<string>();
  for (const cmd of shellCommands) {
    // Extract paths: tokens containing / and ending in known extensions
    for (const token of cmd.split(/\s+/)) {
      if (token.includes('/') && /\.\w+$/.test(token)) {
        files.add(token);
      }
    }
  }
  return files;
}

/**
 * Check if a produce file is tested by any shell command.
 *
 * Three matching strategies:
 * 1. Direct: command contains the full produce path or basename
 * 2. Blanket: `tsc --noEmit` (no file args) covers all .ts produces
 * 3. Test-file mapping: `vitest run test/foo-bar.test.ts` covers `src/.../foo-bar.ts`
 *    (strip test/ prefix, .test.ts suffix, match against produce basename sans extension)
 */
function isReferencedByShell(produce: string, shellCommands: string[]): boolean {
  const basename = produce.split('/').pop() ?? produce;
  const stemNoExt = basename.replace(/\.[^.]+$/, '');

  for (const cmd of shellCommands) {
    // Strategy 1: direct path or basename match
    if (cmd.includes(produce) || cmd.includes(basename)) return true;

    // Strategy 2: blanket tsc --noEmit (no specific file) covers all .ts
    if (/tsc\s+--noEmit\s*$/.test(cmd) && produce.endsWith('.ts')) return true;

    // Strategy 3: test file basename → produce basename mapping
    // e.g. "vitest run test/terminal-audit-computed.test.ts" → stem "terminal-audit-computed"
    //       produce "src/lib/terminal-audit/computed.ts" → stem "computed"
    for (const token of cmd.split(/\s+/)) {
      if (!token.includes('.test.')) continue;
      const testFile = token.split('/').pop() ?? '';
      const testStem = testFile.replace(/\.test\.\w+$/, '');
      // Match if produce stem is a suffix of the test stem (e.g. "computed" in "terminal-audit-computed")
      if (testStem.endsWith(stemNoExt) || testStem === stemNoExt) return true;
    }
  }

  return false;
}
