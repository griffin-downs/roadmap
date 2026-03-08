// @module terminal-audit/detected
// @description Mechanically detect audit gaps — uncovered consumes, untested produces
// @exports DetectedGap, GapType, DetectionResult, detectGaps

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

// --- Types ---

export type GapType = 'uncovered-consume' | 'untested-produce';

export interface DetectedGap {
  type: GapType;
  nodeId: string;
  artifact: string;
  detail: string;
}

export interface DetectionResult {
  gaps: DetectedGap[];
  summary: { uncoveredConsumes: number; untestedProduces: number; total: number };
}

// --- Implementation ---

/**
 * Detect gaps mechanically from DAG structure + filesystem state.
 *
 * Two detection passes:
 * 1. uncovered-consume: consumes[] entries not covered by any artifact-exists or shell validator
 *    across the DAG (i.e., no node validates that the consumed artifact actually exists)
 * 2. untested-produce: produce files not referenced in any shell validator command
 *
 * @param dag - The graph being audited
 */
export function detectGaps(
  dag: Graph<string>,
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

  // Pass 2: Untested produces — produce files not referenced in any shell command
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
  const untestedProduces = gaps.filter(g => g.type === 'untested-produce').length;

  return {
    gaps,
    summary: {
      uncoveredConsumes,
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
