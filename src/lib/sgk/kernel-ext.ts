// @module sgk/kernel-ext
// @exports SGKKernelConfig, loadSGKConfig, writeSGKDefaults
// @entry roadmap

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadKernel, type KernelConfig } from '../kernel-config.ts';

export interface SGKKernelConfig extends KernelConfig {
  requireRunId: boolean;
  allowDispatchAutoStrategy: boolean;
  allowUnevaluatedInitIntent: boolean;
  allowUnevaluatedTermIntent: boolean;
  breakglassEnabled: boolean;
}

const SGK_DEFAULTS: Pick<SGKKernelConfig, 'requireRunId' | 'allowDispatchAutoStrategy' | 'allowUnevaluatedInitIntent' | 'allowUnevaluatedTermIntent' | 'breakglassEnabled'> = {
  requireRunId: true,
  allowDispatchAutoStrategy: true,
  allowUnevaluatedInitIntent: false,
  allowUnevaluatedTermIntent: false,
  breakglassEnabled: true,
};

export function loadSGKConfig(base?: string): SGKKernelConfig {
  const root = base ?? process.cwd();
  const kernel = loadKernel(root);
  const path = join(root, '.roadmap', 'kernel.json');
  let raw: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { raw = JSON.parse(readFileSync(path, 'utf-8')); } catch { /* defaults */ }
  }
  return {
    ...kernel,
    requireRunId: typeof raw.requireRunId === 'boolean' ? raw.requireRunId : SGK_DEFAULTS.requireRunId,
    allowDispatchAutoStrategy: typeof raw.allowDispatchAutoStrategy === 'boolean' ? raw.allowDispatchAutoStrategy : SGK_DEFAULTS.allowDispatchAutoStrategy,
    allowUnevaluatedInitIntent: typeof raw.allowUnevaluatedInitIntent === 'boolean' ? raw.allowUnevaluatedInitIntent : SGK_DEFAULTS.allowUnevaluatedInitIntent,
    allowUnevaluatedTermIntent: typeof raw.allowUnevaluatedTermIntent === 'boolean' ? raw.allowUnevaluatedTermIntent : SGK_DEFAULTS.allowUnevaluatedTermIntent,
    breakglassEnabled: typeof raw.breakglassEnabled === 'boolean' ? raw.breakglassEnabled : SGK_DEFAULTS.breakglassEnabled,
  };
}

export function writeSGKDefaults(base?: string): void {
  const root = base ?? process.cwd();
  const path = join(root, '.roadmap', 'kernel.json');
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { existing = JSON.parse(readFileSync(path, 'utf-8')); } catch { /* start fresh */ }
  }
  const merged = { ...existing };
  for (const [key, val] of Object.entries(SGK_DEFAULTS)) {
    if (!(key in merged)) merged[key] = val;
  }
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n');
}
