import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateSpecKitPlan, validateSpecKitTasks } from '../src/spec-kit/validation.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_spec_kit_validation');

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function writeTmp(name: string, content: string): string {
  const p = join(TMP, name);
  writeFileSync(p, content);
  return p;
}

// --- Plan validation ---

describe('validateSpecKitPlan', () => {
  it('accepts a valid plan with all required sections', () => {
    const path = writeTmp('valid-plan.md', [
      '# Objective',
      'Build the thing.',
      '## Scope',
      'Everything.',
      '## Core artifacts',
      '- src/foo.ts',
      '## Acceptance scenarios',
      'Given X when Y then Z.',
      '## Implementation',
      'Nodes: `init`, `build`, `term`',
    ].join('\n'));
    const r = validateSpecKitPlan(path);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects a plan missing required sections', () => {
    const path = writeTmp('missing-sections.md', '# Objective\nDo stuff.\n');
    const r = validateSpecKitPlan(path);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.errors.some(e => e.includes('Scope'))).toBe(true);
    expect(r.errors.some(e => e.includes('Core artifacts'))).toBe(true);
    expect(r.errors.some(e => e.includes('Acceptance scenarios'))).toBe(true);
  });

  it('returns error for non-existent file', () => {
    const r = validateSpecKitPlan('/tmp/does-not-exist-xyz.md');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Cannot read');
  });
});

// --- Tasks validation ---

function validNodes(): object[] {
  return [
    { nodeId: 'init', description: 'Start', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
    { nodeId: 'build', description: 'Build', produces: ['out.ts'], consumes: [], dependencies: ['init'], validate: [], mode: 'execute' },
    { nodeId: 'term', description: 'End', produces: [], consumes: [], dependencies: ['build'], validate: [], mode: 'execute' },
  ];
}

describe('validateSpecKitTasks', () => {
  it('accepts valid tasks', () => {
    const path = writeTmp('valid-tasks.json', JSON.stringify(validNodes()));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects missing required fields', () => {
    const nodes = [{ nodeId: 'init' }];
    const path = writeTmp('missing-fields.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('description'))).toBe(true);
    expect(r.errors.some(e => e.includes('produces'))).toBe(true);
  });

  it('rejects invalid node IDs', () => {
    const nodes = [
      { nodeId: 'has space', description: 'x', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
    ];
    const path = writeTmp('bad-id.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('invalid nodeId'))).toBe(true);
  });

  it('rejects duplicate node IDs', () => {
    const nodes = [
      { nodeId: 'init', description: 'a', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
      { nodeId: 'init', description: 'b', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
    ];
    const path = writeTmp('dup-id.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('rejects unresolved dependencies', () => {
    const nodes = [
      { nodeId: 'init', description: 'x', produces: [], consumes: [], dependencies: ['ghost'], validate: [], mode: 'execute' },
    ];
    const path = writeTmp('bad-dep.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('ghost'))).toBe(true);
  });

  it('detects cycles', () => {
    const nodes = [
      { nodeId: 'init', description: 'x', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
      { nodeId: 'a', description: 'x', produces: [], consumes: [], dependencies: ['b'], validate: [], mode: 'execute' },
      { nodeId: 'b', description: 'x', produces: [], consumes: [], dependencies: ['a'], validate: [], mode: 'execute' },
      { nodeId: 'term', description: 'x', produces: [], consumes: [], dependencies: ['a'], validate: [], mode: 'execute' },
    ];
    const path = writeTmp('cycle.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('rejects missing init/term', () => {
    const nodes = [
      { nodeId: 'build', description: 'x', produces: [], consumes: [], dependencies: [], validate: [], mode: 'execute' },
    ];
    const path = writeTmp('no-init-term.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('"init"'))).toBe(true);
    expect(r.errors.some(e => e.includes('"term"'))).toBe(true);
  });

  it('warns on invalid mode', () => {
    const nodes = validNodes().map((n: any) => ({ ...n, mode: 'bogus' }));
    const path = writeTmp('bad-mode.json', JSON.stringify(nodes));
    const r = validateSpecKitTasks(path);
    expect(r.warnings.some(w => w.includes('mode'))).toBe(true);
  });

  it('rejects non-array JSON', () => {
    const path = writeTmp('object.json', '{"not": "array"}');
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('JSON array');
  });

  it('rejects invalid JSON', () => {
    const path = writeTmp('bad.json', '{broken');
    const r = validateSpecKitTasks(path);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Invalid JSON');
  });
});
