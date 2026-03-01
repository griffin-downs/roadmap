// @module intake
// @exports scanIntake, importIntake, certifyIntake, IntakeRecord, IntakeCommit, IntakeReceipt, DetectedCluster, ProposedNodeSpec, INTAKE_DIR, INTAKE_RECEIPT_PREFIX, isIntakeReceipt
// @exports runIntakeAbsorb, IntakeAbsorbOptions
// @exports isIntakeReceiptValid, writeIntakeReceipt, readIntakeReceipt, verifyIntakeReceiptDeterminism, intakeReceiptPath
// @exports clusterCommits, buildProposedNodes, jaccardSimilarity
// @exports parseTasksMd, tasksToDAG, ParsedTask, ImportOptions
// @exports detectUnaccountedCommits, triggerAutoIntake, certifyAutoIntake, isPendingCertify, AutoIntakeResult
// @exports SpecIR, SpecIRTask, SpecConfig, SpecInput, compileIR, parseIRFile, defaultConfig, irTasksToParsed
// @exports isSpecOrigin, writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit, SPEC_ORIGIN_PATH, SpecOrigin, SpecImportReceipt
// @exports SpecClarifiedJson, SpecFeature, generateSpec
// @exports verifySpec

export * from './intake.ts';
export * from './intake-cmd.ts';
export * from './intake-receipt.ts';
export * from './intake-cluster.ts';
export * from './speckit-import.ts';
export * from './auto-intake.ts';
export * from './spec-ir.ts';
export * from './spec-origin.ts';
export * from './spec-generator.ts';
export * from './spec-verifier.ts';
