// @module metaflow/flow-schema
// @exports FlowValidateRule, FlowStep, Flow
// @entry roadmap/metaflow

// Schema for flow files stored under .roadmap/flows/<id>.json
// INDEX.json at .roadmap/flows/INDEX.json lists all flow ids.

export interface FlowValidateRule {
  type: "shell" | "artifact-exists";
  command?: string; // for shell
  target?: string; // for artifact-exists
}

export interface FlowStep {
  id: string;
  desc: string;
  cmd: string; // e.g. "roadmap orient" or "donjon verify"
  args: Record<string, unknown>;
  produces: string[];
  consumes: string[];
  validate: FlowValidateRule[];
  render: {
    required: boolean;
    template?: string;
  };
}

export interface Flow {
  schemaVersion: 1;
  id: string;
  desc: string;
  stageMin: number;
  stageMax: number;
  requiresAuthority: boolean; // default true
  steps: FlowStep[];
}

// --- Type guards ---

export function isFlowValidateRule(x: unknown): x is FlowValidateRule {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  if (r["type"] !== "shell" && r["type"] !== "artifact-exists") return false;
  if (r["command"] !== undefined && typeof r["command"] !== "string")
    return false;
  if (r["target"] !== undefined && typeof r["target"] !== "string")
    return false;
  return true;
}

export function isFlowStep(x: unknown): x is FlowStep {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  if (typeof s["id"] !== "string") return false;
  if (typeof s["desc"] !== "string") return false;
  if (typeof s["cmd"] !== "string") return false;
  if (typeof s["args"] !== "object" || s["args"] === null) return false;
  if (!Array.isArray(s["produces"])) return false;
  if (!Array.isArray(s["consumes"])) return false;
  if (!Array.isArray(s["validate"])) return false;
  if (!(s["validate"] as unknown[]).every(isFlowValidateRule)) return false;
  if (typeof s["render"] !== "object" || s["render"] === null) return false;
  const render = s["render"] as Record<string, unknown>;
  if (typeof render["required"] !== "boolean") return false;
  if (
    render["template"] !== undefined &&
    typeof render["template"] !== "string"
  )
    return false;
  return true;
}

export function isFlow(x: unknown): x is Flow {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  if (f["schemaVersion"] !== 1) return false;
  if (typeof f["id"] !== "string") return false;
  if (typeof f["desc"] !== "string") return false;
  if (typeof f["stageMin"] !== "number") return false;
  if (typeof f["stageMax"] !== "number") return false;
  if (typeof f["requiresAuthority"] !== "boolean") return false;
  if (!Array.isArray(f["steps"])) return false;
  if (!(f["steps"] as unknown[]).every(isFlowStep)) return false;
  return true;
}

export interface FlowIndex {
  ids: string[];
}

export function isFlowIndex(x: unknown): x is FlowIndex {
  if (typeof x !== "object" || x === null) return false;
  const idx = x as Record<string, unknown>;
  if (!Array.isArray(idx["ids"])) return false;
  if (!(idx["ids"] as unknown[]).every((id) => typeof id === "string"))
    return false;
  return true;
}
