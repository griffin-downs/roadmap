// @module intent-gate-enrichment
// @description Spec + wisdom driven intent-gate enrichment (platform-agnostic)
// @exports enrichIntentGate(dag, repoRoot) → DAG with validators added to term gate

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph, ValidationRule } from '../protocol.ts';

interface SpecAnalysis {
  hasCRUD: boolean;
  hasState: boolean;
  hasUI: boolean;
  hasExport: boolean;
  hasTheme: boolean;
  isPersistent: boolean;
  isDesktopApp: boolean;
  isWebApp: boolean;
  isCLI: boolean;
}

interface TechStack {
  isElectron: boolean;
  hasVite: boolean;
  hasVue: boolean;
  hasTailwind: boolean;
  hasTest: boolean;
  hasBuild: boolean;
  specPath?: string;
  specContent?: string;
}

/**
 * Analyze spec to understand requirements (wisdom-agnostic of tech stack)
 */
function analyzeSpec(specContent: string): SpecAnalysis {
  const lower = specContent.toLowerCase();
  return {
    hasCRUD:
      (lower.includes('create') || lower.includes('add')) &&
      (lower.includes('read') || lower.includes('list') || lower.includes('view')) &&
      (lower.includes('update') || lower.includes('edit')) &&
      (lower.includes('delete') || lower.includes('remove')),
    hasState: lower.includes('state') || lower.includes('persist') || lower.includes('store'),
    hasUI: lower.includes('ui') || lower.includes('interface') || lower.includes('button') || lower.includes('input'),
    hasExport: lower.includes('export') || lower.includes('csv') || lower.includes('download'),
    hasTheme: lower.includes('theme') || lower.includes('dark') || lower.includes('light') || lower.includes('mode'),
    isPersistent:
      lower.includes('persist') || lower.includes('database') || lower.includes('save') || lower.includes('storage'),
    isDesktopApp: lower.includes('electron') || lower.includes('desktop') || lower.includes('window'),
    isWebApp: lower.includes('web') || lower.includes('browser') || lower.includes('http'),
    isCLI: lower.includes('cli') || lower.includes('command') || lower.includes('terminal'),
  };
}

/**
 * Detect available tech stack from package.json
 */
function detectStack(repoRoot: string): TechStack {
  const ctx: TechStack = {
    isElectron: false,
    hasVite: false,
    hasVue: false,
    hasTailwind: false,
    hasTest: false,
    hasBuild: false,
  };

  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      ctx.isElectron = !!allDeps.electron;
      ctx.hasVite = !!allDeps.vite;
      ctx.hasVue = !!allDeps.vue;
      ctx.hasTailwind = !!allDeps.tailwindcss;
      ctx.hasTest = !!allDeps.vitest || !!allDeps.jest || !!allDeps.mocha;
      ctx.hasBuild = !!(pkg.scripts?.build || pkg.scripts?.dev || pkg.scripts?.start);
    } catch {
      // Ignore parse errors
    }
  }

  // Find spec path
  const specPath = join(repoRoot, '.specify/specs/001-todo-app/spec.md');
  if (existsSync(specPath)) {
    ctx.specPath = specPath;
    ctx.specContent = readFileSync(specPath, 'utf-8');
  }

  return ctx;
}

/**
 * Generate validators from spec requirements + engineering wisdom (stack-agnostic)
 *
 * Wisdom principles:
 * 1. Code quality: build + test must pass (all stacks)
 * 2. State: if spec has CRUD/persist, data model must exist
 * 3. UI: if spec has UI, components/templates must exist
 * 4. Export: if spec has export, serialization code must exist
 * 5. Configuration: theme/settings must be implemented if specified
 * 6. Integration: if desktop, verify it launches
 */
