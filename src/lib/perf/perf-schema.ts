// @module perf
// @exports PerfReceipt, Baseline, Regression, TestTiming, ModuleHotspot, EnvFingerprint
// @entry roadmap/perf

/** Timing for a single test */
export interface TestTiming {
  file: string;
  name: string;
  duration: number; // ms
}

/** Module-level aggregate timing */
export interface ModuleHotspot {
  module: string;       // path relative to project root
  totalDuration: number; // ms — sum of all tests in module
  testCount: number;
}

/** Machine/env identity for cross-run comparability */
export interface EnvFingerprint {
  node: string;         // process.versions.node
  os: string;           // platform-arch
  ci: boolean;
  cpuModel?: string;
  timestamp: string;    // ISO 8601
}

/** Full receipt from a single vitest run */
export interface PerfReceipt {
  wallClock: number;           // ms — total run time
  testCount: number;           // total tests executed
  passCount: number;
  failCount: number;
  slowest: TestTiming[];       // top 20 by duration, descending
  hotspots: ModuleHotspot[];   // modules sorted by totalDuration, descending
  env: EnvFingerprint;
}

/** Reference timing snapshot for comparison */
export interface Baseline {
  receipt: PerfReceipt;
  label: string;               // e.g. "2026-03-01-master"
  commitSha: string;
}

/** Delta between current run and baseline */
export interface Regression {
  current: PerfReceipt;
  baseline: Baseline;
  deltaWallClock: number;      // ms — current - baseline (positive = slower)
  deltaPercent: number;        // percentage change
  threshold: number;           // ms — budget ceiling
  exceeded: boolean;           // deltaWallClock > threshold
  slowestFiles: TestTiming[];  // tests that regressed most vs baseline
}
