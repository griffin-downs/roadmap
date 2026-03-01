// @module claims
// @exports loadClaims, saveClaims, isExpired, activeClaims, assignBatch, annotateWithClaims, detectStubOnlyChangeset, detectInsufficientReadProofs, detectNoFakePerf, ClaimRenderer
// @entry roadmap/claims

// Core claims (ownership, batch assignment)
export {
  loadClaims, saveClaims, isExpired, activeClaims,
  assignBatch, annotateWithClaims,
} from './claims.ts';
export type {
  NodeClaim, ClaimStore, ConflictPair, AssignResult, ClaimAnnotation,
} from './claims.ts';

// Detectors (stub detection, read-proof checks)
export {
  detectStubOnlyChangeset, detectInsufficientReadProofs, detectNoFakePerf,
} from './detectors.ts';
export type { DetectionResult } from './detectors.ts';

// Rendering
export { ClaimRenderer } from './render.ts';
export type { RenderResult } from './render.ts';
