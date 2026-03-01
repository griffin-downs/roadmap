// @module spec-kit
// @exports migrateSpecifyToRoadmapSpec, MigrationReport
// @entry roadmap/spec-kit

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface MigrationReport {
  sourceDir: string;
  targetDir: string;
  filesCopied: string[];
  pathsUpdated: number;
  errors: string[];
}

/**
 * Migrate .specify/ contents to .roadmap/spec/.
 * Copies files, rewrites relative references from `.specify/` to `.roadmap/spec/`.
 * Does not delete the source directory — caller decides when to remove.
 */
export function migrateSpecifyToRoadmapSpec(repoRoot: string): MigrationReport {
  const sourceDir = join(repoRoot, '.specify');
  const targetDir = join(repoRoot, '.roadmap', 'spec');

  const report: MigrationReport = {
    sourceDir,
    targetDir,
    filesCopied: [],
    pathsUpdated: 0,
    errors: [],
  };

  if (!existsSync(sourceDir)) {
    report.errors.push(`Source directory does not exist: ${sourceDir}`);
    return report;
  }

  if (!statSync(sourceDir).isDirectory()) {
    report.errors.push(`Source is not a directory: ${sourceDir}`);
    return report;
  }

  // Ensure target exists
  mkdirSync(targetDir, { recursive: true });

  let entries: string[];
  try {
    entries = readdirSync(sourceDir);
  } catch (e) {
    report.errors.push(`Failed to read source directory: ${(e as Error).message}`);
    return report;
  }

  for (const entry of entries) {
    const srcPath = join(sourceDir, entry);
    const destPath = join(targetDir, entry);

    // Skip subdirectories — flat copy only
    if (!statSync(srcPath).isFile()) continue;

    try {
      let content = readFileSync(srcPath, 'utf-8');

      // Rewrite .specify/ references to .roadmap/spec/
      const before = content;
      content = content.replace(/\.specify\//g, '.roadmap/spec/');
      const replacements = (before.match(/\.specify\//g) || []).length;
      report.pathsUpdated += replacements;

      writeFileSync(destPath, content, 'utf-8');
      report.filesCopied.push(relative(repoRoot, destPath));
    } catch (e) {
      report.errors.push(`Failed to copy ${entry}: ${(e as Error).message}`);
    }
  }

  return report;
}
