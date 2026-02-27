// @module compile-prompts
// @exports compilePrompts, parseEnvironment, fillTemplate, validateCompiledPrompts
// @types EnvironmentSections, CompiledPrompt, CompileResult, ValidationViolation
// @entry roadmap

import type { Graph, ValidationRule } from '../protocol.ts';
import { consumeArtifact } from '../protocol.ts';
import type { ClusterResult } from './cluster.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnvironmentSections {
  projectIdentity?: string;       // §1 Project Identity & Constraints
  executionReality?: string;      // §2 Execution Reality
  invariants?: string;            // §3/§4 Architectural Invariants
  stateAuthorityMap?: string;     // §5 State Authority Map
  domainMap?: string;             // §6/§6a Domain Map
  coreEntities?: string;          // §6b Core Entities
  testHarness?: string;           // §7 Test Harness
  highEntropyZones?: string;      // §8 High-Entropy Zones
  semanticBindings?: string;      // §9 Semantic Bindings
  commit?: string;                // staleness field
  dateVerified?: string;          // staleness field
  raw: Record<string, string>;    // all sections by heading text
}

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

// ── Environment parser ────────────────────────────────────────────────────────

// Parse environment.md into sections keyed by heading text (lowercased, trimmed).
// Also maps well-known section numbers to typed fields.
export function parseEnvironment(source: string): EnvironmentSections {
  const raw: Record<string, string> = {};

  // Split on ## headings; capture heading text and body
  const parts = source.split(/^##\s+/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    if (newline === -1) continue;
    const heading = part.slice(0, newline).trim();
    const body = part.slice(newline + 1).trim();
    raw[heading.toLowerCase()] = body;
  }

  // Extract staleness fields from the first block (before any ## heading)
  const preamble = parts[0] ?? '';
  const commitMatch = preamble.match(/^commit:\s*(.+)$/im);
  const dateMatch = preamble.match(/^date verified:\s*(.+)$/im);

  // Map common section patterns to typed fields
  function findSection(...patterns: string[]): string | undefined {
    for (const [key, value] of Object.entries(raw)) {
      for (const p of patterns) {
        if (key.includes(p.toLowerCase())) return value;
      }
    }
    return undefined;
  }

  return {
    projectIdentity: findSection('project identity', '1.', 'identity'),
    executionReality: findSection('execution reality', '2.', 'execution'),
    invariants: findSection('architectural invariant', '3.', '4.', 'invariant'),
    stateAuthorityMap: findSection('state authority', '5.', 'authority'),
    domainMap: findSection('domain map', '6a', '6.', 'domain map'),
    coreEntities: findSection('core entit', '6b', 'entities'),
    testHarness: findSection('test harness', '7.', 'harness'),
    highEntropyZones: findSection('high-entropy', 'high entropy', '8.', 'entropy'),
    semanticBindings: findSection('semantic binding', '9.', 'semantic'),
    commit: commitMatch?.[1]?.trim(),
    dateVerified: dateMatch?.[1]?.trim(),
    raw,
  };
}

// ── Staleness check ───────────────────────────────────────────────────────────

export function checkStaleness(env: EnvironmentSections, currentCommit: string): boolean {
  if (!env.commit) return false; // no commit field → can't detect staleness
  return env.commit !== currentCommit;
}

// ── Template filler ───────────────────────────────────────────────────────────

// Default built-in template (matches prompts/prompt-template.md)
const DEFAULT_TEMPLATE = `# {{task_definition}}

## Context

**Domain**: {{domain}}

**Files to read**:
{{files_list}}

**Constraints**:
{{constraints}}

**Entities**:
{{entities}}

**Quick check**: \`{{quick_check}}\`

## Scope Boundaries

**Allowed to modify** (produces):
{{allowed_to_modify}}

**Read-only** (consumes + ambient):
{{read_only}}

**Forbidden**: any file not listed above. Single-domain rule: do not touch files outside the {{domain}} domain.

## Required Artifacts

{{required_artifacts}}

## Verification

{{verification_checklist}}

## Failure Handling

STOP if blocked. Output one blocking question. Do not guess, do not expand scope, do not modify adjacent code.

## Executor Instructions

Execute-only mode. Produce exactly the artifacts listed above. Do not:
- Refactor adjacent code
- Add features beyond what the artifacts require
- Expand scope beyond this node's domain
- Read files not listed in Context

Verify with: \`{{quick_check}}\`
`;

