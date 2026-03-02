// @module artifact-gates-integration
// @exports integrateArtifactGates, ArtifactGatesIntegrationConfig, ArtifactGatesIntegrationResult
// @types ArtifactGatesIntegrationConfig, ArtifactGatesIntegrationResult
// @entry roadmap

/**
 * INTEGRATION GUIDE: ArtifactGates in the Validation Stack
 *
 * This module demonstrates how ArtifactGates integrates into the validateNode() flow
 * from protocol/validation.ts. It shows the pattern for:
 *
 * 1. Before completion: run artifact gates on the node
 * 2. Collect results: gates run in sequence and must all pass
 * 3. Fail if any gate fails: completion is blocked
 *
 * ============================================================================
 *
 * FLOW OVERVIEW:
 *
 *   User calls: roadmap complete <node-id>
 *         ↓
 *   CLI calls: integrateArtifactGates(nodeId, node, fileExists)
 *         ↓
 *   [Pre-gate check: are produces declared?]
 *         ↓
 *   [Run artifact gates in sequence]
 *      1. artifact-exists: check produces exist in working tree
 *      2. artifact-typecheck: check TypeScript compilation passes
 *      3. artifact-schema: validate JSON schemas (stubbed)
 *      4. artifact-hash: verify immutability (stubbed)
 *         ↓
 *   [Collect GateResult[] and check allGatesPassed()]
 *         ↓
 *   [If any gate failed: return error with evidence]
 *         ↓
 *   [If all gates passed: signal completion ready]
 *         ↓
 *   validateNode() continues with remaining validation rules
 *
 * ============================================================================
 *
 * CONTRACT WITH VALIDATION STACK:
 *
 * - ArtifactGates is called *before* validateNode() begins
 * - It gates the entire completion workflow — if any gate fails, completion stops
 * - It collects evidence in GateResult[] format
 * - It is idempotent: running multiple times produces same result (if artifacts unchanged)
 * - It respects ROADMAP_VALIDATING env var to prevent recursion
 *
 * ============================================================================
 *
 * INTEGRATION POINTS:
 *
 * 1. CLI: `bin/roadmap complete <node-id>`
 *    - Call integrateArtifactGates() before advancing
 *    - Collect GateResult[]
 *    - Fail with structured error if any gate failed
 *
 * 2. Validation.ts: validateNode() flow
 *    - ArtifactGates gates BEFORE rule validation
 *    - Artifacts must exist before any other validation rules run
 *    - Typecheck happens in artifact-gates, not in shell rules
 *
 * 3. Batch advancement: validateBatch()
 *    - All nodes in batch must pass artifact gates
 *    - All produces must exist after gates pass
 *    - artifact-exists rule is redundant if gates already passed
 *
 * ============================================================================
 *
 * ERROR HANDLING:
 *
 * If gates fail, completion is blocked with a structured error:
 * {
 *   code: 'ARTIFACT_GATE_FAILED',
 *   nodeId: string,
 *   failedGates: GateResult[] (only failed ones),
 *   allResults: GateResult[] (all results for context),
 *   message: string (human-readable)
 * }
 *
 * User must fix the issue and retry:
 *   roadmap complete <node-id> --retry
 *
 * ============================================================================
 */

import { ArtifactGates, GateResult, ArtifactGateConfig } from './artifact-gates.ts';

export interface ArtifactGatesIntegrationConfig {
  produces?: string[];
  srcPath?: string;
  schema?: string;
  artifactPath?: string;
  expectedHash?: string;
}

export interface ArtifactGatesIntegrationResult {
  passed: boolean;
  nodeId: string;
  gateResults: GateResult[];
  failedGates: GateResult[];
  evidence: string;
  message: string;
  timestamp: string;
}

/**
 * Integrate ArtifactGates into the validateNode() workflow.
 *
 * This function:
 * 1. Instantiates ArtifactGates with the repo root
 * 2. Builds the gate config from node produces + optional schema/hash
 * 3. Runs all gates before completion (artifact-exists, typecheck, schema, hash)
 * 4. Collects GateResult[] and checks if all passed
 * 5. Returns structured result for the CLI to handle
 *
 * Usage (in CLI complete handler):
 *
 *   const result = await integrateArtifactGates(nodeId, node, fileExists);
 *   if (!result.passed) {
 *     throw new RoadmapError('ARTIFACT_GATE_FAILED', {
 *       nodeId: result.nodeId,
 *       gateResults: result.allResults,
 *       message: result.message,
 *     });
 *   }
 *   // Continue with validateNode() and remaining validation rules
 *
 * @param nodeId - The node being completed
 * @param node - The node spec (has produces, validate rules, etc.)
 * @param fileExists - Predicate: (path: string) => boolean (from fileExists(root))
 * @returns ArtifactGatesIntegrationResult with passed/failed status and evidence
 */
