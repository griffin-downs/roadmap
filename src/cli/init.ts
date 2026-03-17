// @module cli/init
// @description Bootstrap a repo with roadmap execution protocol — CLAUDE.md fragment + skills
// @exports run

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';

const ANCHOR_START = '<!-- roadmap:start -->';
const ANCHOR_END = '<!-- roadmap:end -->';

function findTemplateDir(): string {
  // Walk up from this file (or the bundle) to find templates/
  const candidates = [
    // Running from source: src/cli/init.ts → ../../templates
    join(dirname(new URL(import.meta.url).pathname), '..', '..', 'templates'),
    // Running from dist: dist/roadmap.js → ../templates
    join(dirname(new URL(import.meta.url).pathname), '..', 'templates'),
  ];
  // Also try the pnpm global linked path
  const home = process.env.HOME ?? '';
  if (home) {
    candidates.push(join(home, 'src', 'roadmap', 'templates'));
    candidates.push(join(home, '.local', 'share', 'roadmap', 'templates'));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot find templates/ directory. Run from roadmap repo or ensure pnpm link is current.');
}

function installFragment(repoRoot: string): { action: string; path: string } {
  const templateDir = findTemplateDir();
  const fragmentPath = join(templateDir, 'claude-md-fragment.md');
  if (!existsSync(fragmentPath)) throw new Error(`Fragment not found: ${fragmentPath}`);

  const fragment = readFileSync(fragmentPath, 'utf-8');
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, fragment + '\n');
    return { action: 'created', path: 'CLAUDE.md' };
  }

  const existing = readFileSync(claudeMdPath, 'utf-8');
  const startIdx = existing.indexOf(ANCHOR_START);
  const endIdx = existing.indexOf(ANCHOR_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + ANCHOR_END.length);
    writeFileSync(claudeMdPath, before + fragment + after);
    return { action: 'updated', path: 'CLAUDE.md' };
  }

  writeFileSync(claudeMdPath, existing.trimEnd() + '\n\n' + fragment + '\n');
  return { action: 'appended', path: 'CLAUDE.md' };
}

function installSkills(): { installed: string[]; skipped: string[] } {
  const templateDir = findTemplateDir();
  const skillsSource = join(templateDir, 'skills');
  if (!existsSync(skillsSource)) return { installed: [], skipped: [] };

  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (!home) return { installed: [], skipped: [] };

  const skillsTarget = join(home, '.claude', 'skills');
  const installed: string[] = [];
  const skipped: string[] = [];

  const skillFiles = ['roadmap-orient', 'roadmap-spec', 'roadmap-auto', 'roadmap-review', 'roadmap-endcontext'];

  for (const name of skillFiles) {
    const source = join(skillsSource, `${name}.md`);
    if (!existsSync(source)) continue;

    const targetDir = join(skillsTarget, name);
    const targetFile = join(targetDir, 'SKILL.md');

    mkdirSync(targetDir, { recursive: true });
    copyFileSync(source, targetFile);
    installed.push(name);
  }

  return { installed, skipped };
}

function ensureRoadmapDir(repoRoot: string): boolean {
  const roadmapDir = join(repoRoot, '.roadmap');
  if (existsSync(roadmapDir)) return false;
  mkdirSync(roadmapDir, { recursive: true });
  return true;
}

export async function run(args: string[], repoRoot: string, note: string, outputOpts: OutputOpts): Promise<void> {
  const skipSkills = args.includes('--no-skills');
  const skipFragment = args.includes('--no-fragment');

  const results: Record<string, unknown> = {};

  // Create .roadmap/ if needed
  const createdDir = ensureRoadmapDir(repoRoot);
  if (createdDir) results.roadmapDir = 'created';

  // Install CLAUDE.md fragment
  if (!skipFragment) {
    const fragmentResult = installFragment(repoRoot);
    results.fragment = fragmentResult;
  }

  // Install skills to ~/.claude/skills/
  if (!skipSkills) {
    const skillsResult = installSkills();
    results.skills = skillsResult;
  }

  results.nextStep = 'Run: roadmap make <spec.json> --note "..." to create your first DAG';

  emit({ ok: true, cmd: outputOpts.cmd, data: results }, outputOpts);
}
