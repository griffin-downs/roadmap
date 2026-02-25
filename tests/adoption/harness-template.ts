/**
 * Adoption scenario harness template.
 *
 * Each scenario follows this structure:
 * 1. Define a realistic Graph<T> for the scenario's domain
 * 2. Run the relevant protocol functions (define, check, verify, merge, branch, etc.)
 * 3. Record what worked, what errors were caught, timing
 * 4. Write a ScenarioResult JSON to tests/adoption/results/<id>.json
 *
 * Usage: copy this file, fill in the scenario body, run with:
 *   node --experimental-strip-types tests/adoption/scenario-NAME.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MetricsCollector, ScenarioResult } from './metrics-collector.ts';
import { createCollector } from './metrics-collector.ts';

export interface ScenarioSpec {
  id: string;
  name: string;
  desc: string;
}

export function runScenario(
  spec: ScenarioSpec,
  body: (metrics: MetricsCollector) => void | Promise<void>,
): Promise<ScenarioResult> {
  return new Promise(async (resolve, reject) => {
    const metrics = createCollector(spec.id, spec.name);
    const start = Date.now();

    try {
      await body(metrics);
      const result = metrics.finalize('pass', Date.now() - start);
      writeResult(spec.id, result);
      resolve(result);
    } catch (e) {
      const result = metrics.finalize('fail', Date.now() - start, e instanceof Error ? e.message : String(e));
      writeResult(spec.id, result);
      reject(result);
    }
  });
}

function writeResult(id: string, result: ScenarioResult): void {
  const dir = join(process.cwd(), 'tests/adoption/results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(result, null, 2));
}
