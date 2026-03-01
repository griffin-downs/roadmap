// Unit tests for spec-kit plan/task validators
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpecKitPlan, validateSpecKitTasks } from '../../src/spec-kit/validation.ts';

const TMP = join(import.meta.dirname, '__tmp-sk-validation');

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function writeTmp(name: string, content: string): string {
  const p = join(TMP, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

// --- validateSpecKitPlan ---

describe('validateSpecKitPlan', () => {
  it('passes for a valid plan with all required sections', () => {
    const p = writeTmp('valid-plan.md', [
      '# Objective',
      'Build the thing.',
      '## Scope',
      'Everything.',
      '## Core artifacts',
      '- file.ts',
      '## Acceptance scenarios',
      'Given X, when Y, then Z.',
      '## Implementation',
      '`node-a` does stuff.',
    ].join('\n'));
    const r = validateSpecKitPlan(p);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('fails when required sections are missing', () => {
    const p = writeTmp('missing-sections.md', [
      '# Objective',
      'Build the thing.',
      '## Scope',
      'Narrow.',
    ].join('\n'));
    const r = validateSpecKitPlan(p);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.errors.some(e => e.includes('Core artifacts'))).toBe(true);
    expect(r.errors.some(e => e.includes('Acceptance scenarios'))).toBe(true);
    expect(r.errors.some(e => e.includes('Implementation'))).toBe(true);
  });

  it('fails when file does not exist', () => {
    const r = validateSpecKitPlan('/nonexistent/plan.md');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Cannot read plan file/);
  });

  it('warns when node IDs referenced but no Implementation section', () => {
    // Has node refs via backticks but no Implementation heading
    const p = writeTmp('warn-plan.md', [
      '# Objective',
      'Build `node-a`.',
      '## Scope',
      'All.',
      '## Core artifacts',
      '- a.ts',
      '## Acceptance scenarios',
      'Done.',
    ].join('\n'));
    const r = validateSpecKitPlan(p);
    // Missing Implementation → error, but also warning about node refs
    expect(r.ok).toBe(false);
    expect(r.warnings.some(w => w.includes('node IDs'))).toBe(true);
  });
});

// --- validateSpecKitTasks ---

function validTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nodeId: 'task-a',
    description: 'Do something',
    produces: ['out.ts'],
    consumes: [],
    dependencies: ['init'],
    validate: [],
    mode: 'execute',
    ...overrides,
  };
}

function writeTasksFile(name: string, tasks: unknown[]): string {
  return writeTmp(name, JSON.stringify(tasks));
}

describe('validateSpecKitTasks', () => {
  it('passes for valid tasks with init and term', () => {
    const p = writeTasksFile('valid-tasks.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'work', dependencies: ['init'] }),
      validTask({ nodeId: 'term', dependencies: ['work'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('fails for orphaned dependencies', () => {
    const p = writeTasksFile('orphan-deps.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'work', dependencies: ['init', 'ghost-node'] }),
      validTask({ nodeId: 'term', dependencies: ['work'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('ghost-node') && e.includes('not found'))).toBe(true);
  });

  it('fails for cyclic dependencies', () => {
    const p = writeTasksFile('cyclic.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'a', dependencies: ['b'] }),
      validTask({ nodeId: 'b', dependencies: ['a'] }),
      validTask({ nodeId: 'term', dependencies: ['a', 'b'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('fails for invalid node IDs (spaces/special chars)', () => {
    const p = writeTasksFile('bad-ids.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'bad node!', dependencies: ['init'] }),
      validTask({ nodeId: 'term', dependencies: ['bad node!'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('invalid nodeId'))).toBe(true);
  });

  it('fails for duplicate node IDs', () => {
    const p = writeTasksFile('dupes.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'dup', dependencies: ['init'] }),
      validTask({ nodeId: 'dup', dependencies: ['init'] }),
      validTask({ nodeId: 'term', dependencies: ['dup'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('Duplicate nodeId'))).toBe(true);
  });

  it('fails when file does not exist', () => {
    const r = validateSpecKitTasks('/nonexistent/tasks.json');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Cannot read tasks file/);
  });

  it('fails for invalid JSON', () => {
    const p = writeTmp('bad.json', '{ not valid json !!!');
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Invalid JSON/);
  });

  it('fails when tasks file is not an array', () => {
    const p = writeTmp('obj.json', JSON.stringify({ nodeId: 'init' }));
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/JSON array/);
  });

  it('fails when required fields are missing', () => {
    const p = writeTasksFile('missing-fields.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      { nodeId: 'bad' }, // missing description, produces, consumes, dependencies, validate, mode
      validTask({ nodeId: 'term', dependencies: ['bad'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('missing required field'))).toBe(true);
  });

  it('warns for invalid mode values', () => {
    const p = writeTasksFile('bad-mode.json', [
      validTask({ nodeId: 'init', dependencies: [], mode: 'bogus' }),
      validTask({ nodeId: 'term', dependencies: ['init'] }),
    ]);
    const r = validateSpecKitTasks(p);
    // Invalid mode is a warning, not an error
    expect(r.ok).toBe(true);
    expect(r.warnings.some(w => w.includes('mode'))).toBe(true);
  });

  it('fails when no init node defined', () => {
    const p = writeTasksFile('no-init.json', [
      validTask({ nodeId: 'a', dependencies: [] }),
      validTask({ nodeId: 'term', dependencies: ['a'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('No "init" node'))).toBe(true);
  });

  it('fails when no term node defined', () => {
    const p = writeTasksFile('no-term.json', [
      validTask({ nodeId: 'init', dependencies: [] }),
      validTask({ nodeId: 'a', dependencies: ['init'] }),
    ]);
    const r = validateSpecKitTasks(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('No "term" node'))).toBe(true);
  });
});
