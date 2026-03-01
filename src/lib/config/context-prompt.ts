// @module config/context-prompt
// @exports compilePrompts, validateCompiledPrompts
// @types CompiledPrompt, CompileResult, ValidationViolation, CompilePromptsOpts
// @entry roadmap

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';
import type { ClusterResult } from '../utils/cluster/cluster.ts';
import type { EnvironmentSections } from './system-prompt.ts';
import { parseEnvironment, checkStaleness, fillTemplate, DEFAULT_TEMPLATE } from './system-prompt.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompiledPrompt {
  node: string;
  path: string;
  domain: string;
  content: string;
}

export interface CompileResult {
  compiled: number;
  skipped: number;
  outputDir: string;
  prompts: Array<{ node: string; path: string; domain: string }>;
}

export interface ValidationViolation {
  type: 'missing-produces' | 'missing-consumes' | 'missing-validate' | 'empty-domain' | 'ownership-conflict';
  node: string;
  detail: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateCompiledPrompts(prompts: CompiledPrompt[], dag: Graph<string>): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const ownershipMap = new Map<string, string>(); // artifact path → node id

  for (const p of prompts) {
    const node = (dag.nodes as Record<string, any>)[p.node];
    if (!node) continue;

    const consumeArtifacts = (node.consumes ?? []).map(consumeArtifact);
    const ambientFiles = node.ambient ?? [];
    const readableFiles = new Set([...consumeArtifacts, ...ambientFiles]);

    // Every produces path must appear in "Allowed to modify"
    for (const art of node.produces ?? []) {
      if (!p.content.includes(`\`${art}\``)) {
        violations.push({ type: 'missing-produces', node: p.node, detail: `produces ${art} not in "Allowed to modify"` });
      }
    }

    // Every consumes path must appear in "Files to read" or "Read-only"
    for (const art of consumeArtifacts) {
      if (!p.content.includes(`\`${art}\``)) {
        violations.push({ type: 'missing-consumes', node: p.node, detail: `consumes ${art} not in "Files to read"` });
      }
    }

    // Every shell validate command must appear in "Verification"
    for (const rule of node.validate ?? []) {
      if (rule.type === 'shell') {
        const shellLabel = 'argv' in rule ? rule.argv.join(' ') : String(rule.command);
        if (!p.content.includes(shellLabel)) {
          violations.push({ type: 'missing-validate', node: p.node, detail: `validate shell command missing: ${shellLabel}` });
        }
      }
    }

    // Domain field must be non-empty
    if (!p.domain) {
      violations.push({ type: 'empty-domain', node: p.node, detail: 'domain field is empty' });
    }

    // Exclusive ownership: no two prompts share a produces path
    for (const art of node.produces ?? []) {
      if (ownershipMap.has(art)) {
        violations.push({ type: 'ownership-conflict', node: p.node, detail: `${art} also claimed by ${ownershipMap.get(art)}` });
      } else {
        ownershipMap.set(art, p.node);
      }
    }
  }

  return violations;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface CompilePromptsOpts {
  envSource?: string;           // contents of environment.md
  templateSource?: string;      // contents of prompt-template.md (default: built-in)
  out?: string;                 // output directory (default: 'prompts')
  nodes?: string[];             // specific nodes to compile (default: all non-structural)
  batchLevel?: number;          // compile only nodes at this batch level
  validateOnly?: boolean;       // validate without writing
  clusterResult?: ClusterResult; // pre-computed clusters for domain assignment
  currentCommit?: string;       // for staleness detection
  repoRoot?: string;            // repo root for reading intent evaluation history
}

export function compilePrompts(
  dag: Graph<string>,
  opts: CompilePromptsOpts = {},
): { result: CompileResult; prompts: CompiledPrompt[]; violations: ValidationViolation[]; stale: boolean } {
  const template = opts.templateSource ?? DEFAULT_TEMPLATE;
  const env = opts.envSource ? parseEnvironment(opts.envSource) : null;
  const outputDir = opts.out ?? 'prompts';

  const stale = !!(env && opts.currentCommit && checkStaleness(env, opts.currentCommit));

  // Resolve domain for a node via cluster membership, fallback to id prefix
  function resolveDomain(nodeId: string): string {
    if (opts.clusterResult) {
      const cluster = opts.clusterResult.clusters.find(c => c.nodes.includes(nodeId));
      if (cluster) return cluster.id;
    }
    // Fallback: first segment of node ID
    return nodeId.split('-')[0];
  }

  // Determine target nodes
  const allNodeIds = Object.keys(dag.nodes).filter(id => id !== dag.init && id !== dag.term);
  let targetIds: string[];
  let skipped = 0;
  if (opts.nodes) {
    targetIds = opts.nodes.filter(id => allNodeIds.includes(id));
    skipped += opts.nodes.length - targetIds.length; // nodes not found in dag
  } else {
    targetIds = allNodeIds;
  }

  const prompts: CompiledPrompt[] = [];

  for (const nodeId of targetIds) {
    const node = (dag.nodes as Record<string, any>)[nodeId];
    if (!node) { skipped++; continue; }

    const domain = resolveDomain(nodeId);
    const content = fillTemplate(template, node, domain, env, opts.repoRoot);
    const path = `${outputDir}/prompt-${nodeId}.md`;

    prompts.push({ node: nodeId, path, domain, content });
  }

  const violations = validateCompiledPrompts(prompts, dag);

  const result: CompileResult = {
    compiled: prompts.length,
    skipped,
    outputDir,
    prompts: prompts.map(({ node, path, domain }) => ({ node, path, domain })),
  };

  return { result, prompts, violations, stale };
}
