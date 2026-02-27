// @module intent-gate-enrichment
// @description Auto-detect platform and enrich DAG with intent-gate validators
// @exports enrichIntentGate(dag, repoRoot) → DAG with validators added to term gate

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph, ValidationRule } from '../protocol.ts';

interface PlatformContext {
  isElectron: boolean;
  hasVite: boolean;
  hasVueThreeSFC: boolean;
  hasTailwind: boolean;
  specPath?: string;
  specContent?: string;
}

/**
 * Parse spec to extract feature context (CRUD, export, theme, etc.)
 */
function parseSpecContext(specPath: string): string[] {
  if (!existsSync(specPath)) return [];
  try {
    const content = readFileSync(specPath, 'utf-8');
    const features: string[] = [];
    if (content.includes('Create') || content.includes('create')) features.push('create');
    if (content.includes('Read') || content.includes('list')) features.push('read');
    if (content.includes('Update') || content.includes('edit')) features.push('update');
    if (content.includes('Delete') || content.includes('delete')) features.push('delete');
    if (content.includes('CSV') || content.includes('export')) features.push('export');
    if (content.includes('theme') || content.includes('Theme')) features.push('theme');
    if (content.includes('dark') || content.includes('Dark')) features.push('dark-mode');
    return features;
  } catch {
    return [];
  }
}

/**
 * Detect platform from package.json and vite.config.ts
 */
function detectPlatform(repoRoot: string): PlatformContext {
  const ctx: PlatformContext = {
    isElectron: false,
    hasVite: false,
    hasVueThreeSFC: false,
    hasTailwind: false,
  };

  // Read package.json
  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      ctx.isElectron = !!pkg.dependencies?.electron || !!pkg.devDependencies?.electron;
      ctx.hasVite = !!pkg.devDependencies?.vite;
      ctx.hasVueThreeSFC = !!pkg.dependencies?.vue;
      ctx.hasTailwind = !!pkg.devDependencies?.tailwindcss;
    } catch {
      // Ignore parse errors
    }
  }

  // Find spec path (common location)
  const specPath = join(repoRoot, '.specify/specs/001-todo-app/spec.md');
  if (existsSync(specPath)) {
    ctx.specPath = specPath;
    ctx.specContent = readFileSync(specPath, 'utf-8');
  }

  return ctx;
}

/**
 * Generate validators enriched by platform context and spec
 */
function generatePlatformValidators(ctx: PlatformContext): ValidationRule[] {
  const validators: ValidationRule[] = [];

  // Code quality gate (universal)
  validators.push({
    type: 'shell',
    command: 'npm run build 2>&1 | grep -q "built"',
    expectExitCode: 0,
  });

  validators.push({
    type: 'shell',
    command: 'npm run test 2>&1 | grep -q "passed"',
    expectExitCode: 0,
  });

  // Spec-enriched validators
  if (ctx.specContent) {
    const features = parseSpecContext(ctx.specPath || '');

    // Feature-specific checks based on spec
    if (features.includes('create')) {
      validators.push({
        type: 'shell',
        command: 'grep -r "create" tests/ --include="*.ts" 2>/dev/null | wc -l | grep -qv "^0$"',
        expectExitCode: 0,
      });
    }

    if (features.includes('theme')) {
      validators.push({
        type: 'shell',
        command: 'grep -r "theme\\|Theme" src/ --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | grep -qv "^0$"',
        expectExitCode: 0,
      });
    }

    if (features.includes('export')) {
      validators.push({
        type: 'shell',
        command: 'grep -r "export\\|CSV\\|csv" src/ --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | grep -qv "^0$"',
        expectExitCode: 0,
      });
    }
  }

  // Electron-specific validators
  if (ctx.isElectron) {
    // Platform detection indicator
    validators.push({
      type: 'shell',
      command: 'grep -q "electron" package.json',
      expectExitCode: 0,
    });
  }

  return validators;
}

/**
 * Enrich DAG with intent-gate validators
 * Adds platform-specific validators to the term gate
 */
export function enrichIntentGate(dag: Graph<string>, repoRoot: string): Graph<string> {
  const ctx = detectPlatform(repoRoot);
  const validators = generatePlatformValidators(ctx);

  // Find term node
  const termNodeId = dag.term;
  if (!termNodeId || !dag.nodes[termNodeId]) {
    // No term node to enrich, return as-is
    return dag;
  }

  const termNode = dag.nodes[termNodeId];

  // Merge validators: keep existing, add platform-specific ones
  const existingValidate = (termNode.validate as ValidationRule[]) || [];
  const merged: ValidationRule[] = [...existingValidate];

  // Add platform validators (avoid duplicates on shell commands)
  for (const v of validators) {
    const isDuplicate = merged.some(
      (existing) =>
        existing.type === v.type &&
        (v.type === 'shell' ? (existing as any).command === (v as any).command : true),
    );
    if (!isDuplicate) {
      merged.push(v);
    }
  }

  // Return enriched DAG (preserve readonlyness by creating new object)
  const enrichedNode = {
    ...termNode,
    validate: merged as readonly ValidationRule[],
  };

  return {
    ...dag,
    nodes: {
      ...dag.nodes,
      [termNodeId]: enrichedNode,
    },
  };
}
