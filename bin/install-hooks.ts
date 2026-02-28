#!/usr/bin/env node

/**
 * Install roadmap git hooks
 *
 * Usage: npx roadmap install-hooks
 * Or: npm run postinstall (automatic)
 *
 * Installs hooks from hooks/ → .git/hooks/
 * Resets core.hooksPath to .git/hooks to prevent worktree corruption.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_ = path.dirname(__filename_);

const hooksDir = '.git/hooks';
const sourceDir = path.join(__dirname_, '..', 'hooks');

function main() {
  // Check if .git exists (could be a file in worktrees)
  if (!fs.existsSync('.git')) {
    console.log('No .git found. Skipping hook installation.');
    return;
  }

  // Reset core.hooksPath — prevents corruption from stale/injected paths
  try {
    const current = execSync('git config --local core.hooksPath', { encoding: 'utf-8' }).trim();
    if (current && current !== '.git/hooks') {
      console.log(`Resetting core.hooksPath from "${current}" to .git/hooks`);
      execSync('git config --local --unset core.hooksPath');
    }
  } catch {
    // Not set — good
  }

  // Ensure hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hooks = ['pre-commit', 'post-commit', 'prepare-commit-msg', 'commit-msg'];

  for (const hook of hooks) {
    // Prefer bare (bash) over .ts — bash hooks are self-contained and portable
    const barePath = path.join(sourceDir, hook);
    const tsPath = path.join(sourceDir, `${hook}.ts`);
    const sourcePath = fs.existsSync(barePath) ? barePath : fs.existsSync(tsPath) ? tsPath : null;
    const targetPath = path.join(hooksDir, hook);

    if (!sourcePath) {
      console.log(`  skip: ${hook} (no source)`);
      continue;
    }

    const content = fs.readFileSync(sourcePath, 'utf-8');
    fs.writeFileSync(targetPath, content);
    fs.chmodSync(targetPath, 0o755);

    console.log(`  installed: ${hook}`);
  }

  console.log('Git hooks installed');
}

main();
