#!/usr/bin/env node
import { executeFlow } from '../src/lib/metaflow/phases/execute-flow.ts';

async function main() {
  try {
    const report = await executeFlow(process.cwd(), 'optimizer-iter-1');
    console.log('Flow execution report:');
    console.log(`  Passed: ${report.passed}`);
    console.log(`  Steps: ${report.steps.length}`);
    for (const step of report.steps) {
      console.log(`    ${step.stepId}: ${step.passed ? '✓' : '✗'} (${step.duration}ms)`);
      if (step.error) console.log(`      Error: ${step.error}`);
    }
    process.exit(report.passed ? 0 : 1);
  } catch (e) {
    console.error('Flow execution failed:', e);
    process.exit(1);
  }
}

main();
