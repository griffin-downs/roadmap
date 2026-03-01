// @module config/system-prompt
// @exports parseEnvironment, checkStaleness, fillTemplate, DEFAULT_TEMPLATE
// @types EnvironmentSections
// @entry roadmap

import type { ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';
import { readEvaluations } from '../intent/intent-evaluator.ts';

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
export const DEFAULT_TEMPLATE = `# {{task_definition}}

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
    if (rule.type === 'shell') cmds.push('argv' in rule ? rule.argv.join(' ') : Array.isArray(rule.command) ? rule.command.join(' ') : rule.command);
    if (rule.type === 'build-produces') cmds.push(rule.command);
    if (rule.type === 'launch-check') cmds.push(rule.command);
  }
  return cmds;
}

function buildVerificationChecklist(validate: readonly ValidationRule[]): string {
  if (validate.length === 0) return '- [ ] No explicit validation rules defined';
  return validate.map(rule => {
    switch (rule.type) {
      case 'shell': return `- [ ] \`${'argv' in rule ? rule.argv.join(' ') : rule.command}\``;
      case 'build-produces': return `- [ ] \`${rule.command}\` produces ${rule.outputs.join(', ')}`;
      case 'launch-check': return `- [ ] \`${rule.command}\` (launch check${rule.successSignal ? ` — signal: ${rule.successSignal}` : ''})`;
      case 'artifact-exists': return `- [ ] Artifact exists: \`${rule.target ?? rule.path}\``;
      case 'artifact-schema': return `- [ ] Schema valid: \`${rule.target}\``;
      case 'spec-conformance': return `- [ ] Spec conformance: ${rule.spec}`;
      case 'expanded': return `- [ ] DAG expanded with child nodes`;
      case 'intent': return `- [ ] Intent (${rule.evaluator}): "${rule.statement}"`;
      case 'runtime-explore': return `- [ ] Runtime explore: \`${rule.script}\` (${rule.observations.length} observation(s))`;
      default: return `- [ ] ${(rule as any).type}`;
    }
  }).join('\n');
}

// Build intent self-check subsection from validate rules, enriched with last failure from history.
function buildIntentSelfCheck(
  validate: readonly ValidationRule[],
  nodeId: string,
  repoRoot: string,
): string {
  const intentRules = validate.filter(r => r.type === 'intent');
  if (intentRules.length === 0) return '';

  const history = readEvaluations(nodeId, repoRoot);
  const lines: string[] = [];

  for (const rule of intentRules) {
    if (rule.type !== 'intent') continue;
    lines.push(`- [ ] "${rule.statement}" (threshold: ${rule.confidence}, evaluator: ${rule.evaluator})`);

    const lastFailure = history.filter(r => r.statement === rule.statement && !r.pass).at(-1);
    if (lastFailure) {
      lines.push(`      Known failure mode: ${lastFailure.reasoning}`);
      if (lastFailure.evidence.length > 0) {
        lines.push(`      Evidence: ${lastFailure.evidence.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}

export function fillTemplate(
  template: string,
  node: NodeSpec,
  domain: string,
  env: EnvironmentSections | null,
  repoRoot?: string,
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
  let verificationChecklist = buildVerificationChecklist(node.validate);

  // Append intent self-check subsection when repoRoot is available and intent rules exist
  if (repoRoot) {
    const intentSection = buildIntentSelfCheck(node.validate, node.id, repoRoot);
    if (intentSection) {
      verificationChecklist += '\n\n### Intent (self-check — evaluated after submit)\n\n' + intentSection;
    }
  }

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
