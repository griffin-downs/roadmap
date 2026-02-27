import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SkillTemplate, ConstraintExtractor,
  readPackageVersion, computeSkillHash, embedVersion, extractVersionHash,
  installAll,
} from '../src/lib/install-skills.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

let testRoot: string;
const BIN = '/usr/local/bin/roadmap';

beforeEach(() => {
  testRoot = join(tmpdir(), `roadmap-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
});

function targetDir(): string {
  return join(testRoot, '.claude', 'commands');
}

function readSkill(name: string): string {
  return readFileSync(join(targetDir(), `roadmap-${name}.md`), 'utf-8');
}

function skillFiles(): string[] {
  const dir = targetDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.startsWith('roadmap-') && f.endsWith('.md')).sort();
}

function writeFakeClaudeMd(content: string): string {
  const p = join(testRoot, 'CLAUDE.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

const SAMPLE_CLAUDE_MD = `# CONSTRAINTS

## Identity
- High-context, high-agency

## Language
- Concrete, declarative

## Code
- Guards: exit on failure

## Roadmap
- DAG-governed execution

## Regent
- Multi-agent coordination

## Roadmap Protocol
- Every interaction that mutates state
`;

// ── Version hashing ──────────────────────────────────────────────────────────

describe('version hashing', () => {
  it('readPackageVersion returns semver from this repo', () => {
    const v = readPackageVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('computeSkillHash is deterministic', () => {
    const a = computeSkillHash('start', '1.0.0');
    const b = computeSkillHash('start', '1.0.0');
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
  });

  it('computeSkillHash differs by id', () => {
    expect(computeSkillHash('start', '1.0.0')).not.toBe(computeSkillHash('done', '1.0.0'));
  });

  it('computeSkillHash differs by version', () => {
    expect(computeSkillHash('start', '1.0.0')).not.toBe(computeSkillHash('start', '2.0.0'));
  });

  it('embedVersion + extractVersionHash roundtrip', () => {
    const hash = computeSkillHash('test', '1.0.0');
    const doc = embedVersion('# Hello', hash);
    expect(extractVersionHash(doc)).toBe(hash);
  });

  it('extractVersionHash returns null for unversioned content', () => {
    expect(extractVersionHash('# Hello\nno version here')).toBeNull();
  });
});

// ── SkillTemplate ────────────────────────────────────────────────────────────

describe('SkillTemplate', () => {
  it('render substitutes $ROADMAP_BIN in steps', () => {
    const tpl = new SkillTemplate('test', 'Test', 'desc', [
      { instruction: 'Run: `$ROADMAP_BIN orient`' },
    ]);
    const out = tpl.render({ roadmapBin: BIN });
    expect(out).toContain(`\`${BIN} orient\``);
    expect(out).not.toContain('$ROADMAP_BIN');
  });

  it('render substitutes $ROADMAP_BIN in contract', () => {
    const tpl = new SkillTemplate('test', 'Test', 'desc', [], undefined, 'Use $ROADMAP_BIN chart');
    const out = tpl.render({ roadmapBin: BIN });
    expect(out).toContain(`${BIN} chart`);
    expect(out).not.toContain('$ROADMAP_BIN');
  });

  it('render includes Arguments section when args provided', () => {
    const tpl = new SkillTemplate('test', 'Test', 'desc', [], '- `node` (required)');
    const out = tpl.render({ roadmapBin: BIN });
    expect(out).toContain('## Arguments');
    expect(out).toContain('`node` (required)');
  });

  it('render omits Arguments section when no args', () => {
    const tpl = new SkillTemplate('test', 'Test', 'desc', []);
    const out = tpl.render({ roadmapBin: BIN });
    expect(out).not.toContain('## Arguments');
  });

  it('write creates file with version header', () => {
    const tpl = new SkillTemplate('test', 'Test', 'desc', [{ instruction: 'step 1' }]);
    const path = tpl.write(targetDir(), { roadmapBin: BIN });
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf-8');
    expect(extractVersionHash(content)).not.toBeNull();
    expect(content).toContain('# /roadmap-test');
  });

  it('write creates target directory if missing', () => {
    const dir = join(testRoot, 'deep', 'nested');
    const tpl = new SkillTemplate('test', 'Test', 'desc', []);
    tpl.write(dir, { roadmapBin: BIN });
    expect(existsSync(join(dir, 'roadmap-test.md'))).toBe(true);
  });
});

