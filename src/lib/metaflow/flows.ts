// @module metaflow/flows
// @exports loadFlowIndex, loadFlow, listFlows, FlowLoadError
// @entry roadmap/metaflow

// Flow registry loader. Reads .roadmap/flows/INDEX.json + per-flow files.
// Validates each flow at load time — malformed flows are rejected with FlowLoadError.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Flow,
  type FlowIndex,
  isFlow,
  isFlowIndex,
} from "./phases/flow-schema.js";

export {
  type Flow,
  type FlowStep,
  type FlowValidateRule,
} from "./phases/flow-schema.js";

const FLOWS_DIR = (root: string) => join(root, ".roadmap", "flows");
const INDEX_FILE = (root: string) => join(FLOWS_DIR(root), "INDEX.json");
const FLOW_FILE = (root: string, id: string) =>
  join(FLOWS_DIR(root), `${id}.json`);

// --- Error ---

export class FlowLoadError extends Error {
  readonly code: string;
  readonly id?: string;

  constructor(code: string, message: string, id?: string) {
    super(message);
    this.code = code;
    this.id = id;
    this.name = "FlowLoadError";
  }
}

// --- Core ---

/**
 * Load .roadmap/flows/INDEX.json and return the list of flow ids.
 * Returns empty array if the directory or INDEX.json does not exist.
 */
export function loadFlowIndex(root: string): string[] {
  const indexPath = INDEX_FILE(root);
  if (!existsSync(indexPath)) return [];
  const raw = JSON.parse(readFileSync(indexPath, "utf-8"));
  if (!isFlowIndex(raw)) {
    throw new FlowLoadError(
      "INDEX_MALFORMED",
      `.roadmap/flows/INDEX.json exists but does not match FlowIndex schema`,
    );
  }
  return (raw as FlowIndex).ids;
}

/**
 * Load and validate a single flow file by id.
 * Throws FlowLoadError on missing file or schema mismatch.
 */
export function loadFlow(root: string, id: string): Flow {
  const flowPath = FLOW_FILE(root, id);
  if (!existsSync(flowPath)) {
    throw new FlowLoadError(
      "FLOW_NOT_FOUND",
      `Flow file not found: ${flowPath}`,
      id,
    );
  }
  const raw = JSON.parse(readFileSync(flowPath, "utf-8"));
  if (!isFlow(raw)) {
    throw new FlowLoadError(
      "FLOW_MALFORMED",
      `Flow file ${flowPath} does not match Flow schema`,
      id,
    );
  }
  return raw as Flow;
}

/**
 * Load all flows from the registry.
 * Missing index → empty list. Malformed index or flow → throws FlowLoadError.
 */
export function listFlows(root: string): Flow[] {
  const ids = loadFlowIndex(root);
  return ids.map((id) => loadFlow(root, id));
}
