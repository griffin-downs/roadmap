#!/usr/bin/env node
/**
 * Post-commit hook: update git-state.json with artifact presence at HEAD.
 * Reads head.json for artifact paths, records existing ones at current commit.
 * Non-blocking — errors silently fail to avoid breaking commits.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createGitState, recordArtifact, isValidGitState } from '../src/git-state.schema';
import type { GitState } from '../src/git-state.schema';

const ROADMAP_DIR = '.roadmap';
const GIT_STATE_FILE = path.join(ROADMAP_DIR, 'git-state.json');

function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getArtifactPaths(): string[] {
  try {
    const headPath = path.join(ROADMAP_DIR, 'head.json');
    if (!fs.existsSync(headPath)) return [];

    const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
    const artifacts = new Set<string>();

    for (const node of Object.values(head.nodes || {})) {
      const n = node as any;
      if (n.produces) {
        for (const p of n.produces) artifacts.add(p);
      }
    }

    return Array.from(artifacts);
  } catch {
    return [];
  }
}

function loadGitState(): GitState {
  try {
    if (fs.existsSync(GIT_STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(GIT_STATE_FILE, 'utf-8'));
      if (isValidGitState(raw)) return raw;
    }
  } catch {
    // Fall through to create fresh
  }
  return createGitState();
}

function main() {
  if (!fs.existsSync(ROADMAP_DIR)) return;

  try {
    let state = loadGitState();
    const commit = getCurrentCommit();

    for (const artifact of getArtifactPaths()) {
      if (fs.existsSync(artifact)) {
        state = recordArtifact(state, artifact, commit);
      }
    }

    fs.writeFileSync(GIT_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Non-blocking — never fail a commit
  }
}

main();
