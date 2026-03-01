// Validation rule detector — scans for invalid/unrunnable validation rules
// + metric constraint detection (file counts, line counts, module balance)

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export interface MetricThresholds {
  maxFilesPerDir?: number;    // default 50
  maxLinesPerFile?: number;   // default 500
  balanceRatio?: number;      // max/min file count ratio across sibling dirs, default 5
}

export interface ValidationSubsystemInput {
  roadmapRoot: string;
  headPath?: string;
  metrics?: MetricThresholds;
  scanDirs?: string[];        // directories to scan for metrics (relative to root), default ['src']
}

export interface MetricViolation extends DAGMismatch {
  metric: 'file-count' | 'line-count' | 'module-balance';
  path: string;
  actual: number;
  threshold: number;
  repairOptions: MetricRepairOption[];
}

export interface MetricRepairOption {
  action: 'expand-node' | 'split-file' | 'move-files';
  description: string;
  target: string;
}

export class ValidationDetector {
  private root: string;
  private headPath: string;
  private metrics: Required<MetricThresholds>;
  private scanDirs: string[];

  constructor(input: ValidationSubsystemInput) {
    this.root = input.roadmapRoot;
    this.headPath = input.headPath || path.join(this.root, '.roadmap/head.json');
    this.metrics = {
      maxFilesPerDir: input.metrics?.maxFilesPerDir ?? 50,
      maxLinesPerFile: input.metrics?.maxLinesPerFile ?? 500,
      balanceRatio: input.metrics?.balanceRatio ?? 5,
    };
    this.scanDirs = input.scanDirs || ['src'];
  }

  async scan(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    // Validation rule checks (requires head.json)
    if (fs.existsSync(this.headPath)) {
      try {
        const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
        const nodes = head.nodes || head.dag?.nodes || {};

        for (const [nodeId, node] of Object.entries(nodes)) {
          const n = node as any;
          if (n.validate && Array.isArray(n.validate)) {
            for (const rule of n.validate) {
              const ruleIssues = this.validateRule(nodeId, rule);
              issues.push(...ruleIssues);
            }
          }
        }
      } catch (e) {
        issues.push({
          type: 'state-divergence',
          detail: `Failed to parse head.json validation rules: ${e instanceof Error ? e.message : String(e)}`,
          severity: 'warn',
        });
      }
    }

    // Metric constraint checks (filesystem-based)
    const metricIssues = this.scanMetrics();
    issues.push(...metricIssues);

    return issues;
  }

  scanMetrics(): MetricViolation[] {
    const violations: MetricViolation[] = [];

    for (const dir of this.scanDirs) {
      const absDir = path.join(this.root, dir);
      if (!fs.existsSync(absDir)) continue;

      this.checkFileCountRecursive(absDir, dir, violations);
      this.checkLineCountRecursive(absDir, dir, violations);
    }

    // Module balance: check sibling directories under each scan dir
    for (const dir of this.scanDirs) {
      const absDir = path.join(this.root, dir);
      if (!fs.existsSync(absDir)) continue;
      this.checkModuleBalance(absDir, dir, violations);
    }

    return violations;
  }

  private checkFileCountRecursive(absDir: string, relDir: string, violations: MetricViolation[]): void {
    if (!fs.existsSync(absDir)) return;

    const entries = fs.readdirSync(absDir);
    const files = entries.filter(e => {
      const full = path.join(absDir, e);
      return fs.existsSync(full) && fs.statSync(full).isFile();
    });

    if (files.length > this.metrics.maxFilesPerDir) {
      violations.push({
        type: 'state-divergence',
        detail: `Directory ${relDir} has ${files.length} files (max: ${this.metrics.maxFilesPerDir})`,
        severity: 'warn',
        metric: 'file-count',
        path: relDir,
        actual: files.length,
        threshold: this.metrics.maxFilesPerDir,
        repairOptions: [
          { action: 'expand-node', description: `Split ${relDir} into subdirectories`, target: relDir },
          { action: 'move-files', description: `Move excess files to domain subdirectories`, target: relDir },
        ],
      });
    }

    // Recurse into subdirectories
    const dirs = entries.filter(e => {
      const full = path.join(absDir, e);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });
    for (const sub of dirs) {
      this.checkFileCountRecursive(path.join(absDir, sub), `${relDir}/${sub}`, violations);
    }
  }

