// Unit tests for agent brief generation (spec-kit)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateAgentBrief } from '../../src/spec-kit/agent-brief.ts';
import type { AgentBriefOptions } from '../../src/spec-kit/types-brief.ts';
import type { Orientation } from '../../src/protocol.ts';

const TMP = join(import.meta.dirname, '__tmp-sk-agent-brief');

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function makeOrientation(overrides: Partial<Orientation> = {}): Orientation {
  return {
    position: ['node-a', 'node-b'],
    level: 2,
    batchRemaining: ['node-b'],
    batchComplete: false,
    preGate: [],
    done: ['init', 'setup'],
    produces: ['src/output.ts'],
    consumes: ['src/input.ts'],
    remaining: ['node-c', 'term'],
    ...overrides,
  };
}

function makeOptions(overrides: Partial<AgentBriefOptions> = {}): AgentBriefOptions {
  return {
    dagId: 'test-dag-001',
    intent: 'Build the test feature',
    orientation: makeOrientation(),
    specKitWorkspace: TMP,
    ...overrides,
  };
}

describe('generateAgentBrief', () => {
  it('produces valid markdown with YAML frontmatter', () => {
    const result = generateAgentBrief(makeOptions());
    expect(result.markdown).toMatch(/^---\n/);
    expect(result.markdown).toMatch(/\n---\n/);
    expect(result.frontmatter).toBeDefined();
    expect(typeof result.markdown).toBe('string');
  });

  it('includes all required YAML frontmatter fields', () => {
    const result = generateAgentBrief(makeOptions());
    const fm = result.frontmatter;
    expect(fm).toHaveProperty('dagId', 'test-dag-001');
    expect(fm).toHaveProperty('level', 2);
    expect(fm).toHaveProperty('position', ['node-a', 'node-b']);
    expect(fm).toHaveProperty('batchComplete', false);
    expect(fm).toHaveProperty('done', 2);
    expect(fm).toHaveProperty('remaining', 2);
    expect(fm).toHaveProperty('produces');
    expect(fm).toHaveProperty('consumes');
    expect(fm).toHaveProperty('specKitWorkspace');
  });

  it('includes workflow commands in correct order', () => {
    const result = generateAgentBrief(makeOptions());
    const md = result.markdown;
    const specifyIdx = md.indexOf('/speckit.specify');
    const planIdx = md.indexOf('/speckit.plan');
    const tasksIdx = md.indexOf('/speckit.tasks');
    const importIdx = md.indexOf('roadmap import');
    expect(specifyIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(specifyIdx);
    expect(tasksIdx).toBeGreaterThan(planIdx);
    expect(importIdx).toBeGreaterThan(tasksIdx);
  });

  it('discovers spec files in workspace', () => {
    // Seed the workspace with spec files
    writeFileSync(join(TMP, 'pre-spec.md'), '# Pre-spec\nBuild it.');
    writeFileSync(join(TMP, 'spec.md'), '# Spec\nDetails.');
    writeFileSync(join(TMP, 'tasks.json'), '{}');

    const result = generateAgentBrief(makeOptions());
    expect(result.markdown).toContain('pre-spec.md');
    expect(result.markdown).toContain('spec.md');
    expect(result.markdown).toContain('tasks.json');
  });

  it('handles missing workspace gracefully', () => {
    const opts = makeOptions({ specKitWorkspace: join(TMP, 'nonexistent') });
    const result = generateAgentBrief(opts);
    expect(result.markdown).toContain('No spec files found');
    expect(result.frontmatter).toBeDefined();
  });

  it('formats node produces and consumes as code spans', () => {
    const result = generateAgentBrief(makeOptions());
    const md = result.markdown;
    expect(md).toContain('`src/output.ts`');
    expect(md).toContain('`src/input.ts`');
  });

  it('includes batch position info in Position section', () => {
    const result = generateAgentBrief(makeOptions());
    const md = result.markdown;
    expect(md).toContain('## Position');
    expect(md).toContain('L2');
    expect(md).toContain('node-a, node-b');
    expect(md).toContain('Batch complete:** false');
    expect(md).toContain('Remaining nodes:** 2');
  });

  it('uses custom workspace path', () => {
    const customPath = join(TMP, 'custom-spec');
    mkdirSync(customPath, { recursive: true });
    writeFileSync(join(customPath, 'plan.md'), '# Plan');

    const result = generateAgentBrief(makeOptions({ specKitWorkspace: customPath }));
    expect(result.frontmatter.specKitWorkspace).toBe(customPath);
    expect(result.markdown).toContain('plan.md');
  });

  it('overrides orientation produces/consumes with nodeProduces/nodeConsumes', () => {
    const result = generateAgentBrief(makeOptions({
      nodeProduces: ['src/custom-out.ts'],
      nodeConsumes: ['src/custom-in.ts'],
    }));
    expect(result.frontmatter.produces).toEqual(['src/custom-out.ts']);
    expect(result.frontmatter.consumes).toEqual(['src/custom-in.ts']);
    expect(result.markdown).toContain('`src/custom-out.ts`');
    expect(result.markdown).toContain('`src/custom-in.ts`');
  });

  it('renders empty produces/consumes without sections', () => {
    const result = generateAgentBrief(makeOptions({
      nodeProduces: [],
      nodeConsumes: [],
    }));
    expect(result.markdown).not.toContain('## Produces');
    expect(result.markdown).not.toContain('## Consumes');
  });

  it('includes troubleshooting section', () => {
    const result = generateAgentBrief(makeOptions());
    expect(result.markdown).toContain('## Troubleshooting');
    expect(result.markdown).toContain('Missing spec files');
    expect(result.markdown).toContain('Validation failures');
  });
});
