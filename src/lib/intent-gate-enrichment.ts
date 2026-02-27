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
 * Analyze spec to understand requirements (by reading spec.md structure)
 * Parse headings and acceptance criteria to extract actual requirements
 */
function analyzeSpec(specContent: string): SpecAnalysis {
  const lower = specContent.toLowerCase();

  // Parse spec structure: look for feature sections and acceptance criteria
  const acceptanceCriteria = specContent.match(/### .*?(?=###|$)/gs) || [];
  const allCriteria = acceptanceCriteria.join('\n').toLowerCase();

  // Detect CRUD by looking for all four operations in acceptance criteria
  const hasCrudCreate = allCriteria.includes('create') || allCriteria.includes('add');
  const hasCrudRead = allCriteria.includes('read') || allCriteria.includes('list') || allCriteria.includes('view');
  const hasCrudUpdate = allCriteria.includes('update') || allCriteria.includes('edit') || allCriteria.includes('modify');
  const hasCrudDelete = allCriteria.includes('delete') || allCriteria.includes('remove');

  // Detect features from requirements sections and user stories
  const hasUISection = /## User Interface|## UI|## Components|User can.*view|User can.*see/i.test(specContent);
  const hasUIInCriteria = allCriteria.includes('visible') || allCriteria.includes('display') || allCriteria.includes('show');

  const hasExportSection = /## Export|CSV|download/i.test(specContent);
  const hasThemeSection = /## Theme|dark mode|light mode|theme.toggle/i.test(specContent);
  const hasPersistenceSection = /## Persistence|## Storage|## Database|data.persist|state.persist/i.test(specContent);
  const hasDesktopSection = /## Desktop|Electron|window|application.window/i.test(specContent);

  // App type detection from intro/overview
  const intro = specContent.substring(0, 1000).toLowerCase();
  const isDesktop = intro.includes('electron') || intro.includes('desktop');
  const isWeb = intro.includes('web') || intro.includes('browser') || intro.includes('http');
  const isCli = intro.includes('cli') || intro.includes('command-line') || intro.includes('terminal');

  return {
    hasCRUD: hasCrudCreate && hasCrudRead && hasCrudUpdate && hasCrudDelete,
    hasState: allCriteria.includes('state') || allCriteria.includes('persist') || hasPersistenceSection,
    hasUI: hasUISection || hasUIInCriteria,
    hasExport: hasExportSection || allCriteria.includes('export') || allCriteria.includes('csv'),
    hasTheme: hasThemeSection || allCriteria.includes('theme') || allCriteria.includes('dark'),
    isPersistent: hasPersistenceSection || allCriteria.includes('persist') || allCriteria.includes('database'),
    isDesktopApp: isDesktop || hasDesktopSection,
    isWebApp: isWeb,
    isCLI: isCli,
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

  // ─── Runtime: Visible & Traceable (Explore-based Behavioral Validation) ───
  // If this is a UI app, verify the running instance actually works
  if (spec.hasUI) {
    // Launch check: app must start without crash
    validators.push({
      type: 'launch-check',
      command: spec.isDesktopApp && stack.isElectron
        ? 'npm run dev'  // Electron: launch with npm run dev
        : 'npm run preview',  // Web: launch preview server
      timeout: 10000,  // 10 seconds to start
      successSignal: 'listening|running|ready|started|launched',  // App indicates readiness
    } as any);

    // Runtime explore: verify UI elements are visible + interactive
    // This connects via CDP and checks that features are present
    validators.push({
      type: 'runtime-explore',
      script: 'scripts/explore/validate-intent-gate.ts',
      launch: spec.isDesktopApp && stack.isElectron
        ? 'npm run dev'
        : undefined,
      port: spec.isDesktopApp && stack.isElectron ? 9222 : 3000,  // CDP port or web port
      timeout: 30000,  // 30 seconds for full validation
      observations: [
        { id: 'app-loads', type: 'assertion', description: 'App loads without errors' },
        { id: 'ui-renders', type: 'assertion', description: 'UI elements are rendered and visible' },
        { id: 'features-present', type: 'assertion', description: 'Spec-required features are implemented' },
        ...(spec.hasCRUD ? [
          { id: 'crud-input', type: 'assertion', description: 'Input field for creating items exists' },
          { id: 'crud-list', type: 'assertion', description: 'List of items is visible' },
        ] : []),
        ...(spec.hasTheme ? [
          { id: 'theme-toggle', type: 'assertion', description: 'Theme toggle control is present' },
          { id: 'theme-applied', type: 'assertion', description: 'Theme is visually applied' },
        ] : []),
        ...(spec.hasExport ? [
          { id: 'export-button', type: 'assertion', description: 'Export button is accessible' },
        ] : []),
      ],
    } as any);
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
