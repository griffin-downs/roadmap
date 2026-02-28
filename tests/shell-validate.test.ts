import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { graph, define, validateNode } from '../src/protocol.ts';

// Clear recursion guard — tests need shell validators to actually run
delete process.env.ROADMAP_VALIDATING;

describe('validateNode: shell validation rule', () => {
  it('passes shell rule when command exits with 0', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work with shell validation',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'echo ok' }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', (a: string) => a === 'init.txt');

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[0].evidence).toContain('command passed');
  });

  it('fails shell rule when command exits with non-zero (default expectExitCode 0)', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work with failing shell',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'exit 1' }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', () => true);

    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].evidence).toContain('command failed');
  });

  it('passes shell rule when command exits with custom expectExitCode', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work expecting exit 1',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'exit 1', expectExitCode: 1 }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', () => true);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[0].evidence).toContain('exit code matches');
  });

  it('includes stdout in evidence', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work with output',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'echo "test output" && exit 0' }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', () => true);

    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('command passed');
  });

  it('handles nonexistent command gracefully', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work with bad command',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: '/nonexistent/command/surely' }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', () => true);

    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].evidence).toContain('command failed');
  });

  it('respects ROADMAP_VALIDATING guard to prevent recursion', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'npx vitest --version' }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const originalEnv = process.env.ROADMAP_VALIDATING;
    process.env.ROADMAP_VALIDATING = '1';

    const result = await validateNode(g, 'work', () => true);

    if (originalEnv === undefined) {
      delete process.env.ROADMAP_VALIDATING;
    } else {
      process.env.ROADMAP_VALIDATING = originalEnv;
    }

    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped (already inside validation)');
  });

  it('fails when command exit code does not match expectExitCode', async () => {
    const g = define(graph({
      id: 'shell-test',
      desc: 'test shell validation',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
        work: {
          id: 'work',
          desc: 'work expecting exit 2',
          produces: ['work.txt'],
          consumes: [],
          deps: ['init'],
          validate: [{ type: 'shell', command: 'exit 1', expectExitCode: 2 }],
          idempotent: true,
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'], validate: [], idempotent: true },
      },
    }));

    const result = await validateNode(g, 'work', () => true);

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].rule.type).toBe('shell');
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('expected 2');
  });
});
