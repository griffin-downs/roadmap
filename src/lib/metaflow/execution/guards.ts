// @module metaflow/guards
// @exports checkEnvBypass, writeBypassReceipt, BYPASS_ENV_VARS
// @entry roadmap/metaflow

// Env-variable bypass guards. SKIP_* vars are detected and logged but have
// zero effect on execution — any legitimate bypass requires a written receipt.
// No global state: all side effects are file writes under .roadmap/receipts/.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RECEIPTS_DIR = (root: string): string =>
  join(root, ".roadmap", "receipts");

/** All SKIP_* env var names that are recognized (but never honored). */
export const BYPASS_ENV_VARS = [
  "SKIP_PLAN_GATE",
  "SKIP_BATCH_COMMIT",
  "SKIP_VALIDATE",
  "SKIP_AUTHORITY",
  "SKIP_TREASHA",
] as const;

export interface BypassReceipt {
  schemaVersion: 1;
  ts: string; // ISO 8601
  passed: false;
  reason: string;
  detectedVars: string[];
}

/**
 * Scan process.env for SKIP_* bypass variables.
 * Logs a warning for each one found. Never alters behavior or throws.
 * Returns the list of detected variable names.
 */
export function checkEnvBypass(): string[] {
  const detected: string[] = [];
  for (const varName of BYPASS_ENV_VARS) {
    if (process.env[varName] !== undefined) {
      detected.push(varName);
      process.stderr.write(
        `[metaflow/guards] WARNING: ${varName} is set but has no effect on metaflow sovereignty checks. Use a bypass receipt instead.\n`,
      );
    }
  }
  return detected;
}

/**
 * Write a bypass receipt under .roadmap/receipts/bypass-<timestamp>.json.
 * Always writes passed:false. The receipt is an audit record, not authorization.
 */
export function writeBypassReceipt(
  root: string,
  reason: string,
): BypassReceipt {
  mkdirSync(RECEIPTS_DIR(root), { recursive: true });
  const ts = new Date().toISOString();
  const safe = ts.replace(/[:.]/g, "-");
  const detected = checkEnvBypass();

  const receipt: BypassReceipt = {
    schemaVersion: 1,
    ts,
    passed: false,
    reason,
    detectedVars: detected,
  };

  writeFileSync(
    join(RECEIPTS_DIR(root), `bypass-${safe}.json`),
    JSON.stringify(receipt, null, 2),
  );
  return receipt;
}
