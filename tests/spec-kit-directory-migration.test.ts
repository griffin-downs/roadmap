import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrateSpecifyToRoadmapSpec } from '../src/spec-kit/directory-migration.js';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_dir_migration');

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function makeRepo(name: string): string {
  const root = join(TMP, name);
  mkdirSync(join(root, '.specify'), { recursive: true });
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  return root;
}

describe('migrateSpecifyToRoadmapSpec', () => {
  it('copies files from .specify/ to .roadmap/spec/', () => {
    const root = makeRepo('basic');
    writeFileSync(join(root, '.specify', 'pre-spec.md'), 'requirements here');
    writeFileSync(join(root, '.specify', 'spec.md'), 'spec content');

    const report = migrateSpecifyToRoadmapSpec(root);

    expect(report.errors).toEqual([]);
    expect(report.filesCopied).toHaveLength(2);
    expect(existsSync(join(root, '.roadmap', 'spec', 'pre-spec.md'))).toBe(true);
    expect(existsSync(join(root, '.roadmap', 'spec', 'spec.md'))).toBe(true);
    expect(readFileSync(join(root, '.roadmap', 'spec', 'pre-spec.md'), 'utf-8')).toBe('requirements here');
  });

  it('rewrites .specify/ references in file content', () => {
    const root = makeRepo('rewrite');
    writeFileSync(join(root, '.specify', 'plan.md'), 'See .specify/spec.md for details and .specify/pre-spec.md');

    const report = migrateSpecifyToRoadmapSpec(root);

    expect(report.pathsUpdated).toBe(2);
    const content = readFileSync(join(root, '.roadmap', 'spec', 'plan.md'), 'utf-8');
    expect(content).toBe('See .roadmap/spec/spec.md for details and .roadmap/spec/pre-spec.md');
  });

  it('returns error when .specify/ does not exist', () => {
    const root = join(TMP, 'no-specify');
    mkdirSync(root, { recursive: true });

    const report = migrateSpecifyToRoadmapSpec(root);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('does not exist');
    expect(report.filesCopied).toEqual([]);
  });

  it('creates .roadmap/spec/ if it does not exist', () => {
    const root = join(TMP, 'no-target');
    mkdirSync(join(root, '.specify'), { recursive: true });
    writeFileSync(join(root, '.specify', 'file.md'), 'content');

    const report = migrateSpecifyToRoadmapSpec(root);

    expect(report.errors).toEqual([]);
    expect(existsSync(join(root, '.roadmap', 'spec', 'file.md'))).toBe(true);
  });

  it('skips subdirectories (flat copy)', () => {
    const root = makeRepo('subdir');
    mkdirSync(join(root, '.specify', 'nested'), { recursive: true });
    writeFileSync(join(root, '.specify', 'nested', 'deep.md'), 'deep');
    writeFileSync(join(root, '.specify', 'top.md'), 'top');

    const report = migrateSpecifyToRoadmapSpec(root);

    expect(report.filesCopied).toHaveLength(1);
    expect(existsSync(join(root, '.roadmap', 'spec', 'nested'))).toBe(false);
  });
});
