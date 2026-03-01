// @module validate-terminal-gate-spec
// @exports validateTerminalSpecWiring, TerminalSpecWiringError, TerminalSpecValidation
// @entry roadmap

import type { Graph, ConsumeSpec } from '../protocol.ts';
import { consumeArtifact } from '../protocol.ts';
import { findTerminalNodes } from './validate-dag.ts';
import type { SpecClarifiedJson } from './intake/spec-verifier.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TerminalSpecWiringError {
  type: 'terminal-missing-spec-consume' | 'spec-not-produced' | 'spec-invalid';
  node: string;
  message: string;
  fix: string;
}

export interface TerminalSpecValidation {
  passed: boolean;
  terminalNodes: string[];
  specPath: string;
  errors: TerminalSpecWiringError[];
}

// ── Core ──────────────────────────────────────────────────────────────────────

const DEFAULT_SPEC_PATH = 'spec-clarified.json';

/**
 * Validate that the terminal gate is wired to consume spec-clarified.json.
 *
 * Checks:
 * 1. At least one terminal node consumes spec-clarified.json (or specPath)
 * 2. Some node in the DAG produces spec-clarified.json
 * 3. If a SpecClarifiedJson is provided, it has at least one feature
 *
 * This enforces the spec-threading invariant: terminal gate validation is
 * informed by the contract generated at init gate. Propagate auto-derives
 * the dependency — this function verifies the wiring is correct.
 */
export function validateTerminalSpecWiring<T extends string>(
  g: Graph<T>,
  spec?: SpecClarifiedJson,
  specPath: string = DEFAULT_SPEC_PATH,
): TerminalSpecValidation {
  const terminals = findTerminalNodes(g);
  const errors: TerminalSpecWiringError[] = [];
  const nodes = Object.values(g.nodes) as Array<{
    id: string;
    produces: readonly string[];
    consumes: readonly ConsumeSpec[];
  }>;

  // Check 1: terminal consumes spec
  const terminalConsumesSpec = terminals.some(termId => {
    const node = nodes.find(n => n.id === termId);
    if (!node) return false;
    return node.consumes.some(c => consumeArtifact(c) === specPath);
  });

  if (!terminalConsumesSpec) {
    const termList = terminals.join(', ');
    errors.push({
      type: 'terminal-missing-spec-consume',
      node: terminals[0] ?? 'unknown',
      message: `No terminal node (${termList}) consumes '${specPath}'`,
      fix: `Add '${specPath}' to a terminal node's consumes[], or run 'roadmap propagate' to derive it`,
    });
  }

  // Check 2: spec is produced by some node
  const specProduced = nodes.some(n => n.produces.includes(specPath));
  if (!specProduced) {
    errors.push({
      type: 'spec-not-produced',
      node: 'none',
      message: `No node produces '${specPath}' — init gate contract missing from DAG`,
      fix: `Add '${specPath}' to the init-gate node's produces[] array`,
    });
  }

  // Check 3: spec content validity (if provided)
  if (spec && (!spec.features || spec.features.length === 0)) {
    errors.push({
      type: 'spec-invalid',
      node: terminals[0] ?? 'unknown',
      message: `${specPath} has no features — contract is empty`,
      fix: 'Regenerate spec-clarified.json from clarity gaps (generateClarifiedSpec)',
    });
  }

  return {
    passed: errors.length === 0,
    terminalNodes: terminals,
    specPath,
    errors,
  };
}
