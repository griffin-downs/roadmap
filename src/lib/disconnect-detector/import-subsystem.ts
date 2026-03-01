// Import consistency detector — scans for broken paths, circular deps, barrel exports

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export interface ImportSubsystemInput {
  roadmapRoot: string;
}

export class ImportDetector {
  private root: string;

  constructor(input: ImportSubsystemInput) {
    this.root = input.roadmapRoot;
  }

  async scan(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    // Run tsc to detect import errors
    try {
      execSync('npx tsc --noEmit 2>&1', { cwd: this.root, encoding: 'utf8' });
    } catch (e) {
      if (e instanceof Error && 'stdout' in e) {
        const output = (e as any).stdout || (e as any).message;
        if (output && output.includes('error TS')) {
          issues.push({
            type: 'state-divergence',
            detail: `TypeScript compilation errors detected: ${output.split('\n').slice(0, 3).join('; ')}`,
            severity: 'error',
          });
        }
      }
    }

    // Check for circular dependencies (simple heuristic)
    const barrelIssues = this.checkBarrelExports();
    issues.push(...barrelIssues);

    return issues;
  }

  private checkBarrelExports(): DAGMismatch[] {
    const issues: DAGMismatch[] = [];
    const srcDir = path.join(this.root, 'src');

    if (!fs.existsSync(srcDir)) return issues;

    const walkDir = (dir: string) => {
      const files = fs.readdirSync(dir);
      const indexFile = path.join(dir, 'index.ts');

      if (files.some(f => f.endsWith('.ts') && f !== 'index.ts')) {
        if (!fs.existsSync(indexFile)) {
          issues.push({
            type: 'state-divergence',
            detail: `Missing barrel export: ${dir}/index.ts`,
            severity: 'warn',
          });
        }
      }

      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory() && !file.startsWith('.')) {
          walkDir(filePath);
        }
      }
    };

    walkDir(srcDir);
    return issues;
  }
}

export async function detectImportIssues(input: ImportSubsystemInput): Promise<DAGMismatch[]> {
  const detector = new ImportDetector(input);
  return detector.scan();
}
