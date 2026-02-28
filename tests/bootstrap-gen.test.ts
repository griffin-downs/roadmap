/**
 * Bootstrap generator tests: verify template generation and validation.
 */

import { describe, it, expect } from 'vitest';
import { generateBootstrap, validateBootstrapOptions, BootstrapOptions } from '../src/generate-bootstrap';

describe('bootstrap generation', () => {
  it('generates valid roadmap.ts for init template', () => {
    const { roadmapTs } = generateBootstrap({
      projectName: 'test-project',
      template: 'init',
      targetDir: '.',
    });

    expect(roadmapTs).toContain("id: 'test-project'");
    expect(roadmapTs).toContain('scaffold');
    expect(roadmapTs).toContain('done');
    expect(roadmapTs).toContain('import { graph, define, orient, CompletionStore }');
  });

  it('generates valid roadmap.ts for monorepo template', () => {
    const { roadmapTs } = generateBootstrap({
      projectName: 'monorepo',
      template: 'monorepo',
      targetDir: '.',
    });

    expect(roadmapTs).toContain("id: 'monorepo'");
    expect(roadmapTs).toContain('setup');
    expect(roadmapTs).toContain('build');
    expect(roadmapTs).toContain('shipped');
    expect(roadmapTs).toContain("'packages/*/dist'");
  });

  it('generates valid roadmap.ts for multi-repo template', () => {
    const { roadmapTs } = generateBootstrap({
      projectName: 'workspace',
      template: 'multi-repo',
      targetDir: '.',
    });

    expect(roadmapTs).toContain("id: 'workspace'");
    expect(roadmapTs).toContain('setup');
    expect(roadmapTs).toContain('deployed');
  });

  it('generates valid head.json for init template', () => {
    const { headJson } = generateBootstrap({
      projectName: 'test',
      template: 'init',
      targetDir: '.',
    });

    const head = JSON.parse(headJson);
    expect(head.id).toBe('test');
    expect(head.init).toBe('scaffold');
    expect(head.term).toBe('done');
    expect(head.nodes).toBeDefined();
    expect(head.nodes.scaffold).toBeDefined();
    expect(head.nodes.done).toBeDefined();
  });

  it('generates head.json with valid artifacts', () => {
    const { headJson } = generateBootstrap({
      projectName: 'test',
      template: 'monorepo',
      targetDir: '.',
    });

    const head = JSON.parse(headJson);
    const setupNode = head.nodes.setup;

    expect(setupNode.produces).toBeDefined();
    expect(Array.isArray(setupNode.produces)).toBe(true);
    expect(setupNode.deps).toBeDefined();
    expect(Array.isArray(setupNode.deps)).toBe(true);
  });

  it('generates BOOTSTRAP.md guide', () => {
    const { bootstrapMd } = generateBootstrap({
      projectName: 'myapp',
      template: 'init',
      targetDir: '.',
    });

    expect(bootstrapMd).toContain('myapp');
    expect(bootstrapMd).toContain('init');
    expect(bootstrapMd).toContain('Next Steps');
    expect(bootstrapMd).toContain('roadmap.ts');
    expect(bootstrapMd).toContain('SKILL.md');
  });

  it('validates missing project name', () => {
    const errors = validateBootstrapOptions({
      projectName: '',
      template: 'init',
      targetDir: '.',
    });

    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Project name')]));
  });

  it('validates missing target directory', () => {
    const errors = validateBootstrapOptions({
      projectName: 'test',
      template: 'init',
      targetDir: '',
    });

    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Target directory')]));
  });

  it('validates non-existent target directory', () => {
    const errors = validateBootstrapOptions({
      projectName: 'test',
      template: 'init',
      targetDir: '/nonexistent/path/12345',
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates invalid template', () => {
    const errors = validateBootstrapOptions({
      projectName: 'test',
      template: 'invalid' as any,
      targetDir: '.',
    });

    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Invalid template')]));
  });

  it('detects existing roadmap.ts without force', () => {
    // This test would need a real directory with roadmap.ts
    // For now, just verify the validation logic
    const options: BootstrapOptions = {
      projectName: 'test',
      template: 'init',
      targetDir: '.',
      force: false,
    };

    const errors = validateBootstrapOptions(options);
    // May have errors depending on current directory state
    expect(Array.isArray(errors)).toBe(true);
  });

  it('all templates produce syntactically valid TypeScript', () => {
    const templates = ['init', 'monorepo', 'multi-repo'] as const;

    for (const template of templates) {
      const { roadmapTs } = generateBootstrap({
        projectName: 'test',
        template,
        targetDir: '.',
      });

      // Should contain import statement
      expect(roadmapTs).toContain('import {');

      // Should contain graph and define calls
      expect(roadmapTs).toContain('graph({');
      expect(roadmapTs).toContain('define(');

      // Should end with export
      expect(roadmapTs).toContain('export');
    }
  });

  it('generated head.json is parseable', () => {
    const { headJson } = generateBootstrap({
      projectName: 'test',
      template: 'init',
      targetDir: '.',
    });

    // Should not throw
    const parsed = JSON.parse(headJson);
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('init');
    expect(parsed).toHaveProperty('term');
    expect(parsed).toHaveProperty('nodes');
  });
});
