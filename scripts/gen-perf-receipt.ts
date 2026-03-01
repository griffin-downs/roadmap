import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import type { PerfReceipt, TestTiming, ModuleHotspot, EnvFingerprint } from '../src/lib/perf/perf-schema.ts';

const start = Date.now();
let vitestOutput: string;
try {
  vitestOutput = execSync('ROADMAP_VALIDATING=1 npx vitest run --reporter=json 2>/dev/null', {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, ROADMAP_VALIDATING: '1' },
  });
} catch (e: any) {
  // vitest may exit non-zero if tests fail, but we still get JSON output
  vitestOutput = e.stdout || '';
}
const wallClock = Date.now() - start;

// Parse vitest JSON output
let vitest: any;
try {
  // Find the JSON object in the output (may have non-JSON prefix)
  const jsonStart = vitestOutput.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON found in vitest output');
  vitest = JSON.parse(vitestOutput.slice(jsonStart));
} catch (err) {
  console.error('Failed to parse vitest output, generating minimal receipt');
  vitest = { testResults: [], numTotalTests: 0, numPassedTests: 0, numFailedTests: 0 };
}

// Extract test timings
const timings: TestTiming[] = [];
const moduleMap = new Map<string, { total: number; count: number }>();

for (const suite of (vitest.testResults || [])) {
  const file = suite.name?.replace(process.cwd() + '/', '') || 'unknown';
  const suiteTime = suite.duration ?? (suite.endTime - suite.startTime) ?? 0;

  const mod = moduleMap.get(file) || { total: 0, count: 0 };
  mod.total += suiteTime;

  for (const test of (suite.assertionResults || [])) {
    mod.count++;
    timings.push({
      file,
      name: test.fullName || test.title || 'unknown',
      duration: test.duration ?? 0,
    });
  }
  moduleMap.set(file, mod);
}

// Sort timings by duration descending, take top 20
timings.sort((a, b) => b.duration - a.duration);
const slowest = timings.slice(0, 20);

// Module hotspots
const hotspots: ModuleHotspot[] = Array.from(moduleMap.entries())
  .map(([mod, data]) => ({
    module: mod,
    totalDuration: data.total,
    testCount: data.count,
  }))
  .sort((a, b) => b.totalDuration - a.totalDuration);

// Env fingerprint
const env: EnvFingerprint = {
  node: process.versions.node,
  os: `${platform()}-${arch()}`,
  ci: !!(process.env.CI || process.env.GITHUB_ACTIONS),
  cpuModel: cpus()[0]?.model,
  timestamp: new Date().toISOString(),
};

const receipt: PerfReceipt = {
  wallClock,
  testCount: vitest.numTotalTests ?? timings.length,
  passCount: vitest.numPassedTests ?? 0,
  failCount: vitest.numFailedTests ?? 0,
  slowest,
  hotspots,
  env,
};

writeFileSync('.perf/vitest/LATEST.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({
  ok: true,
  wallClock,
  testCount: receipt.testCount,
  passCount: receipt.passCount,
  failCount: receipt.failCount,
  slowestFile: slowest[0]?.file ?? 'none',
}));
