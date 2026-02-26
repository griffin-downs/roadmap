#!/usr/bin/env node

/**
 * Install roadmap git hooks
 *
 * Usage: npx roadmap install-hooks
 * Or: npm run postinstall (automatic)
 *
 * Installs:
 * - .git/hooks/pre-commit  — enforce orientation before commits
 * - .git/hooks/post-commit — record git state for recovery
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const hooksDir = '.git/hooks';
const sourceDir = path.join(__dirname, '..', 'hooks');

function fail(msg: string) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function main() {
  // Check if .git exists
  if (!fs.existsSync('.git')) {
    console.log('ℹ️  No .git directory found. Skipping hook installation.');
    return;
  }

  // Ensure hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hooks = ['pre-commit', 'post-commit', 'prepare-commit-msg', 'commit-msg'];

  for (const hook of hooks) {
    // Try .ts first, then bare (shell scripts)
    const tsPath = path.join(sourceDir, `${hook}.ts`);
    const barePath = path.join(sourceDir, hook);
    const sourcePath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(barePath) ? barePath : null;
    const targetPath = path.join(hooksDir, hook);

    if (!sourcePath) {
      console.log(`⏭️  Source hook not found: ${hook}`);
      continue;
    }

    // Read source
    const content = fs.readFileSync(sourcePath, 'utf-8');

    // Write to git hooks
    fs.writeFileSync(targetPath, content);
    fs.chmodSync(targetPath, 0o755);

    console.log(`✓ Installed: ${hook}`);
  }

  console.log('\n✅ Git hooks installed');
  console.log('   Pre-commit enforces: roadmap orientation before commits');
  console.log('   Post-commit records: git state for recovery');
}

main();
