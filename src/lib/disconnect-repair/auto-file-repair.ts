// Auto-repair: file organization — detect misplaced files + generate repair plans

import fs from 'fs';
import path from 'path';
import { RepairOperation } from '../disconnect-detector/types.js';

export interface FilePlacementIssue {
  file: string;
  currentDomain: string;
  suggestedDomain: string;
  reason: string;
}

export class FileRepairPlanner {
  private root: string;
  private domainDirs: Set<string>;

  constructor(root: string) {
    this.root = root;
    this.domainDirs = new Set(['src', 'tests', 'bin', 'scripts', '.roadmap', '.specify']);
  }

  detectMisplacements(): FilePlacementIssue[] {
    const issues: FilePlacementIssue[] = [];
    const srcDir = path.join(this.root, 'src');

    if (!fs.existsSync(srcDir)) return issues;

    const walkDir = (dir: string, relativePath: string = '') => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.startsWith('.')) continue;

        const filePath = path.join(dir, file);
        const rel = relativePath ? `${relativePath}/${file}` : file;

        if (fs.statSync(filePath).isDirectory()) {
          walkDir(filePath, rel);
        } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          // Check if file should be in a different domain
          const domain = this.detectDomain(rel);
          if (domain && !rel.startsWith(domain)) {
            issues.push({
              file: rel,
              currentDomain: this.extractDomain(rel),
              suggestedDomain: domain,
              reason: `File pattern suggests it belongs in ${domain}/`,
            });
          }
        }
      }
    };

    walkDir(srcDir);
    return issues;
  }

  generateRepairPlan(issues: FilePlacementIssue[]): RepairOperation[] {
    return issues.map((issue, idx) => ({
      id: `repair-file-${idx}`,
      type: 'move',
      target: path.join('src', issue.currentDomain, issue.file),
      action: `Move to src/${issue.suggestedDomain}/${path.basename(issue.file)}`,
      destructive: false,
      approvalRequired: false,
    }));
  }

  private detectDomain(relativePath: string): string | null {
    const patterns: Record<string, RegExp> = {
      'roadmap': /roadmap|dag|plan/i,
      'metaflow': /metaflow|flow|session/i,
      'spec': /spec|specification/i,
      'detector': /detect|audit/i,
      'repair': /repair|fix/i,
    };

    for (const [domain, pattern] of Object.entries(patterns)) {
      if (pattern.test(relativePath)) {
        return domain;
      }
    }

    return null;
  }

  private extractDomain(filePath: string): string {
    const parts = filePath.split('/');
    return parts[0] || 'lib';
  }
}

export function detectFileOrganizationIssues(root: string): FilePlacementIssue[] {
  const planner = new FileRepairPlanner(root);
  return planner.detectMisplacements();
}

export function generateFileRepairPlan(root: string): RepairOperation[] {
  const planner = new FileRepairPlanner(root);
  const issues = planner.detectMisplacements();
  return planner.generateRepairPlan(issues);
}