// ── ConstraintExtractor ──────────────────────────────────────────────────────

describe('ConstraintExtractor', () => {
  it('extracts behavioral sections', () => {
    const result = ConstraintExtractor.extractFromSource(SAMPLE_CLAUDE_MD);
    expect(Object.keys(result.sections)).toContain('Identity');
    expect(Object.keys(result.sections)).toContain('Language');
    expect(Object.keys(result.sections)).toContain('Code');
  });

  it('excludes roadmap/regent/protocol sections', () => {
    const result = ConstraintExtractor.extractFromSource(SAMPLE_CLAUDE_MD);
    expect(result.excluded).toContain('Roadmap');
    expect(result.excluded).toContain('Regent');
    expect(result.excluded).toContain('Roadmap Protocol');
    expect(Object.keys(result.sections)).not.toContain('Roadmap');
    expect(Object.keys(result.sections)).not.toContain('Regent');
    expect(Object.keys(result.sections)).not.toContain('Roadmap Protocol');
  });

  it('preserves section body content', () => {
    const result = ConstraintExtractor.extractFromSource(SAMPLE_CLAUDE_MD);
    expect(result.sections['Identity']).toContain('High-context');
    expect(result.sections['Code']).toContain('Guards');
  });

  it('ignores non-behavioral, non-excluded sections', () => {
    const source = `## Random Section\nfoo\n\n## Language\nbar`;
    const result = ConstraintExtractor.extractFromSource(source);
    expect(Object.keys(result.sections)).toEqual(['Language']);
    expect(result.excluded).toEqual([]);
  });

  it('extract reads from file', () => {
    const path = writeFakeClaudeMd(SAMPLE_CLAUDE_MD);
    const result = ConstraintExtractor.extract(path);
    expect(Object.keys(result.sections).length).toBeGreaterThan(0);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it('renderSkill produces valid markdown with heading', () => {
    const result = ConstraintExtractor.extractFromSource(SAMPLE_CLAUDE_MD);
    const rendered = ConstraintExtractor.renderSkill(result);
    expect(rendered).toContain('# /roadmap-constraints');
    expect(rendered).toContain('## Identity');
    expect(rendered).toContain('## Language');
    expect(rendered).toContain('## Code');
    expect(rendered).not.toContain('## Roadmap');
  });
});

// ── installAll ───────────────────────────────────────────────────────────────

describe('installAll', () => {
  const EXPECTED_SKILLS = [
    'roadmap-dispatch.md',
    'roadmap-done.md',
    'roadmap-gallery.md',
    'roadmap-progress.md',
    'roadmap-review.md',
    'roadmap-start.md',
    'roadmap-work.md',
  ];

  it('installs all 7 builtin skills', () => {
    const result = installAll({ targetDir: targetDir(), roadmapBin: BIN });
    expect(result.installed).toHaveLength(7);
    expect(result.constraintsInstalled).toBe(false);
    expect(skillFiles()).toEqual(EXPECTED_SKILLS);
  });

  it('installs constraints skill when constraints path given', () => {
    const claudePath = writeFakeClaudeMd(SAMPLE_CLAUDE_MD);
    const result = installAll({ targetDir: targetDir(), roadmapBin: BIN, constraints: claudePath });
    expect(result.installed).toHaveLength(8);
    expect(result.constraintsInstalled).toBe(true);
    expect(skillFiles()).toContain('roadmap-constraints.md');

    const content = readFileSync(join(targetDir(), 'roadmap-constraints.md'), 'utf-8');
    expect(content).toContain('# /roadmap-constraints');
    expect(extractVersionHash(content)).not.toBeNull();
  });

  it('all skills have version headers', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    for (const file of skillFiles()) {
      const id = file.replace(/^roadmap-/, '').replace(/\.md$/, '');
      const content = readFileSync(join(targetDir(), file), 'utf-8');
      const hash = extractVersionHash(content);
      expect(hash, `${file} missing version hash`).not.toBeNull();
      const expected = computeSkillHash(id, readPackageVersion());
      expect(hash, `${file} hash mismatch`).toBe(expected);
    }
  });

  it('all skills have $ROADMAP_BIN resolved', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    for (const file of skillFiles()) {
      const content = readFileSync(join(targetDir(), file), 'utf-8');
      expect(content, `${file} still has $ROADMAP_BIN`).not.toContain('$ROADMAP_BIN');
    }
  });

  it('all skills contain ## Steps section', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    for (const file of skillFiles()) {
      const content = readFileSync(join(targetDir(), file), 'utf-8');
      expect(content, `${file} missing ## Steps`).toContain('## Steps');
    }
  });

  it('skills with contracts contain ## Contract section', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    // All 7 builtin skills have contracts
    for (const file of skillFiles()) {
      const content = readFileSync(join(targetDir(), file), 'utf-8');
      expect(content, `${file} missing ## Contract`).toContain('## Contract');
    }
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('install twice produces identical output', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    const first: Record<string, string> = {};
    for (const file of skillFiles()) {
      first[file] = readFileSync(join(targetDir(), file), 'utf-8');
    }

    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    const second: Record<string, string> = {};
    for (const file of skillFiles()) {
      second[file] = readFileSync(join(targetDir(), file), 'utf-8');
    }

    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    for (const file of Object.keys(first)) {
      expect(second[file], `${file} changed on second install`).toBe(first[file]);
    }
  });

  it('install with constraints twice produces identical output', () => {
    const claudePath = writeFakeClaudeMd(SAMPLE_CLAUDE_MD);
    installAll({ targetDir: targetDir(), roadmapBin: BIN, constraints: claudePath });
    const first = readFileSync(join(targetDir(), 'roadmap-constraints.md'), 'utf-8');

    installAll({ targetDir: targetDir(), roadmapBin: BIN, constraints: claudePath });
    const second = readFileSync(join(targetDir(), 'roadmap-constraints.md'), 'utf-8');

    expect(second).toBe(first);
  });
});

