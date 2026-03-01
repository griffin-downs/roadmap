// @module metaflow/cli-sovereignty
// @exports cmdInit, cmdStatus, cmdList, cmdRun, cmdRender, cmdVerify, SovereigntyError
// @entry roadmap/metaflow

// Sovereignty subcommand handlers: init / status / list / run / render / verify.
// Each returns a plain data object — callers are responsible for JSON envelope.
// metaflow run requires authority.json (UNGOVERNED_REPO if absent).
// No second formatting system — callers apply --human renderer on the JSON envelope.

import {
  readAuthority,
  writeAuthority,
  verifyTreeSha,
  getTreeSha,
} from "./authority.ts";
import { loadFlowIndex, loadFlow, listFlows } from "./flows.ts";
import {
  writeRenderReceipt,
  lastRenderReceipt,
  requireRenderReceipt,
} from "./render-receipt.ts";
import type { AuthorityJson } from "./authority-schema.ts";
import type { Flow } from "./flow-schema.ts";
import type { RenderReceipt } from "./render-receipt.ts";

// --- Error ---

export class SovereigntyError extends Error {
  constructor(
    public readonly code:
      | "UNGOVERNED_REPO"
      | "TREASHA_MISMATCH"
      | "FLOW_NOT_FOUND"
      | "NO_RENDER_RECEIPT",
    message: string,
  ) {
    super(message);
    this.name = "SovereigntyError";
  }
}

// --- Result types ---

export interface InitResult {
  action: "created" | "already-governed";
  authority: AuthorityJson;
}

export interface StatusResult {
  governed: boolean;
  authority: AuthorityJson | null;
  treeShaMatch: boolean | null; // null when ungoverned
}

export interface ListResult {
  ids: string[];
  flows: Flow[];
}

export interface RunResult {
  flowId: string;
  flow: Flow;
  started: string; // ISO
}

export interface RenderResult {
  receipt: RenderReceipt;
  reRendered: boolean;
}

export interface VerifyResult {
  ok: boolean;
  checks: {
    governed: boolean;
    treeShaMatch: boolean;
    flowsValid: boolean;
  };
}

// --- Handlers ---

/**
 * metaflow init — write authority.json if absent; idempotent if present.
 * kernel defaults to "roadmap", stage to 0.
 */
export function cmdInit(
  root: string,
  opts: {
    kernel?: "roadmap" | "donjon";
    stage?: 0 | 1 | 2 | 3;
    receipt?: string;
  } = {},
): InitResult {
  const existing = readAuthority(root);
  if (existing !== null)
    return { action: "already-governed", authority: existing };

  let treeSha: string;
  try {
    treeSha = getTreeSha(root);
  } catch {
    treeSha = "0000000000000000000000000000000000000000";
  }

  const authority: AuthorityJson = {
    kernel: opts.kernel ?? "roadmap",
    stage: opts.stage ?? 0,
    treeSha,
    since: new Date().toISOString(),
    receipt: opts.receipt ?? "manual-init",
  };
  writeAuthority(root, authority);
  return { action: "created", authority };
}

/** metaflow status — returns governance state + treeSha liveness. */
export function cmdStatus(root: string): StatusResult {
  const authority = readAuthority(root);
  if (authority === null)
    return { governed: false, authority: null, treeShaMatch: null };
  const treeShaMatch = verifyTreeSha(root, authority);
  return { governed: true, authority, treeShaMatch };
}

/** metaflow list — enumerate all flows in the registry. */
export function cmdList(root: string): ListResult {
  const ids = loadFlowIndex(root);
  const flows = ids.map((id) => loadFlow(root, id));
  return { ids, flows };
}

/**
 * metaflow run <flowId> — requires authority.json; throws UNGOVERNED_REPO if absent.
 * Returns the flow and start timestamp; actual execution is orchestrated by the caller.
 */
export function cmdRun(root: string, flowId: string): RunResult {
  const authority = readAuthority(root);
  if (authority === null)
    throw new SovereigntyError(
      "UNGOVERNED_REPO",
      "No .governance/authority.json found. Run `roadmap metaflow init` first.",
    );

  const flow = loadFlow(root, flowId);
  return { flowId, flow, started: new Date().toISOString() };
}

/**
 * metaflow render --last — re-render from last receipt envelope + write new receipt.
 * If treeSha + cmd are provided, reads a specific receipt and re-writes it.
 */
export function cmdRender(
  root: string,
  opts: {
    cmd?: string;
    treeSha?: string;
    plain?: string;
    envelope?: unknown;
  } = {},
): RenderResult {
  if (opts.cmd && opts.treeSha && opts.plain !== undefined) {
    // Explicit render write
    const receipt = writeRenderReceipt(
      root,
      opts.cmd,
      opts.treeSha,
      opts.plain,
      opts.envelope ?? {},
    );
    return { receipt, reRendered: false };
  }

  // --last mode: re-render from last stored receipt
  const last = lastRenderReceipt(root);
  const receipt = writeRenderReceipt(
    root,
    last.cmd,
    last.treeSha,
    last.plain,
    last.envelope,
  );
  return { receipt, reRendered: true };
}

/**
 * metaflow verify — run all sovereignty invariant checks.
 * Returns ok:true only if all checks pass.
 */
export function cmdVerify(root: string): VerifyResult {
  const authority = readAuthority(root);
  const governed = authority !== null;
  const treeShaMatch = governed ? verifyTreeSha(root, authority!) : false;

  let flowsValid = true;
  try {
    listFlows(root);
  } catch {
    flowsValid = false;
  }

  return {
    ok: governed && treeShaMatch && flowsValid,
    checks: { governed, treeShaMatch, flowsValid },
  };
}