interface NodeSpec {
  id: string;
  desc: string;
  produces: readonly string[];
  consumes: readonly any[];
  ambient?: readonly string[];
  validate: readonly ValidationRule[];
}

function resolveValidateShellCommands(validate: readonly ValidationRule[]): string[] {
  const cmds: string[] = [];
  for (const rule of validate) {
    if (rule.type === 'shell') cmds.push(rule.command);
    if (rule.type === 'build-produces') cmds.push(rule.command);
    if (rule.type === 'launch-check') cmds.push(rule.command);
  }
  return cmds;
}

function buildVerificationChecklist(validate: readonly ValidationRule[]): string {
  if (validate.length === 0) return '- [ ] No explicit validation rules defined';
  return validate.map(rule => {
    switch (rule.type) {
      case 'shell': return `- [ ] \`${rule.command}\``;
      case 'build-produces': return `- [ ] \`${rule.command}\` produces ${rule.outputs.join(', ')}`;
      case 'launch-check': return `- [ ] \`${rule.command}\` (launch check${rule.successSignal ? ` — signal: ${rule.successSignal}` : ''})`;
      case 'artifact-exists': return `- [ ] Artifact exists: \`${rule.target}\``;
      case 'artifact-schema': return `- [ ] Schema valid: \`${rule.target}\``;
      case 'spec-conformance': return `- [ ] Spec conformance: ${rule.spec}`;
      case 'expanded': return `- [ ] DAG expanded with child nodes`;
      case 'intent': return `- [ ] Intent (${rule.evaluator}): "${rule.statement}"`;
      default: return `- [ ] ${(rule as any).type}`;
    }
  }).join('\n');
}

export function fillTemplate(
  template: string,
  node: NodeSpec,
  domain: string,
  env: EnvironmentSections | null,
): string {
  const consumeArtifacts = node.consumes.map(consumeArtifact);
  const ambientFiles = node.ambient ? [...node.ambient] : [];

  const filesAll = [...consumeArtifacts, ...ambientFiles];
  const filesList = filesAll.length > 0
    ? filesAll.map(f => `- \`${f}\``).join('\n')
    : '- (none)';

  const allowedToModify = node.produces.length > 0
    ? node.produces.map(f => `- \`${f}\``).join('\n')
    : '- (none)';

  const readOnly = filesAll.length > 0
    ? filesAll.map(f => `- \`${f}\` (read-only)`).join('\n')
    : '- (none)';

  const requiredArtifacts = node.produces.length > 0
    ? node.produces.map(f => `- \`${f}\``).join('\n')
    : '- (none)';

  const shellCmds = resolveValidateShellCommands(node.validate);
  const quickCheck = shellCmds[0] ?? 'tsc --noEmit';
  const verificationChecklist = buildVerificationChecklist(node.validate);

  // Domain-filtered constraints from environment
  let constraints = '(none)';
  if (env) {
    const parts: string[] = [];
    if (env.invariants) parts.push(env.invariants);
    if (env.highEntropyZones) parts.push(`**High-entropy zones**:\n${env.highEntropyZones}`);
    if (parts.length > 0) constraints = parts.join('\n\n');
  }

  // Entity references: environment core entities filtered by file overlap
  let entities = '(none)';
  if (env?.coreEntities) {
    entities = env.coreEntities;
  }

  const vars: Record<string, string> = {
    task_definition: node.desc,
    domain,
    files_list: filesList,
    constraints,
    entities,
    quick_check: quickCheck,
    allowed_to_modify: allowedToModify,
    read_only: readOnly,
    required_artifacts: requiredArtifacts,
    verification_checklist: verificationChecklist,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
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
      if (rule.type === 'shell' && !p.content.includes(rule.command)) {
        violations.push({ type: 'missing-validate', node: p.node, detail: `validate shell command missing: ${rule.command}` });
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
    const content = fillTemplate(template, node, domain, env);
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