// ── Specific skill content ───────────────────────────────────────────────────

describe('skill content', () => {
  beforeEach(() => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
  });

  it('roadmap-start contains orient and chart commands', () => {
    const content = readSkill('start');
    expect(content).toContain(`${BIN} orient`);
    expect(content).toContain(`${BIN} chart`);
    expect(content).toContain('## Arguments');
  });

  it('roadmap-work contains show command and consumes/produces', () => {
    const content = readSkill('work');
    expect(content).toContain(`${BIN} show`);
    expect(content).toContain('Produces');
    expect(content).toContain('Consumes');
  });

  it('roadmap-done contains git add and complete', () => {
    const content = readSkill('done');
    expect(content).toContain('git add');
    expect(content).toContain('git commit');
    expect(content).toContain(`${BIN} complete`);
  });

  it('roadmap-dispatch contains orient --assign', () => {
    const content = readSkill('dispatch');
    expect(content).toContain(`${BIN} orient --assign`);
    expect(content).toContain('--next');
  });

  it('roadmap-review contains three adversarial passes', () => {
    const content = readSkill('review');
    expect(content).toContain('fool lens');
    expect(content).toContain('inquisitor lens');
    expect(content).toContain('griffinProxy lens');
  });

  it('roadmap-gallery contains chart --deps', () => {
    const content = readSkill('gallery');
    expect(content).toContain(`${BIN} chart`);
    expect(content).toContain('AskUserQuestion');
  });

  it('roadmap-progress contains orient --check and chart', () => {
    const content = readSkill('progress');
    expect(content).toContain(`${BIN} orient --check`);
    expect(content).toContain(`${BIN} chart`);
    expect(content).toContain('AskUserQuestion');
  });
});

