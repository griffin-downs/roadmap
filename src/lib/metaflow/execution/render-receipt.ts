// @module metaflow/render-receipt
// @exports writeRenderReceipt, readRenderReceipt, lastRenderReceipt, requireRenderReceipt, RenderReceiptError
// @entry roadmap/metaflow

// Render receipts: .roadmap/render/<cmd>-<treeSha>.md + .roadmap/render/<cmd>-<treeSha>.json
// Required for interactive commands. Missing receipt → error on verify.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const RENDER_DIR = (root: string): string => join(root, ".roadmap", "render");

const mdPath = (root: string, cmd: string, treeSha: string): string =>
  join(RENDER_DIR(root), `${cmd}-${treeSha}.md`);

const jsonPath = (root: string, cmd: string, treeSha: string): string =>
  join(RENDER_DIR(root), `${cmd}-${treeSha}.json`);

// --- Schema ---

export interface RenderReceipt {
  schemaVersion: 1;
  cmd: string;
  treeSha: string;
  renderedAt: string; // ISO 8601
  plain: string;
  envelope: unknown; // last JSON envelope — opaque to this module
}

function isRenderReceipt(x: unknown): x is RenderReceipt {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    r["schemaVersion"] === 1 &&
    typeof r["cmd"] === "string" &&
    typeof r["treeSha"] === "string" &&
    typeof r["renderedAt"] === "string" &&
    typeof r["plain"] === "string" &&
    "envelope" in r
  );
}

// --- Error ---

export class RenderReceiptError extends Error {
  constructor(
    public readonly code:
      | "RECEIPT_MISSING"
      | "RECEIPT_MALFORMED"
      | "RENDER_DIR_EMPTY",
    message: string,
  ) {
    super(message);
    this.name = "RenderReceiptError";
  }
}

// --- Core ---

/** Write a render receipt pair (.md + .json) for cmd+treeSha. */
export function writeRenderReceipt(
  root: string,
  cmd: string,
  treeSha: string,
  plain: string,
  envelope: unknown,
): RenderReceipt {
  mkdirSync(RENDER_DIR(root), { recursive: true });
  const receipt: RenderReceipt = {
    schemaVersion: 1,
    cmd,
    treeSha,
    renderedAt: new Date().toISOString(),
    plain,
    envelope,
  };
  writeFileSync(mdPath(root, cmd, treeSha), plain);
  writeFileSync(jsonPath(root, cmd, treeSha), JSON.stringify(receipt, null, 2));
  return receipt;
}

/** Read a render receipt by cmd+treeSha. Throws if missing or malformed. */
export function readRenderReceipt(
  root: string,
  cmd: string,
  treeSha: string,
): RenderReceipt {
  const p = jsonPath(root, cmd, treeSha);
  if (!existsSync(p))
    throw new RenderReceiptError(
      "RECEIPT_MISSING",
      `Render receipt not found: ${p}`,
    );
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  if (!isRenderReceipt(raw))
    throw new RenderReceiptError(
      "RECEIPT_MALFORMED",
      `Render receipt failed schema validation: ${p}`,
    );
  return raw;
}

/** Return the most recently written receipt in the render dir. Throws if none exist. */
export function lastRenderReceipt(root: string): RenderReceipt {
  const dir = RENDER_DIR(root);
  if (
    !existsSync(dir) ||
    readdirSync(dir).filter((f) => f.endsWith(".json")).length === 0
  )
    throw new RenderReceiptError(
      "RENDER_DIR_EMPTY",
      `No render receipts found in ${dir}`,
    );

  const entries = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = join(dir, f);
      const raw = JSON.parse(readFileSync(p, "utf-8"));
      return isRenderReceipt(raw) ? raw : null;
    })
    .filter((r): r is RenderReceipt => r !== null)
    .sort((a, b) => b.renderedAt.localeCompare(a.renderedAt));

  if (entries.length === 0)
    throw new RenderReceiptError(
      "RENDER_DIR_EMPTY",
      `No valid render receipts found in ${dir}`,
    );
  return entries[0]!;
}

/**
 * Assert a render receipt exists for cmd+treeSha.
 * Use at the top of interactive commands that require prior render.
 */
export function requireRenderReceipt(
  root: string,
  cmd: string,
  treeSha: string,
): RenderReceipt {
  return readRenderReceipt(root, cmd, treeSha);
}
