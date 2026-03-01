// Roadmap protocol library (v0.7.0+)
// @module roadmap
// @exports define, verify, check, orient, ValidatorRule, AuditSchema
// 
// Architecture (post-v0.7.0 refactoring):
// 
// Public API (src/lib/index.ts):
//   - define, verify, check, orient
//   - ValidatorRule, AuditSchema types
// 
// Internal (src/lib/internal/*):
//   - CheckpointManager, RecoveryUtils
//   - ValidationInternals
//   - ErrorRecovery
// 
// CLI (src/cli/registry.ts):
//   - Unified command registry
//   - Automatic help + discovery
// 
// Tests (tests/{unit,integration,e2e}/{fast,slow}):
//   - Organized by concern + speed
//   - Fast suite for CI feedback
//   - Coverage baseline tracking

export { define, verify, check, orient } from './src/lib';
export { ValidatorRule, AuditSchema } from './src/lib/schema';
