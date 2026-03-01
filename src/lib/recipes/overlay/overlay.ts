// @module overlay
// @exports CandidateNode, OverlayRecord, OverlayReceipt, OVERLAY_DIR, isOverlayRecord, isOverlayReceipt
// @types CandidateNode, OverlayRecord, OverlayReceipt
// @entry roadmap

/** A node derived from intake, not yet merged into the DAG. */
export interface CandidateNode {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  /** Intake ID this candidate was derived from. */
  sourceIntakeId: string;
  /** Cluster index within the intake decomposition. */
  clusterIndex: number;
}

/** Overlay snapshot — candidate nodes staged for future --apply. */
export interface OverlayRecord {
  overlayId: string;
  intakeId: string;
  headSha: string;
  treeSha: string;
  timestamp: string;
  candidateNodes: CandidateNode[];
  /** Always false until --apply merges into the DAG. */
  applied: false;
}

/** Receipt emitted after overlay creation. */
export interface OverlayReceipt {
  schemaVersion: 1;
  receiptType: 'plan-overlay';
  overlayId: string;
  intakeId: string;
  headSha: string;
  treeSha: string;
  candidateCount: number;
  timestamp: string;
}

export const OVERLAY_DIR = '.roadmap/overlays' as const;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isOverlayRecord(x: unknown): x is OverlayRecord {
  if (!isObject(x)) return false;
  return (
    typeof x.overlayId === 'string' &&
    typeof x.intakeId === 'string' &&
    typeof x.headSha === 'string' &&
    typeof x.treeSha === 'string' &&
    typeof x.timestamp === 'string' &&
    Array.isArray(x.candidateNodes) &&
    x.applied === false
  );
}

export function isOverlayReceipt(x: unknown): x is OverlayReceipt {
  if (!isObject(x)) return false;
  return (
    x.schemaVersion === 1 &&
    x.receiptType === 'plan-overlay' &&
    typeof x.overlayId === 'string' &&
    typeof x.intakeId === 'string' &&
    typeof x.headSha === 'string' &&
    typeof x.treeSha === 'string' &&
    typeof x.candidateCount === 'number' &&
    typeof x.timestamp === 'string'
  );
}
