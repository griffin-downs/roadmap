// File organization detector — scans file structure for duplicates, orphans, placement issues

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export interface FileSubsystemInput {
  roadmapRoot: string;
  excludePatterns?: string[];
}

export interface FileIssue extends DAGMismatch {
  file: string;
  category: 'duplicate' | 'orphan' | 'misplaced';
}

export class FileDetector {
  private root: string;
  private excludePatterns: Set<string>;

  constructor(input: FileSubsystemInput) {
    this.root = input.roadmapRoot;
    this.excludePatterns = new Set(input.excludePatterns || [
      'node_modules',
      '.git',
      '.roadmap',
      'dist',
      'build',
      'coverage',
      '.next',
    ]);
  }

  async scan(): Promise<FileIssue[]> {
    const issues: FileIssue[] = [];

    // Scan for orphaned test files
    const testOrphans = this.findOrphanedTests();
    issues.push(...testOrphans);

    // Scan for duplicate source files
    const duplicates = this.findDuplicates();
    issues.push(...duplicates);

    // Scan for misplaced files (in root when should be in src or tests)
    const misplaced = this.findMisplacedFiles();
    issues.push(...misplaced);

    return issues;
  }

  private findOrphanedTests(): FileIssue[] {
    const issues: FileIssue[] = [];
    const testDir = path.join(this.root, 'tests');

    if (!fs.existsSync(testDir)) return issues;

    const walkDir = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith('.test.ts')) {
          const sourceFile = filePath.replace('/tests/', '/src/').replace('.test.ts', '.ts');
          if (!fs.existsSync(sourceFile)) {
            issues.push({
              type: 'state-divergence',
              file: filePath,
              detail: `Test file without corresponding source: ${sourceFile}`,
              severity: 'warn',
              category: 'orphan',
            });
          }
        }
      }
    };

    walkDir(testDir);
    return issues;
  }

  private findDuplicates(): FileIssue[] {
    const issues: FileIssue[] = [];
    const seen: Map<string, string> = new Map();

    const walkDir = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);

        if (this.shouldSkip(filePath)) continue;

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          walkDir(filePath);
        } else {
          const basename = path.basename(file);
          if (seen.has(basename)) {
            issues.push({
              type: 'state-divergence',
              file: filePath,
              detail: `Duplicate filename: ${basename} (also at ${seen.get(basename)})`,
              severity: 'warn',
              category: 'duplicate',
            });
          } else {
            seen.set(basename, filePath);
          }
        }
      }
    };

    walkDir(this.root);
    return issues;
  }

  private findMisplacedFiles(): FileIssue[] {
    const issues: FileIssue[] = [];
    const rootFiles = fs.readdirSync(this.root);

    const badExtensions = ['.ts', '.js', '.tsx', '.jsx'];
    for (const file of rootFiles) {
      const ext = path.extname(file);
      if (badExtensions.includes(ext) && !file.startsWith('.')) {
        issues.push({
          type: 'state-divergence',
          file: path.join(this.root, file),
          detail: `Source file in root: should be in src/ or scripts/`,
          severity: 'info',
          category: 'misplaced',
        });
      }
    }

    return issues;
  }

  private shouldSkip(filePath: string): boolean {
    for (const pattern of this.excludePatterns) {
      if (filePath.includes(pattern)) return true;
    }
    return false;
  }
}

export async function detectFileIssues(input: FileSubsystemInput): Promise<FileIssue[]> {
  const detector = new FileDetector(input);
  return detector.scan();
}
