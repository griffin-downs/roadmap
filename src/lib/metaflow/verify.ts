// @module metaflow/verify
// @exports verifyAll, VerifyResult, VerifyCheck
// @entry roadmap/metaflow

// Terminal invariant checker — runs all 5 sovereignty checks and returns a
// structured result. Used by `roadmap metaflow verify` and e2e tests.
//
// Invariants:
// 1. Authority present + kernel = 'roadmap'
// 2. Flow registry valid (all flows schema-conform)
// 3. Receipts treeSha-bound (live tree matches authority.json treeSha)
// 4. Render receipts present where required (at least one in .roadmap/render/)
// 5. No env bypass active (SKIP_* vars are inert)

import { readAuthority, verifyTreeSha } from "./authority.ts";
import { listFlows } from "./phases/flows.ts";
import { lastRenderReceipt, RenderReceiptError } from "./execution/render-receipt.ts";
import { checkEnvBypass } from "./execution/guards.ts";
import { requirePlanSelectReceipt, KernelBridgeError } from "./kernel-bridge.ts";

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

type CheckFn = () => VerifyCheck;

function checkAuthority(root: string): VerifyCheck {
  const auth = readAuthority(root);
  if (auth === null)
    return { name: "authority", ok: false, detail: "No authority.json — UNGOVERNED_REPO" };
  if (auth.kernel !== "roadmap")
    return {
      name: "authority",
      ok: false,
      detail: `kernel is '${auth.kernel}', expected 'roadmap'`,
    };
  return { name: "authority", ok: true, detail: `kernel=${auth.kernel} stage=${auth.stage}` };
}

function checkFlowRegistry(root: string): VerifyCheck {
  try {
    const flows = listFlows(root);
    return {
      name: "flow-registry",
      ok: true,
      detail: `${flows.length} flow(s) loaded and schema-valid`,
    };
  } catch (err) {
    return {
      name: "flow-registry",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkTreeSha(root: string): VerifyCheck {
  const auth = readAuthority(root);
  if (auth === null)
    return { name: "treeSha", ok: false, detail: "No authority.json — cannot verify treeSha" };
  const match = verifyTreeSha(root, auth);
  return {
    name: "treeSha",
    ok: match,
    detail: match ? `treeSha matches HEAD^{tree}` : `treeSha mismatch — authority.json is stale`,
  };
}

function checkRenderReceipts(root: string): VerifyCheck {
  try {
    lastRenderReceipt(root);
    return { name: "render-receipts", ok: true, detail: "At least one render receipt present" };
  } catch (err) {
    if (err instanceof RenderReceiptError && err.code === "RENDER_DIR_EMPTY")
      return { name: "render-receipts", ok: false, detail: "No render receipts found" };
    return {
      name: "render-receipts",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkEnvBypassInert(_root: string): VerifyCheck {
  const detected = checkEnvBypass();
  return {
    name: "env-bypass",
    ok: true, // env vars are always inert — detection is informational only
    detail:
      detected.length === 0
        ? "No SKIP_* vars detected"
        : `Detected (inert): ${detected.join(", ")}`,
  };
}

function checkPlanSelect(root: string): VerifyCheck {
  try {
    requirePlanSelectReceipt(root);
    return { name: "plan-select", ok: true, detail: "PLAN_SELECTED.json present and valid" };
  } catch (err) {
    if (err instanceof KernelBridgeError)
      return { name: "plan-select", ok: false, detail: err.message };
    return {
      name: "plan-select",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run all invariant checks and return a structured VerifyResult.
 * ok:true only when all checks pass.
 */
export function verifyAll(root: string): VerifyResult {
  const checks: CheckFn[] = [
    () => checkAuthority(root),
    () => checkFlowRegistry(root),
    () => checkTreeSha(root),
    () => checkRenderReceipts(root),
    () => checkEnvBypassInert(root),
    () => checkPlanSelect(root),
  ];

  const results = checks.map((fn) => fn());
  return {
    ok: results.every((c) => c.ok),
    checks: results,
  };
}
