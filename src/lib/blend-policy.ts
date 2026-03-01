// @module blend-policy
// @exports GuardFn, GuardRegistry, BlendPolicyConfig, BlendPolicyResult, BlendPolicyGuardEntry, loadBlendPolicy, blendWithPolicy
// @types GuardFn, GuardRegistry, BlendPolicyConfig, BlendPolicyResult, BlendPolicyGuardEntry
// @entry roadmap

// FR-GB-002: Guard registry + blendPolicy config.
// GuardRegistry maps guard names to GuardFn<T>.
// blendPolicy in kernel.json lists active guards and their parameters.
// blend() reads policy and runs registered guards in order.
// Missing guard name = hard error.

import type { GuardResult } from './blend-receipt.ts';
import { loadKernel } from './kernel-config.ts';

export type GuardFn<T = unknown> = (
  input: T,
  params: Record<string, unknown>,
) => GuardResult;

export interface BlendPolicyGuardEntry {
  name: string;
  params?: Record<string, unknown>;
  required?: boolean;
}

export interface BlendPolicyConfig {
  guards: BlendPolicyGuardEntry[];
}

export interface BlendPolicyResult {
  passed: boolean;
  results: GuardResult[];
  errors: string[];
}

export class GuardRegistry {
  private guards = new Map<string, { fn: GuardFn; description?: string }>();

  register(name: string, fn: GuardFn, description?: string): void {
    if (this.guards.has(name)) throw new Error(`Guard already registered: ${name}`);
    this.guards.set(name, { fn, description });
  }

  has(name: string): boolean {
    return this.guards.has(name);
  }

  list(): string[] {
    return [...this.guards.keys()].sort();
  }

  runOne<T>(name: string, input: T, params: Record<string, unknown> = {}): GuardResult {
    const entry = this.guards.get(name);
    if (!entry) throw new Error(`GuardRegistry: unknown guard '${name}'. Registered: ${this.list().join(', ')}`);
    return entry.fn(input, params);
  }

  /** Run all guards listed in policy, in order. Missing guard = hard error. */
  run<T>(input: T, policy: BlendPolicyConfig): GuardResult[] {
    return policy.guards.map(({ name, params }) => this.runOne(name, input, params ?? {}));
  }
}

export function loadBlendPolicy(repoRoot: string): BlendPolicyConfig {
  const kernel = loadKernel(repoRoot);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (kernel as any).blendPolicy;
  if (!raw || typeof raw !== 'object') return { guards: [] };
  if (!Array.isArray(raw.guards)) return { guards: [] };
  return { guards: raw.guards as BlendPolicyGuardEntry[] };
}

export function blendWithPolicy<T>(
  registry: GuardRegistry,
  policy: BlendPolicyConfig,
  context: T,
): BlendPolicyResult {
  const results: GuardResult[] = [];
  const errors: string[] = [];

  for (const entry of policy.guards) {
    if (!registry.has(entry.name)) {
      throw new Error(`blendPolicy references unknown guard: "${entry.name}". Registered: ${registry.list().join(', ')}`);
    }
    const result = registry.runOne(entry.name, context, entry.params ?? {});
    results.push(result);
    const required = entry.required !== false;
    if (!result.passed && required) {
      errors.push(`Guard "${entry.name}" failed: ${result.evidence ?? 'no evidence'}`);
    }
  }

  return { passed: errors.length === 0, results, errors };
}
