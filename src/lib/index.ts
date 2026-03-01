// Public API: High-level exports only
// Internal utilities: src/lib/internal/* (do not rely on these)

export { ValidatorRule, PerfReceipt, AuditSchema } from './schema';
export { define, verify, check, orient } from './protocol';

// Deprecated: re-exports removed
// See docs/MODULE-STRUCTURE.md for migration guide
