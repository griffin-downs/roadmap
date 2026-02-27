// @module validate-plan-clarity
// @exports validatePlanClarity, PlanClarityGap
// @entry roadmap

import type { Graph, ConsumeSpec } from '../protocol.ts';
import { consumeArtifact } from '../protocol.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanClarityGap {
  type: 'VagueProduces' | 'UnresolvableConsumes' | 'NoValidate' | 'OwnershipConflict' | 'BroadScope';
  node: string;
  detail: string;
}

export interface PlanClarityResult {
  passed: boolean;
  confidence: number;
  evidence: string[];
  gaps: PlanClarityGap[];
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Validate plan clarity for init intent gate.
 *
 * Checks (in order):
 * 1. Every node has produces[] with concrete file paths (not placeholders, not "database")
 * 2. Every node's consumes[] references files produced by predecessor nodes
 * 3. Every node has at least one validate rule (not empty array)
 * 4. No two nodes produce the same file (ownership conflict)
 * 5. Node description fits one concern (heuristic: no "and"/"also", < 15 words)
 *
 * Confidence calculation:
 * - Passed all 5 checks: 0.95
 * - 1 gap: 0.80
 * - 2 gaps: 0.60
 * - 3+ gaps: 0.30
 */
export async function validatePlanClarity<T extends string>(
  graph: Graph<T>,
  nodeId: string,
): Promise<PlanClarityResult> {
  const gaps: PlanClarityGap[] = [];
  const evidence: string[] = [];

  const nodes = Object.values(graph.nodes) as Array<{
    id: string;
    desc: string;
    produces: readonly string[];
    consumes: readonly ConsumeSpec[];
    deps: readonly string[];
    validate: readonly any[];
  }>;

  const ids = new Set(nodes.map(n => n.id));

  // Build producer map: artifact → node that produces it
  const producerMap = new Map<string, string>();
  const allProduces = new Map<string, string[]>(); // node → its produces

  for (const node of nodes) {
    allProduces.set(node.id, [...node.produces]);
    for (const artifact of node.produces) {
      if (producerMap.has(artifact)) {
        // Check 4: Ownership conflict
        gaps.push({
          type: 'OwnershipConflict',
          node: node.id,
          detail: `produces: '${artifact}' but also produced by '${producerMap.get(artifact)}'`,
        });
      } else {
        producerMap.set(artifact, node.id);
      }
    }
  }

  if (gaps.length === 0) {
    evidence.push('✓ No ownership conflicts: each artifact produced by exactly one node');
  }

  // Build predecessor map for each node
  const predecessorMap = new Map<string, Set<string>>();
  for (const node of nodes) {
    const preds = new Set<string>();
    const q = [...node.deps];
    while (q.length) {
      const dep = q.shift()!;
      if (preds.has(dep)) continue;
      preds.add(dep);
      const depNode = nodes.find(n => n.id === dep);
      if (depNode) {
        for (const d of depNode.deps) {
          if (!preds.has(d)) q.push(d);
        }
      }
    }
    predecessorMap.set(node.id, preds);
  }

  // Validate each node
  for (const node of nodes) {
    // Check 1: Vague produces
    if (node.produces.length === 0) {
      gaps.push({
        type: 'VagueProduces',
        node: node.id,
        detail: 'produces: [] — no artifacts defined',
      });
    } else {
      const vagueProduces = node.produces.filter(p => {
        const lower = p.toLowerCase();
        // Check for placeholders and overly generic terms
        return (
          lower === 'database' ||
          lower === 'config' ||
          lower === 'output' ||
          lower === 'result' ||
          lower === 'data' ||
          lower.includes('<') ||
          lower.includes('>') ||
          lower.includes('[') ||
          lower.includes(']')
        );
      });

      if (vagueProduces.length > 0) {
        gaps.push({
          type: 'VagueProduces',
          node: node.id,
          detail: `produces: [${vagueProduces.map(p => `'${p}'`).join(', ')}] — not concrete file paths`,
        });
      }
    }

    // Check 2: Unresolvable consumes
    const preds = predecessorMap.get(node.id) || new Set();
    const availableArtifacts = new Set<string>();
    for (const predId of preds) {
      const produces = allProduces.get(predId) || [];
      for (const artifact of produces) {
        availableArtifacts.add(artifact);
      }
    }

    for (const consume of node.consumes) {
      const artifact = consumeArtifact(consume);
      const resolver = typeof consume === 'string' ? undefined : (consume as any).resolvedBy;

      // If artifact is unresolved and has a resolver, check if resolver exists in graph
      if (resolver && !ids.has(resolver)) {
        gaps.push({
          type: 'UnresolvableConsumes',
          node: node.id,
          detail: `consumes: '${artifact}' resolvedBy '${resolver}' but resolver node not in graph`,
        });
      } else if (!resolver && !availableArtifacts.has(artifact)) {
        gaps.push({
          type: 'UnresolvableConsumes',
          node: node.id,
          detail: `consumes: '${artifact}' but no predecessor produces it`,
        });
      }
    }

    // Check 3: No validate rules
    if (node.validate.length === 0) {
      gaps.push({
        type: 'NoValidate',
        node: node.id,
        detail: 'validate: [] — no acceptance criteria defined',
      });
    }

    // Check 5: Broad scope (overly long description with conjunctions)
    const words = node.desc.split(/\s+/).length;
    const hasConjunctions = /\band\b|\balso\b|\bplus\b|\bas well as\b/i.test(node.desc);
    if (words > 15 && hasConjunctions) {
      gaps.push({
        type: 'BroadScope',
        node: node.id,
        detail: `desc: "${node.desc}" — ${words} words with conjunctions; should focus on one concern`,
      });
    }
  }

  // Calculate confidence
  let confidence = 0.95; // base: all passed
  if (gaps.length === 1) {
    confidence = 0.80;
  } else if (gaps.length === 2) {
    confidence = 0.60;
  } else if (gaps.length >= 3) {
    confidence = 0.30;
  }

  // Build evidence strings
  if (gaps.length === 0) {
    evidence.push('✓ All nodes have concrete produces[]');
    evidence.push('✓ All consumes[] resolved by predecessors');
    evidence.push('✓ All nodes have validate rules');
    evidence.push('✓ No ownership conflicts');
    evidence.push('✓ All node descriptions focused (< 15 words or no conjunctions)');
  } else {
    for (const gap of gaps) {
      evidence.push(`✗ ${gap.type}: ${gap.node} — ${gap.detail}`);
    }
  }

  return {
    passed: gaps.length === 0,
    confidence,
    evidence,
    gaps,
  };
}
