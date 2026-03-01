// @module verify/kernel-config
// @exports DEFAULT_INVARIANTS, KERNEL_INVARIANTS

export const DEFAULT_INVARIANTS = [
  'CLI_COMPLIANCE',
] as const;

export const KERNEL_INVARIANTS = [
  'CLI_COMPLIANCE',
  'CLI_COMPLIANCE_FULL',
] as const;

export type InvariantId = typeof KERNEL_INVARIANTS[number];
