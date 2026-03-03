// @module spec-origin
// @exports SpecOrigin, SpecImportReceipt, isSpecOrigin, SPEC_ORIGIN_PATH, SPEC_IMPORT_RECEIPT_DIR, hasSpecOrigin, hasSpecOriginSync, specImportReceiptPath, writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit, loadSpecOrigin, loadSpecOriginAsync, sha256File, sha256, validateOriginHash
// @types SpecOrigin, SpecImportReceipt
// @entry roadmap

// Provenance tracking for spec-compiled DAGs.
// spec-origin.json records the engine, version, and content hashes at import time.
// SpecImportReceipt is the receipt type written to .roadmap/receipts/ on import.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface SpecOrigin {
  schemaVersion: 1;
  engine: string;       // e.g., "spec-kit"
  version: string;      // engine version
  compile_hash: string; // sha256 of compiled IR (spec-compiled.json)
  spec_sha: string;     // sha256 of source spec file(s)
  importedAt: string;   // ISO 8601
  dagId: string;
}

export interface SpecImportReceipt {
  schemaVersion: 1;
  type: 'spec-import';
  specOrigin: SpecOrigin;
  dagHash: string;   // sha256 of head.json at import time
  inputHash: string; // sha256 of all input files concatenated
  timestamp: string; // ISO 8601
}

export const SPEC_ORIGIN_PATH = '.roadmap/spec-origin.json';
export const SPEC_IMPORT_RECEIPT_DIR = '.roadmap/receipts';

export function isSpecOrigin(x: unknown): x is SpecOrigin {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o['schemaVersion'] === 1 &&
    typeof o['engine'] === 'string' &&
    typeof o['version'] === 'string' &&
    typeof o['compile_hash'] === 'string' &&
    typeof o['spec_sha'] === 'string' &&
    typeof o['importedAt'] === 'string' &&
    typeof o['dagId'] === 'string'
  );
}

export function specImportReceiptPath(specSha: string): string {
  return join(SPEC_IMPORT_RECEIPT_DIR, `spec-import-${specSha}.json`);
}

/** Async predicate: does .roadmap/spec-origin.json exist and parse as SpecOrigin? */
export async function hasSpecOrigin(repoRoot: string): Promise<boolean> {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  try {
    const raw = await readFile(p, 'utf-8');
    return isSpecOrigin(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** Sync predicate for use in validators: does .roadmap/spec-origin.json exist and parse as SpecOrigin? */
export function hasSpecOriginSync(repoRoot: string): boolean {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  if (!existsSync(p)) return false;
  try {
    return isSpecOrigin(JSON.parse(readFileSync(p, 'utf-8')));
  } catch {
    return false;
  }
}

/** Write spec-origin.json to .roadmap/. Creates directories as needed. */
export function writeSpecOrigin(repoRoot: string, origin: SpecOrigin): string {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(origin, null, 2) + '\n');
  return p;
}

/** Write a SpecImportReceipt to .roadmap/receipts/. Returns the receipt path. */
export function writeSpecImportReceipt(repoRoot: string, receipt: SpecImportReceipt): string {
  const dir = join(repoRoot, SPEC_IMPORT_RECEIPT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = join(dir, `spec-import-${receipt.specOrigin.spec_sha.slice(0, 12)}.json`);
  writeFileSync(p, JSON.stringify(receipt, null, 2) + '\n');
  return p;
}

/** Load and return SpecOrigin from .roadmap/spec-origin.json, or null if missing/invalid. */
export function loadSpecOrigin(repoRoot: string): SpecOrigin | null {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return isSpecOrigin(data) ? data : null;
  } catch {
    return null;
  }
}

/** Async variant of loadSpecOrigin. */
export async function loadSpecOriginAsync(repoRoot: string): Promise<SpecOrigin | null> {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  try {
    const raw = await readFile(p, 'utf-8');
    const data = JSON.parse(raw);
    return isSpecOrigin(data) ? data : null;
  } catch {
    return null;
  }
}

/** Compute SHA256 of a file's contents. */
export function sha256File(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/** Compute SHA256 of a string. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Validate that the spec file hasn't mutated since the DAG was created.
 * Compares current spec file SHA against the stored spec_sha.
 * Returns true if hashes match, false if spec has been modified or origin is missing.
 */
export function validateOriginHash(repoRoot: string, specFilePath: string): boolean {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) return false;
  if (!existsSync(specFilePath)) return false;
  const currentHash = sha256File(specFilePath);
  return currentHash === origin.spec_sha;
}

/**
 * Gate predicate: when spec-origin.json exists, direct head.json edits
 * (outside the import pipeline) are blocked. Returns null if allowed,
 * or an error message string if blocked.
 */
export function requireSpecOriginForEdit(repoRoot: string): { ok: true } | { ok: false; reason: string; fix: string } {
  if (!hasSpecOriginSync(repoRoot)) return { ok: true };
  return {
    ok: false,
    reason: 'This DAG was imported from a spec-compiled source. Direct head.json edits are blocked.',
    fix: 'Re-run the spec pipeline: roadmap import --spec-compiled <path> --note "..."',
  };
}