// ── --check staleness detection ──────────────────────────────────────────────

describe('staleness detection', () => {
  it('current version hashes match installed skills', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });
    const version = readPackageVersion();
    for (const file of skillFiles()) {
      const content = readFileSync(join(targetDir(), file), 'utf-8');
      const installed = extractVersionHash(content)!;
      const id = file.replace(/^roadmap-/, '').replace(/\.md$/, '');
      const expected = computeSkillHash(id, version);
      expect(installed).toBe(expected);
    }
  });

  it('detects stale skills when version differs', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });

    // Tamper: embed a hash from a different version
    const startPath = join(targetDir(), 'roadmap-start.md');
    const content = readFileSync(startPath, 'utf-8');
    const staleHash = computeSkillHash('start', '99.99.99');
    const tampered = content.replace(/^<!-- roadmap-skill-version: [a-f0-9]+ -->/, `<!-- roadmap-skill-version: ${staleHash} -->`);
    writeFileSync(startPath, tampered, 'utf-8');

    const installed = extractVersionHash(tampered)!;
    const current = computeSkillHash('start', readPackageVersion());
    expect(installed).not.toBe(current);
  });

  it('returns null for skills without version header', () => {
    const dir = targetDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'roadmap-custom.md'), '# Custom skill\nno version');
    const content = readFileSync(join(dir, 'roadmap-custom.md'), 'utf-8');
    expect(extractVersionHash(content)).toBeNull();
  });
});

// ── --update force re-export ─────────────────────────────────────────────────

describe('update (re-export)', () => {
  it('overwrites existing skills with fresh content', () => {
    installAll({ targetDir: targetDir(), roadmapBin: BIN });

    // Corrupt a skill
    const startPath = join(targetDir(), 'roadmap-start.md');
    writeFileSync(startPath, 'corrupted content', 'utf-8');

    // Re-install (simulating --update)
    installAll({ targetDir: targetDir(), roadmapBin: BIN });

    const restored = readFileSync(startPath, 'utf-8');
    expect(restored).toContain('# /roadmap-start');
    expect(restored).not.toBe('corrupted content');
  });
});

// ── Constraint extraction edge cases ─────────────────────────────────────────

describe('constraint extraction edge cases', () => {
  it('handles CLAUDE.md with no behavioral sections', () => {
    const source = `# Project\n\n## Roadmap\nfoo\n\n## Random\nbar`;
    const result = ConstraintExtractor.extractFromSource(source);
    expect(Object.keys(result.sections)).toEqual([]);
    expect(result.excluded).toContain('Roadmap');
  });

  it('handles empty CLAUDE.md', () => {
    const result = ConstraintExtractor.extractFromSource('');
    expect(Object.keys(result.sections)).toEqual([]);
    expect(result.excluded).toEqual([]);
  });

  it('handles CLAUDE.md with only H1 headings (no H2)', () => {
    const result = ConstraintExtractor.extractFromSource('# Title\nSome content');
    expect(Object.keys(result.sections)).toEqual([]);
  });

  it('case-insensitive matching on section headings', () => {
    const source = `## IDENTITY\nfoo\n\n## language\nbar\n\n## CODE\nbaz`;
    const result = ConstraintExtractor.extractFromSource(source);
    expect(Object.keys(result.sections)).toHaveLength(3);
  });

  it('excludes roadmap protocol (case-insensitive)', () => {
    const source = `## Roadmap Protocol\nfoo\n\n## Language\nbar`;
    const result = ConstraintExtractor.extractFromSource(source);
    expect(result.excluded).toContain('Roadmap Protocol');
    expect(Object.keys(result.sections)).toEqual(['Language']);
  });

  it('renderSkill with empty sections produces minimal output', () => {
    const rendered = ConstraintExtractor.renderSkill({ sections: {}, excluded: [] });
    expect(rendered).toContain('# /roadmap-constraints');
    expect(rendered).not.toContain('##');
  });
});
