// @module propagate
// @exports propagateConstraints, PropagationResult
// @types PropagationResult
// @entry roadmap/protocol (via re-export)

import { order, consumeArtifact } from '../protocol.ts';
import type { Graph, ValidationRule, NodeSpec } from '../protocol.ts';

export interface PropagationResult {
  propagated: number;
  nodesAffected: number;
  constraints: Array<{
    node: string;
    added: number;
    from: string[];
  }>;
  dag?: Graph<string>;
}

// Deep clone a DAG with mutable validate arrays
function cloneDAG(g: Graph<string>): { id: string; desc: string; init: string; term: string; nodes: Record<string, NodeSpec<string, string> & { validate: ValidationRule[] }> } {
  const nodes: Record<string, any> = {};
  for (const [id, node] of Object.entries(g.nodes)) {
    nodes[id] = { ...node, validate: [...(node as any).validate] };
  }
  return { id: g.id, desc: g.desc, init: g.init, term: g.term, nodes };
}

// Check if equivalent rule already exists on a node
function hasEquivalent(existing: readonly ValidationRule[], candidate: ValidationRule): boolean {
  for (const r of existing) {
    if (r.type !== candidate.type) continue;
    switch (r.type) {
      case 'artifact-exists':
        if ((r.target ?? r.path) === ((candidate as any).target ?? (candidate as any).path)) return true;
        break;
      case 'artifact-schema':
        if ((candidate as any).target === r.target && (candidate as any).schema === (r as any).schema) return true;
        break;
      case 'build-produces':
        if ((candidate as any).command === r.command) return true;
        break;
      case 'shell':
        if ((candidate as any).command === r.command) return true;
        break;
      case 'launch-check':
        if ((candidate as any).command === r.command) return true;
        break;
    }
  }
  return false;
}

// Build artifact→producer index
function buildProducerIndex(g: Graph<string>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const node of Object.values(g.nodes) as NodeSpec<string, string>[]) {
    for (const artifact of node.produces) {
      idx.set(artifact, node.id);
    }
  }
  return idx;
}

// Build artifact→consumer[] index
function buildConsumerIndex(g: Graph<string>): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const node of Object.values(g.nodes) as NodeSpec<string, string>[]) {
    for (const c of node.consumes) {
      const artifact = consumeArtifact(c);
      const list = idx.get(artifact);
      if (list) list.push(node.id);
      else idx.set(artifact, [node.id]);
    }
  }
  return idx;
}

export function propagateConstraints<T extends string>(
  g: Graph<T>,
  opts?: { dryRun?: boolean; from?: string; depth?: number },
): PropagationResult {
  const dryRun = opts?.dryRun ?? false;
  const maxDepth = opts?.depth ?? Infinity;

  const producerIdx = buildProducerIndex(g as Graph<string>);
  const consumerIdx = buildConsumerIndex(g as Graph<string>);
  const clone = cloneDAG(g as Graph<string>);

  const topoOrder = order(g as Graph<string>);
  let reversed = [...topoOrder].reverse();

  // --from: start propagation from a specific node
  if (opts?.from) {
    const startIdx = reversed.indexOf(opts.from);
    if (startIdx === -1) return { propagated: 0, nodesAffected: 0, constraints: [] };
    reversed = reversed.slice(startIdx);
  }

  // Track additions per node: nodeId → Set<sourceNodeId>
  const additions = new Map<string, { count: number; sources: Set<string> }>();

  // Walk reverse topo: for each node, derive upstream constraints from its validate rules
  let hops = 0;
  for (const nodeId of reversed) {
    if (hops >= maxDepth) break;
    const node = (g.nodes as Record<string, NodeSpec<string, string>>)[nodeId];
    if (!node) continue;

    const derived: Array<{ target: string; rule: ValidationRule }> = [];

    for (const rule of node.validate) {
      switch (rule.type) {
        case 'build-produces': {
          // Build command produces outputs — find what it consumes (cross-ref graph consumes)
          // Derive artifact-exists for each artifact this node consumes (build inputs)
          for (const c of node.consumes) {
            const artifact = consumeArtifact(c);
            const producer = producerIdx.get(artifact);
            if (!producer) continue;
            derived.push({
              target: producer,
              rule: { type: 'artifact-exists', target: artifact, _propagatedFrom: nodeId },
            });
          }
          // Also derive artifact-exists for each build output on this node itself
          for (const output of rule.outputs) {
            const consumers = consumerIdx.get(output) ?? [];
            for (const consumerId of consumers) {
              derived.push({
                target: nodeId,
                rule: { type: 'artifact-exists', target: output, _propagatedFrom: consumerId },
              });
            }
          }
          break;
        }

        case 'launch-check': {
          // Launch command runs something — derive artifact-exists on artifacts this node consumes
          for (const c of node.consumes) {
            const artifact = consumeArtifact(c);
            const producer = producerIdx.get(artifact);
            if (!producer) continue;
            derived.push({
              target: producer,
              rule: { type: 'artifact-exists', target: artifact, _propagatedFrom: nodeId },
            });
          }
          break;
        }

        case 'shell': {
          // Shell command may reference artifacts — check if consumed artifacts exist
          for (const c of node.consumes) {
            const artifact = consumeArtifact(c);
            const producer = producerIdx.get(artifact);
            if (!producer) continue;
            // If the shell command string mentions the artifact, derive constraint
            if (rule.command.includes(artifact)) {
              derived.push({
                target: producer,
                rule: { type: 'artifact-exists', target: artifact, _propagatedFrom: nodeId },
              });
            }
          }
          break;
        }

        // spec-conformance: no auto-derivation (stories→properties requires LLM)
      }
    }

    // Apply derived constraints (deduplicated)
    for (const { target, rule } of derived) {
      const targetNode = clone.nodes[target];
      if (!targetNode) continue;
      if (hasEquivalent(targetNode.validate, rule)) continue;

      targetNode.validate.push(rule);
      const entry = additions.get(target) ?? { count: 0, sources: new Set<string>() };
      entry.count++;
      entry.sources.add(nodeId);
      additions.set(target, entry);
    }

    if (derived.length > 0) hops++;
  }

  const totalPropagated = [...additions.values()].reduce((s, e) => s + e.count, 0);
  const constraintsArr = [...additions.entries()].map(([node, { count, sources }]) => ({
    node,
    added: count,
    from: [...sources],
  }));

  const result: PropagationResult = {
    propagated: totalPropagated,
    nodesAffected: additions.size,
    constraints: constraintsArr,
  };

  if (!dryRun) {
    result.dag = clone as unknown as Graph<string>;
  }

  return result;
}
