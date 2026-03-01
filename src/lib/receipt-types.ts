// @module receipt-types
// @exports ReceiptChainEntry, ReceiptChain, createReceiptEntry, verifyReceiptChain
// @types ReceiptChainEntry, ReceiptChain
// @entry roadmap

// FR-SPEC-003: Receipt chain types — compiled_sha256, dag_sha256, engine identity, input hashes.
// Shared type file for cryptographic provenance of node completions.

import type { SpecInput } from './intake/spec-ir.ts';

export interface ReceiptChainEntry {
  node_id: string;
  completed_at: string; // ISO timestamp
  compiled_sha256: string; // hash of spec-compiled.json that produced the DAG
  dag_sha256: string; // hash of head.json at completion time
  engine: { name: string; version: string | null };
  input_hashes: Array<{ path: string; sha256: string; role: string }>; // spec inputs at completion
  validator_results: Array<{ rule: string; passed: boolean; evidence: string }>;
  owner?: string;
}

export interface ReceiptChain {
  schema_version: 1;
  dag_id: string;
  entries: ReceiptChainEntry[];
}

// specMeta shape drawn from SpecIR — engine + inputs + metadata.compile_hash
interface SpecMeta {
  engine: { name: string; version: string | null; config_hash: string | null };
  inputs: SpecInput[];
  metadata: { compile_hash: string };
}

export function createReceiptEntry(
  nodeId: string,
  dagSha256: string,
  specMeta: SpecMeta,
  validatorResults: Array<{ rule: string; passed: boolean; evidence: string }>,
  owner?: string,
): ReceiptChainEntry {
  return {
    node_id: nodeId,
    completed_at: new Date().toISOString(),
    compiled_sha256: specMeta.metadata.compile_hash,
    dag_sha256: dagSha256,
    engine: { name: specMeta.engine.name, version: specMeta.engine.version },
    input_hashes: specMeta.inputs.map(i => ({ path: i.path, sha256: i.sha256, role: i.role })),
    validator_results: validatorResults,
    owner,
  };
}

export interface ReceiptChainVerification {
  valid: boolean;
  errors: string[];
}

export function verifyReceiptChain(chain: ReceiptChain): ReceiptChainVerification {
  const errors: string[] = [];

  if (chain.schema_version !== 1) {
    errors.push(`schema_version must be 1, got ${chain.schema_version}`);
  }

  // All entries must reference the same dag_id as the chain
  for (const entry of chain.entries) {
    // entries don't carry dag_id themselves — they're scoped to the chain's dag_id
    // validate completed_at is a valid ISO timestamp
    if (!entry.completed_at || isNaN(Date.parse(entry.completed_at))) {
      errors.push(`entry ${entry.node_id}: invalid completed_at timestamp "${entry.completed_at}"`);
    }
  }

  // Entries must be chronologically ordered (ascending)
  for (let i = 1; i < chain.entries.length; i++) {
    const prev = chain.entries[i - 1];
    const curr = chain.entries[i];
    if (Date.parse(curr.completed_at) < Date.parse(prev.completed_at)) {
      errors.push(
        `entries out of chronological order: ${prev.node_id} (${prev.completed_at}) after ${curr.node_id} (${curr.completed_at})`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