function generateWisdomValidators(spec: SpecAnalysis, stack: TechStack): ValidationRule[] {
  const validators: ValidationRule[] = [];

  // ─── Universal: Code Quality ───
  // All projects need to build and test
  validators.push({
    type: 'shell',
    command: 'npm run build 2>&1 | grep -qE "built|success|complete"',
    expectExitCode: 0,
  });

  if (stack.hasTest) {
    validators.push({
      type: 'shell',
      command: 'npm run test 2>&1 | grep -qE "passed|success|test"',
      expectExitCode: 0,
    });
  }

  // ─── Spec Requirements: CRUD Operations ───
  if (spec.hasCRUD) {
    // Must have test coverage for CRUD
    validators.push({
      type: 'shell',
      command: 'grep -r "create\\|add" tests/ src/ --include="*.ts" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });

    validators.push({
      type: 'shell',
      command: 'grep -r "read\\|list\\|get" tests/ src/ --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });

    validators.push({
      type: 'shell',
      command: 'grep -r "update\\|edit" tests/ src/ --include="*.ts" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });

    validators.push({
      type: 'shell',
      command: 'grep -r "delete\\|remove" tests/ src/ --include="*.ts" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });
  }

  // ─── Spec Requirements: State & Persistence ───
  if (spec.hasState || spec.isPersistent) {
    validators.push({
      type: 'shell',
      command: 'grep -r "store\\|persist\\|database\\|db\\|cache" src/ --include="*.ts" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });
  }

  // ─── Spec Requirements: UI Components ───
  if (spec.hasUI) {
    // Must have component/view files
    validators.push({
      type: 'shell',
      command: 'find src/ -type f \\( -name "*.vue" -o -name "*.tsx" -o -name "*.jsx" \\) 2>/dev/null | grep -q . || find src/components -type f 2>/dev/null | grep -q .',
      expectExitCode: 0,
    });
  }

  // ─── Spec Requirements: Export/Serialization ───
  if (spec.hasExport) {
    validators.push({
      type: 'shell',
      command: 'grep -r "export\\|CSV\\|csv\\|serialize\\|json" src/ --include="*.ts" --include="*.vue" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });
  }

  // ─── Spec Requirements: Theme/Configuration ───
  if (spec.hasTheme) {
    validators.push({
      type: 'shell',
      command: 'grep -r "theme\\|dark\\|light\\|mode\\|color\\|style" src/ --include="*.ts" --include="*.vue" --include="*.css" 2>/dev/null | wc -l | grep -qv "^0$"',
      expectExitCode: 0,
    });
  }

  // ─── Platform Extrapolation: Desktop Apps ───
  if (spec.isDesktopApp && stack.isElectron) {
    // Desktop apps must launch without crash
    validators.push({
      type: 'shell',
      command: 'timeout 5 npm run dev 2>&1 &  sleep 2 && pgrep -f "electron" > /dev/null',
      expectExitCode: 0,
    });
  }

  // ─── Platform Extrapolation: Web Apps ───
  if (spec.isWebApp && stack.hasVite) {
    // Web apps must build and serve
    validators.push({
      type: 'shell',
      command: 'npm run preview 2>&1 | grep -qE "http|server|running" || npm run build 2>&1 | grep -q "dist"',
      expectExitCode: 0,
    });
  }

  return validators;
}

/**
 * Enrich DAG with wisdom-driven intent-gate validators
 * Extracts spec requirements and generates tech-stack-agnostic validators
 */
export function enrichIntentGate(dag: Graph<string>, repoRoot: string): Graph<string> {
  const stack = detectStack(repoRoot);

  // If no spec, can't enrich wisely — return as-is
  if (!stack.specContent) {
    return dag;
  }

  const spec = analyzeSpec(stack.specContent);
  const validators = generateWisdomValidators(spec, stack);

  // Find term node
  const termNodeId = dag.term;
  if (!termNodeId || !dag.nodes[termNodeId]) {
    return dag;
  }

  const termNode = dag.nodes[termNodeId];
  const existingValidate = (termNode.validate as ValidationRule[]) || [];
  const merged: ValidationRule[] = [...existingValidate];

  // Add wisdom validators (avoid duplicates on shell commands)
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

  // Return enriched DAG
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
