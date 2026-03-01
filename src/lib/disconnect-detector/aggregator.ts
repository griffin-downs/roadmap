// Aggregator — collects findings from all 6 detector subsystems

import { DAGDetector } from './dag-subsystem.js';
import { FileDetector } from './file-subsystem.js';
import { ImportDetector } from './import-subsystem.js';
import { CompletionDetector } from './completion-subsystem.js';
import { ValidationDetector } from './validation-subsystem.js';
import { IntentDetector } from './intent-subsystem.js';
import { DisconnectReport } from './types.js';

export interface AggregatorInput {
  roadmapRoot: string;
}

export class DisconnectAggregator {
  private root: string;

  constructor(input: AggregatorInput) {
    this.root = input.roadmapRoot;
  }

  async analyze(): Promise<DisconnectReport> {
    const timestamp = Date.now();

    // Collect from all 6 subsystems in parallel
    const [dagReport, fileIssues, importIssues, completionIssues, validationIssues, intentIssues] =
      await Promise.all([
        new DAGDetector({ roadmapRoot: this.root }).scan(),
        new FileDetector({ roadmapRoot: this.root }).scan(),
        new ImportDetector({ roadmapRoot: this.root }).scan(),
        new CompletionDetector({ roadmapRoot: this.root }).scan(),
        new ValidationDetector({ roadmapRoot: this.root }).scan(),
        new IntentDetector({ roadmapRoot: this.root }).scan(),
      ]);

    // Determine severity
    const allIssues = [
      ...(dagReport.mismatches || []),
      ...fileIssues,
      ...importIssues,
      ...completionIssues,
      ...validationIssues,
      ...intentIssues,
    ];

    const hasErrors = allIssues.some(i => i.severity === 'error');
    const hasWarnings = allIssues.some(i => i.severity === 'warn');

    const severity: 'critical' | 'high' | 'medium' | 'low' = hasErrors
      ? 'critical'
      : hasWarnings
        ? 'high'
        : 'medium';

    // Generate summary
    const errorCount = allIssues.filter(i => i.severity === 'error').length;
    const warnCount = allIssues.filter(i => i.severity === 'warn').length;
    const infoCount = allIssues.filter(i => i.severity === 'info').length;

    const summary =
      errorCount > 0
        ? `${errorCount} errors found — system requires repair`
        : warnCount > 0
          ? `${warnCount} warnings detected — review recommended`
          : `${infoCount} info items — monitoring only`;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      dagReport,
      fileIssues,
      importIssues,
      completionIssues,
      validationIssues,
      intentIssues
    );

    return {
      timestamp,
      summary,
      findings: {
        dag: dagReport,
        files: fileIssues,
        imports: importIssues,
        completion: completionIssues,
        validation: validationIssues,
        intent: intentIssues,
      },
      recommendations,
      severity,
    };
  }

  private generateRecommendations(
    dag: any,
    files: any[],
    imports: any[],
    completion: any[],
    validation: any[],
    intent: any[]
  ): string[] {
    const recommendations: string[] = [];

    if (dag && dag.mismatches?.length > 0) {
      recommendations.push(
        'Run `roadmap show` to view current DAG state and check for divergence'
      );
    }

    if (files && files.length > 0) {
      recommendations.push('Review file organization — move orphaned/misplaced files to correct locations');
    }

    if (imports && imports.some(i => i.severity === 'error')) {
      recommendations.push(
        'Run `npx tsc --noEmit` to fix TypeScript errors and broken imports'
      );
    }

    if (completion && completion.some(i => i.severity === 'error')) {
      recommendations.push('Reconcile completed.json with head.json — run `roadmap plan select`');
    }

    if (validation && validation.some(i => i.severity === 'error')) {
      recommendations.push('Fix validation rules in head.json — missing paths or commands');
    }

    if (intent && intent.some(i => i.detail.includes('expansion'))) {
      recommendations.push('Expand plan nodes using `roadmap expand` to clarify vague requirements');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is healthy — no repairs needed');
    }

    return recommendations;
  }
}

export async function generateDisconnectReport(input: AggregatorInput): Promise<DisconnectReport> {
  const aggregator = new DisconnectAggregator(input);
  return aggregator.analyze();
}