export async function integrateArtifactGates(
  nodeId: string,
  node: {
    id: string;
    desc: string;
    produces?: string[];
    validate?: Array<{ type: string; [key: string]: any }>;
  },
  fileExists: (path: string) => boolean,
  repoRoot: string = process.cwd(),
): Promise<ArtifactGatesIntegrationResult> {
  const timestamp = new Date().toISOString();

  // Pre-gate check: if no produces, gates pass (nothing to validate)
  if (!node.produces || node.produces.length === 0) {
    return {
      passed: true,
      nodeId,
      gateResults: [],
      failedGates: [],
      evidence: 'no artifacts declared',
      message: `${nodeId}: no produces declared; artifact gates skipped`,
      timestamp,
    };
  }

  // Build gate config from node spec
  const gateConfig: ArtifactGateConfig = {
    produces: node.produces,
    srcPath: 'src', // default
    schema: undefined,
    artifactPath: undefined,
    expectedHash: undefined,
  };

  // Look for schema/hash hints in validate rules
  if (node.validate) {
    for (const rule of node.validate) {
      if (rule.type === 'artifact-schema' && rule.schema) {
        gateConfig.schema = rule.schema;
        gateConfig.artifactPath = rule.artifactPath || node.produces[0];
      }
      if (rule.type === 'artifact-hash' && rule.expectedHash) {
        gateConfig.expectedHash = rule.expectedHash;
        gateConfig.artifactPath = rule.artifactPath || node.produces[0];
      }
    }
  }

  // Instantiate gates and run validation
  const gates = new ArtifactGates(repoRoot);
  const gateResults = await gates.validateBeforeCompletion(nodeId, gateConfig);

  // Check if all gates passed
  const allPassed = gates.allGatesPassed(gateResults);
  const failedGates = gateResults.filter(r => !r.passed);

  // Format evidence for output
  const formattedResults = gates.formatResults(gateResults);
  const evidence = allPassed
    ? `All gates passed\n${formattedResults}`
    : `${failedGates.length} gate(s) failed\n${formattedResults}`;

  // Construct human-readable message
  const message = allPassed
    ? `${nodeId}: artifact gates passed (${gateResults.length} checks)`
    : `${nodeId}: ARTIFACT GATE FAILED — ${failedGates
        .map(r => `${r.gate}: ${r.error || r.evidence}`)
        .join('; ')}`;

  return {
    passed: allPassed,
    nodeId,
    gateResults,
    failedGates,
    evidence,
    message,
    timestamp,
  };
}

/**
 * Pattern example: integration in a completion handler (pseudo-code)
 *
 * This shows how a CLI command would use integrateArtifactGates
 * before completing a node and running remaining validation rules.
 *
 * NOT EXECUTABLE — shows integration pattern only.
 */
export async function patternExampleCompletionHandler(
  nodeId: string,
  node: { id: string; desc: string; produces?: string[]; validate?: Array<{ type: string }> },
  repoRoot: string,
): Promise<void> {
  console.log(`completing ${nodeId}...`);

  // Step 1: Run artifact gates before anything else
  const gateResult = await integrateArtifactGates(nodeId, node, (path: string) => {
    const fs = require('node:fs');
    return fs.existsSync(require('node:path').join(repoRoot, path));
  }, repoRoot);

  // Step 2: Fail if any gate failed (blocking)
  if (!gateResult.passed) {
    console.error(gateResult.message);
    console.error(`\nGate Details:\n${gateResult.evidence}`);
    throw new Error(`ARTIFACT_GATE_FAILED: ${gateResult.message}`);
  }

  // Step 3: Gates passed — continue with remaining validation
  console.log(gateResult.message);
  console.log(`\n${gateResult.evidence}`);

  // Now call validateNode() with other validation rules
  // (artifact-exists rule will be redundant but harmless — gates already checked)
  console.log(`\n${nodeId}: proceeding with remaining validation rules...`);

  // validateNode() call here...
}

/**
 * Pattern reference: How validateNode() interacts with artifact gates
 *
 * From protocol/validation.ts, the validateNode() flow:
 *
 * 1. PRE-GATE (artifact-gates-integration.ts):
 *    - Call integrateArtifactGates(nodeId, node, fileExists)
 *    - If failed: return error, do not continue
 *    - If passed: proceed to step 2
 *
 * 2. VALIDATION RULES (protocol/validation.ts):
 *    - For each rule in node.validate[]
 *    - Execute based on rule.type:
 *      'artifact-exists', 'artifact-schema', 'function', 'expanded',
 *      'manual-approval', 'shell', 'build-produces', 'launch-check',
 *      'runtime-explore', 'spec-conformance', 'intent'
 *    - Collect ValidationCheck[] results
 *    - If any rule failed: return { passed: false, ... }
 *
 * 3. POST-VALIDATION:
 *    - Check for failing intents with expandOnFail
 *    - Return final ValidationResult (passed/failed)
 *
 * ============================================================================
 * CONTRACT NOTES:
 * ============================================================================
 *
 * - Artifact gates run BEFORE all other validation rules
 * - Typecheck happens in artifact-gates (guard: ROADMAP_VALIDATING env var)
 * - artifact-exists rule is AFTER gates (redundant but harmless)
 * - artifact-schema rule is AFTER gates (stubbed in both places)
 * - artifact-hash rule is AFTER gates (stubbed in both places)
 *
 * Why gates are first:
 * - Artifacts must exist before any downstream validation can run
 * - Typecheck is expensive and must pass before other rules
 * - If artifacts don't exist, no point running schema/hash/spec checks
 *
 * ============================================================================
 */
