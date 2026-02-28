// @module kernel-enforcement
// @exports KernelEnforcementState, checkKernelEnforcement, getFederationRepos, syncFederationPolicy, FederationReceipt
// @entry roadmap

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadKernel } from './kernel-config.js';

export interface KernelEnforcementState {
  roadmapPresent: boolean;
  mergeGateEnforced: boolean;
  escapeDetectionEnabled: boolean;
  federationEnabled: boolean;
  federationRepos: string[];
}

export interface FederationReceipt {
  schemaVersion: 1;
  receiptType: 'federation-sync';
  syncId: string;
  sourceRepoRoot: string;
  targetRepo: string;
  syncedPolicyKeys: string[];
  timestamp: string;
}

// Extended kernel shape — federation + policy fields not yet in KernelConfig
interface KernelExt {
  policy?: {
    mergeGateEnforced?: boolean;
    escapeDetectionEnabled?: boolean;
  };
  federation?: {
    enabled?: boolean;
    repos?: string[];
  };
}

export function checkKernelEnforcement(repoRoot: string): KernelEnforcementState {
  const roadmapPresent = existsSync(join(repoRoot, '.roadmap'));
  if (!roadmapPresent) {
    return {
      roadmapPresent: false,
      mergeGateEnforced: false,
      escapeDetectionEnabled: false,
      federationEnabled: false,
      federationRepos: [],
    };
  }

  let ext: KernelExt = {};
  try {
    const kernel = loadKernel(repoRoot);
    ext = kernel as unknown as KernelExt;
  } catch {
    // defaults apply
  }

  return {
    roadmapPresent: true,
    mergeGateEnforced: ext.policy?.mergeGateEnforced ?? true,
    escapeDetectionEnabled: ext.policy?.escapeDetectionEnabled ?? true,
    federationEnabled: ext.federation?.enabled ?? false,
    federationRepos: ext.federation?.repos ?? [],
  };
}

export function getFederationRepos(repoRoot: string): string[] {
  try {
    const kernel = loadKernel(repoRoot);
    return (kernel as unknown as KernelExt).federation?.repos ?? [];
  } catch {
    return [];
  }
}

export function syncFederationPolicy(
  sourceRepoRoot: string,
  targetRepo: string,
  policyKeys: string[],
): FederationReceipt {
  const now = Date.now();
  const syncId = createHash('sha256')
    .update(sourceRepoRoot + ':' + targetRepo + ':' + now)
    .digest('hex');

  const receipt: FederationReceipt = {
    schemaVersion: 1,
    receiptType: 'federation-sync',
    syncId,
    sourceRepoRoot,
    targetRepo,
    syncedPolicyKeys: policyKeys,
    timestamp: new Date(now).toISOString(),
  };

  const receiptsDir = join(sourceRepoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  const shortSha = syncId.slice(0, 6);
  writeFileSync(
    join(receiptsDir, `federation-sync-${shortSha}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );

  return receipt;
}
