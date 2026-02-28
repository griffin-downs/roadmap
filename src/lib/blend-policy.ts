// @module blend-policy
// @exports GuardRegistry, registerGuard, runGuards, BlendPolicyConfig
// @types GuardFn, GuardRegistry, BlendPolicyConfig
// @entry roadmap

import type { GuardResult } from './blend-receipt.ts';

export type GuardFn<T = unknown> = (input: T) => GuardResult;

export interface BlendPolicyConfig {
  guards: Array<{ name: string; params?: Record<string, unknown> }>;
}

export class GuardRegistry {
  private guards = new Map<string, GuardFn>();

  register(name: string, fn: GuardFn): void {
    this.guards.set(name, fn);
  }

  /** Run all guards listed in policy. Missing guard name = hard error. */
  run<T>(input: T, policy: BlendPolicyConfig): GuardResult[] {
    return policy.guards.map(({ name }) => {
      const fn = this.guards.get(name);
      if (!fn) throw new Error(`GuardRegistry: unknown guard '${name}' — register it before use`);
      return fn(input);
    });
  }
}
