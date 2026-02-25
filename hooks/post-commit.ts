#!/usr/bin/env node
// Post-commit hook: write .regent/git-state.json
// Called automatically after every git commit.
// Run time: <50ms (subsumed in git operation time)

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { GitState } from '../src/git-state.schema.ts';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const regentDir = join(repoRoot, '.regent');

// Ensure .regent/ exists
mkdirSync(regentDir, { recursive: true });

// Compute current git state
function getGitState(): GitState {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  const hash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const subject = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();

  // Check if working tree is clean
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  const clean = status === '';

  // Parse dirty files
  const dirty = status
    .split('\n')
    .filter(line => line.trim())
    .map(line => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }));

  // Attempt to infer phase from the commit message or recent work
  // Strategy: if commit subject starts with a known phase name, use it
  const phaseMatch = subject.match(/^(git-state|bootstrap|multi-repo|checkpoint|audit|regent)/);
  const phase = phaseMatch ? phaseMatch[1] : null;

  // Find last checkpoint (tag matching "checkpoint-*")
  let lastCheckpoint: string | null = null;
  try {
    lastCheckpoint = execSync('git describe --tags --abbrev=0 --match="checkpoint-*" 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    // No checkpoint tag found
  }

  // Count dirty commits (commits not yet pushed)
  let dirtyCommits = 0;
  try {
    const remoteHead = execSync('git rev-parse origin/HEAD', { encoding: 'utf-8' }).trim();
    const dirtyOutput = execSync(`git rev-list ${remoteHead}..HEAD --count`, {
      encoding: 'utf-8',
    }).trim();
    dirtyCommits = parseInt(dirtyOutput, 10);
  } catch {
    // No remote, or other error — default to 0
  }

  return {
    timestamp: Date.now(),
    branch,
    head: {
      hash,
      subject,
      phase,
      checkpoint: null, // Agent sets this if needed
    },
    clean,
    dirty: dirty.length
      ? dirty.map(d => ({
          status: d.status,
          path: d.path,
          phase: null, // Agent or hook can annotate
          note: undefined,
        }))
      : undefined,
    lastCheckpoint,
    roadmapPosition: null,
    dirtyCommits,
  };
}

// Write to .regent/git-state.json
const state = getGitState();
const stateFile = join(regentDir, 'git-state.json');
writeFileSync(stateFile, JSON.stringify(state, null, 2));

// Silent exit (normal hook behavior)
process.exit(0);
