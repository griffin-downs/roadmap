// @module compile-brief
// @exports compileBrief
// @types CompiledBrief, EnvironmentContext, FileOwnership

import type { Graph, NodeSpec, ValidationRule, ConsumeSpec } from '../protocol.ts';

export interface FileOwnership {
  file: string;
  ownerNode: string;
  consumes?: string[];
  notes?: string;
}

export interface EnvironmentContext {
  projectName?: string;
  techStack?: Record<string, string>;
  architecture?: string;
  fileOwnershipMap?: FileOwnership[];
  typeContract?: string;
  securityConstraints?: string[];
  testStrategy?: string;
  sortOrder?: string;
  themePersistence?: string;
}

export interface CompiledBrief {
  nodeId: string;
  title: string;
  assignment: string;
  whatYouProduce: string[];
  whatYouConsume: string[];
  architectureContext: string;
  typeContract: string;
  securityConstraints: string[];
  successCriteria: string[];
  nextBlockers: string[];
  validationRules: ValidationRule[];
  allNodes: string;
  markdown: string;
}

/**
 * Parse environment.md for context data.
 * Extracts: project name, tech stack, architecture, file ownership map, type contracts, security, test strategy.
 */
function parseEnvironmentMd(source: string): EnvironmentContext {
  const context: EnvironmentContext = {};

  // Extract project name from first heading
  const nameMatch = source.match(/^#\s+(.+)$/m);
  if (nameMatch) context.projectName = nameMatch[1];

  // Extract tech stack table
  const techMatch = source.match(/## Tech stack([\s\S]*?)(?=\n## |$)/);
  if (techMatch) {
    const techLines = techMatch[1].split('\n');
    context.techStack = {};
    for (const line of techLines) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        context.techStack[cells[0]] = cells[1];
      }
    }
  }

  // Extract architecture section
  const archMatch = source.match(/## Architecture([\s\S]*?)(?=\n## |$)/);
  if (archMatch) context.architecture = archMatch[1].trim();

  // Extract file ownership map
  const ownershipMatch = source.match(/## File ownership map([\s\S]*?)(?=\n## |$)/);
  if (ownershipMatch) {
    const ownershipLines = ownershipMatch[1].split('\n');
    context.fileOwnershipMap = [];
    let inTable = false;
    for (const line of ownershipLines) {
      if (line.includes('|')) {
        if (line.includes('---')) {
          inTable = true;
          continue;
        }
        if (inTable && line.includes('`')) {
          const cells = line.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 3) {
            // Remove backticks from file path
            const file = cells[0].replace(/`/g, '');
            const ownerNode = cells[1];
            const consumes = cells[2].length > 1 ? [cells[2].replace(/`/g, '')] : [];
            const notes = cells[3] ?? '';
            context.fileOwnershipMap.push({ file, ownerNode, consumes: consumes.length > 0 ? consumes : undefined, notes });
          }
        }
      }
    }
  }

  // Extract shared type contract
  const typeMatch = source.match(/## Shared type contract.*?\n```typescript([\s\S]*?)```/);
  if (typeMatch) context.typeContract = typeMatch[1].trim();

  // Extract security constraints
  const secMatch = source.match(/## Security constraints([\s\S]*?)(?=\n## |$)/);
  if (secMatch) {
    context.securityConstraints = [];
    const lines = secMatch[1].split('\n');
    for (const line of lines) {
      if (line.startsWith('-')) {
        context.securityConstraints.push(line.slice(1).trim());
      }
    }
  }

  // Extract test strategy
  const testMatch = source.match(/## Test strategy([\s\S]*?)(?=\n## |$)/);
  if (testMatch) context.testStrategy = testMatch[1].trim();

  // Extract sort order
  const sortMatch = source.match(/## Sort order\n\n(.+)/);
  if (sortMatch) context.sortOrder = sortMatch[1];

  // Extract theme persistence
  const themeMatch = source.match(/## Theme persistence\n\n([\s\S]*?)(?=\n##|$)/);
  if (themeMatch) context.themePersistence = themeMatch[1].trim();

  return context;
}

/**
 * Build file ownership map for a specific node's produces and consumes.
 */
function buildOwnershipContext(
  nodeId: string,
  produces: string[],
  consumes: string[],
  env: EnvironmentContext,
): { produces: string[]; consumes: string[] } {
  // Keep produces/consumes as-is; ownership map is reference context
  return { produces, consumes };
}

/**
 * Format validation rules as human-readable success criteria.
 */
function formatSuccessCriteria(validate: ValidationRule[]): string[] {
  const criteria: string[] = [];

  for (const rule of validate) {
    if (typeof rule === 'object' && rule.type) {
      switch (rule.type) {
        case 'artifact-exists':
          const artifactTarget = ('path' in rule && rule.path) || ('target' in rule && (rule as any).target);
          if (artifactTarget) {
            criteria.push(`Artifact exists: ${artifactTarget}`);
          }
          break;
        case 'shell':
          const shellCmd = ('argv' in rule && rule.argv.join(' ')) || ('cmd' in rule && rule.cmd) || ('command' in rule && (rule as any).command);
          if (shellCmd) {
            const desc = (rule as any).description ? ` — ${(rule as any).description}` : '';
            criteria.push(`Command passes: ${shellCmd}${desc}`);
          }
          break;
        case 'build-produces':
          const buildPath = ('path' in rule && rule.path) || ('target' in rule && (rule as any).target);
          if (buildPath) {
            criteria.push(`Build produces: ${buildPath}`);
          }
          break;
        case 'launch-check':
          criteria.push('App launches and all features present');
          break;
        case 'spec-conformance':
          const scenario = ('scenario' in rule && (rule as any).scenario);
          if (scenario) {
            const section = (rule as any).section ? ` in ${(rule as any).section}` : '';
            criteria.push(`Spec scenario passes: ${scenario}${section}`);
          }
          break;
        case 'intent':
          const statement = (rule as any).statement;
          if (statement) {
            const confidence = (rule as any).confidence ?? 0;
            const confidenceStr = confidence > 0 ? ` (confidence: ${Math.round(confidence * 100)}%)` : '';
            criteria.push(`Intent validation: ${statement}${confidenceStr}`);
          }
          break;
        case 'expanded':
          const minNodes = (rule as any).minNodes ?? 1;
          criteria.push(`Expand to ≥${minNodes} child node(s)`);
          break;
      }
    }
  }

  return criteria.length > 0 ? criteria : ['Complete the work and all artifacts pass validation'];
}

/**
 * Deep freeze an object to ensure immutability.
 * Recursively freezes all nested objects and arrays.
 */
function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);

  if (obj !== null && typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (
          value !== null &&
          (typeof value === 'object' || typeof value === 'function') &&
          !Object.isFrozen(value)
        ) {
          deepFreeze(value);
        }
      }
    }
  }

  return obj;
}

/**
 * Compile a human-readable brief for an agent from node spec + environment.
 * Returns a sealed, frozen brief that prevents any mutations by agents.
 */
export function compileBrief(
  dag: Graph<string>,
  nodeId: string,
  envSource?: string,
): CompiledBrief {
  const nodes = dag.nodes as Record<string, any>;
  const node = nodes[nodeId];

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Parse environment context
  const env = envSource ? parseEnvironmentMd(envSource) : {};

  // Build ownership context
  const consumes = (node.consumes ?? []).map((c: ConsumeSpec | string) =>
    typeof c === 'string' ? c : c.artifact,
  );
  const produces = node.produces ?? [];

  const ownershipContext = buildOwnershipContext(nodeId, produces, consumes, env);

  // Find what blocks this node and what this node blocks
  const blockers = Object.values(nodes)
    .filter((n: any) => n.deps?.includes(nodeId))
    .slice(0, 5)
    .map((n: any) => n.id);

  // Format architecture context from environment
  const archContext = env.architecture ? env.architecture.split('\n').slice(0, 8).join('\n') : 'See environment.md';

  // Type contract from environment
  const typeContractStr = env.typeContract ? env.typeContract.split('\n').slice(0, 10).join('\n') : '';

  // Security constraints
  const securityConstraints = env.securityConstraints ?? [];

  // Success criteria from validation rules
  const successCriteria = formatSuccessCriteria((node.validate ?? []) as ValidationRule[]);

  // All node IDs (for reference)
  const allNodes = Object.keys(nodes).join(', ');

  // Build markdown brief
  const lines: string[] = [];
  lines.push(`# Agent Brief: ${nodeId}`);
  lines.push('');
  lines.push(`## Your Assignment`);
  lines.push(`Node ID: ${nodeId}`);
  lines.push(`Description: ${node.desc}`);
  lines.push('');

  lines.push(`## What You Produce`);
  if (produces.length > 0) {
    for (const file of produces) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push('(none — foundational node)');
  }
  lines.push('');

  lines.push(`## What You Consume`);
  if (consumes.length > 0) {
    for (const file of consumes) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push('(none)');
  }
  lines.push('');

  if (node.deps && node.deps.length > 0) {
    lines.push(`## Your Dependencies`);
    for (const dep of node.deps as string[]) {
      const depNode = nodes[dep];
      lines.push(`- ${dep}: ${depNode?.desc ?? '(unknown)'}`);
    }
    lines.push('');
  }

  lines.push(`## Architecture Context`);
  if (archContext && archContext !== 'See environment.md') {
    lines.push('```');
    lines.push(archContext.slice(0, 500));
    lines.push('```');
  } else {
    lines.push('[See environment.md for full architecture diagram and data flow]');
  }
  lines.push('');

  if (typeContractStr) {
    lines.push(`## Type Contract`);
    lines.push('```typescript');
    lines.push(typeContractStr);
    lines.push('```');
    lines.push('');
  }

  if (securityConstraints.length > 0) {
    lines.push(`## Security Constraints`);
    for (const constraint of securityConstraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push('');
  }

  lines.push(`## Success Criteria`);
  for (const criterion of successCriteria) {
    lines.push(`1. ${criterion}`);
  }
  lines.push('');

  if (blockers.length > 0) {
    lines.push(`## What You Unblock`);
    lines.push('After you complete, these nodes can proceed:');
    for (const blocker of blockers) {
      const blockerNode = nodes[blocker];
      lines.push(`- ${blocker}: ${blockerNode?.desc ?? '(unknown)'}`);
    }
    lines.push('');
  }

  if (node.ambient && node.ambient.length > 0) {
    lines.push(`## Ambient Context Files`);
    lines.push('Available for reference (not dependencies):');
    for (const file of node.ambient) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  lines.push(`## Notes`);
  lines.push('- Idempotent: ' + (node.idempotent ? 'yes (can re-run)' : 'no (manual/stateful)'));
  if (node.mode) lines.push(`- Mode: ${node.mode}`);
  lines.push('');

  lines.push(`---`);
  lines.push(`All nodes in this roadmap: ${allNodes.split(', ').length} total`);
  lines.push(`Remaining after you complete: ${blockers.length}`);

  const markdown = lines.join('\n');

  // Create the brief object with sealed arrays and deep freeze it
  const brief: CompiledBrief = {
    nodeId,
    title: `${nodeId} — ${node.desc.slice(0, 60)}...`,
    assignment: node.desc,
    whatYouProduce: Object.freeze([...produces]) as string[],
    whatYouConsume: Object.freeze([...consumes]) as string[],
    architectureContext: archContext,
    typeContract: typeContractStr,
    securityConstraints: Object.freeze([...securityConstraints]) as string[],
    successCriteria: Object.freeze([...successCriteria]) as string[],
    nextBlockers: Object.freeze([...blockers]) as string[],
    validationRules: Object.freeze(
      (node.validate ?? []).map((r: ValidationRule) => Object.freeze({ ...r }))
    ) as ValidationRule[],
    allNodes,
    markdown,
  };

  // Deep freeze the entire brief object to prevent any modifications
  return deepFreeze(brief);
}