  private checkLineCountRecursive(absDir: string, relDir: string, violations: MetricViolation[]): void {
    if (!fs.existsSync(absDir)) return;

    const entries = fs.readdirSync(absDir);
    for (const entry of entries) {
      const full = path.join(absDir, entry);
      if (!fs.existsSync(full)) continue;
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        this.checkLineCountRecursive(full, `${relDir}/${entry}`, violations);
      } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8');
        const lineCount = content.split('\n').length;
        if (lineCount > this.metrics.maxLinesPerFile) {
          violations.push({
            type: 'state-divergence',
            detail: `File ${relDir}/${entry} has ${lineCount} lines (max: ${this.metrics.maxLinesPerFile})`,
            severity: 'warn',
            metric: 'line-count',
            path: `${relDir}/${entry}`,
            actual: lineCount,
            threshold: this.metrics.maxLinesPerFile,
            repairOptions: [
              { action: 'split-file', description: `Split ${entry} into smaller modules`, target: `${relDir}/${entry}` },
            ],
          });
        }
      }
    }
  }

  private checkModuleBalance(absDir: string, relDir: string, violations: MetricViolation[]): void {
    const entries = fs.readdirSync(absDir);
    const subdirs = entries.filter(e => {
      const full = path.join(absDir, e);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });

    if (subdirs.length < 2) return;

    const counts = subdirs.map(d => {
      const full = path.join(absDir, d);
      const files = fs.readdirSync(full).filter(f => {
        const fp = path.join(full, f);
        return fs.existsSync(fp) && fs.statSync(fp).isFile();
      });
      return { dir: d, count: files.length };
    }).filter(c => c.count > 0);

    if (counts.length < 2) return;

    const max = Math.max(...counts.map(c => c.count));
    const min = Math.min(...counts.map(c => c.count));

    if (min > 0 && max / min > this.metrics.balanceRatio) {
      const largest = counts.find(c => c.count === max)!;
      const smallest = counts.find(c => c.count === min)!;
      violations.push({
        type: 'state-divergence',
        detail: `Module imbalance under ${relDir}: ${largest.dir} has ${max} files vs ${smallest.dir} with ${min} (ratio ${(max / min).toFixed(1)}, max: ${this.metrics.balanceRatio})`,
        severity: 'info',
        metric: 'module-balance',
        path: relDir,
        actual: max / min,
        threshold: this.metrics.balanceRatio,
        repairOptions: [
          { action: 'move-files', description: `Redistribute files from ${largest.dir} to balance modules`, target: `${relDir}/${largest.dir}` },
          { action: 'expand-node', description: `Split ${largest.dir} into sub-modules`, target: `${relDir}/${largest.dir}` },
        ],
      });
    }
  }

  private validateRule(nodeId: string, rule: any): DAGMismatch[] {
    const issues: DAGMismatch[] = [];

    if (rule.type === 'artifact-exists') {
      if (!rule.path) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: artifact-exists rule missing 'path'`,
          severity: 'warn',
        });
      }
    } else if (rule.type === 'shell') {
      if (!rule.command) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: shell rule missing 'command'`,
          severity: 'warn',
        });
      }
    } else if (rule.type === 'spec-conformance') {
      if (!rule.spec || !rule.scenario) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: spec-conformance rule missing 'spec' or 'scenario'`,
          severity: 'warn',
        });
      } else if (!fs.existsSync(path.join(this.root, rule.spec))) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: spec file not found: ${rule.spec}`,
          severity: 'error',
        });
      }
    }

    return issues;
  }
}

export async function detectValidationIssues(input: ValidationSubsystemInput): Promise<DAGMismatch[]> {
  const detector = new ValidationDetector(input);
  return detector.scan();
}
