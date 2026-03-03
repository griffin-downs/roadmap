// @module validate-dag-origin
// @exports validateDagOrigin, ValidateResult
// Pre-commit gate: rejects DAG mutations without valid spec origin.
// Called from scripts/hooks/pre-commit when .roadmap/head.json is staged.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Inline types to keep script self-contained for tsc --noEmit
interface SpecOrigin {
  schemaVersion: 1;
  engine: string;
  version: string;
  compile_hash: string;
  spec_sha: string;
  importedAt: string;
  dagId: string;
}

export interface ValidateResult {
  ok: boolean;
  code: 'valid' | 'missing-origin' | 'invalid-format' | 'invalid-hash' | 'dag-id-mismatch';
  message: string;
  fix?: string;
}

const SPEC_ORIGIN_PATH = '.roadmap/spec-origin.json';
const HEAD_PATH = '.roadmap/head.json';

function isSpecOrigin(x: unknown): x is SpecOrigin {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o['schemaVersion'] === 1 &&
    typeof o['engine'] === 'string' && o['engine'].length > 0 &&
    typeof o['version'] === 'string' && o['version'].length > 0 &&
    typeof o['compile_hash'] === 'string' && /^[a-f0-9]{64}$/.test(o['compile_hash'] as string) &&
    typeof o['spec_sha'] === 'string' && /^[a-f0-9]{64}$/.test(o['spec_sha'] as string) &&
    typeof o['importedAt'] === 'string' && o['importedAt'].length > 0 &&
    typeof o['dagId'] === 'string' && o['dagId'].length > 0
  );
}

export function validateDagOrigin(repoRoot: string): ValidateResult {
  const originPath = join(repoRoot, SPEC_ORIGIN_PATH);

  // 1. spec-origin.json must exist
  if (!existsSync(originPath)) {
    return {
      ok: false,
      code: 'missing-origin',
      message: 'Missing: .roadmap/spec-origin.json',
      fix: 'DAGs must be created via: roadmap make <spec.json> --note "..."\n   Or restore origin: roadmap spec init --from <spec.json> --note "..."',
    };
  }

  // 2. Must parse as valid SpecOrigin
  let origin: unknown;
  try {
    origin = JSON.parse(readFileSync(originPath, 'utf-8'));
  } catch {
    return {
      ok: false,
      code: 'invalid-format',
      message: 'Corrupt: .roadmap/spec-origin.json is not valid JSON',
      fix: 'Re-run the spec pipeline: roadmap make <spec.json> --note "..."',
    };
  }

  if (!isSpecOrigin(origin)) {
    return {
      ok: false,
      code: 'invalid-format',
      message: 'Invalid: .roadmap/spec-origin.json has wrong schema (expected schemaVersion=1, valid hashes)',
      fix: 'Re-run the spec pipeline: roadmap make <spec.json> --note "..."',
    };
  }

  // 3. If head.json exists, verify dagId matches
  const headPath = join(repoRoot, HEAD_PATH);
  if (existsSync(headPath)) {
    try {
      const head = JSON.parse(readFileSync(headPath, 'utf-8'));
      if (typeof head === 'object' && head !== null && 'id' in head) {
        if (head.id !== origin.dagId) {
          return {
            ok: false,
            code: 'dag-id-mismatch',
            message: `Mismatch: head.json id "${head.id}" != spec-origin dagId "${origin.dagId}"`,
            fix: 'The DAG was modified outside the spec pipeline. Re-import: roadmap make <spec.json> --note "..."',
          };
        }
      }
    } catch {
      // head.json parse failure is caught by other gates
    }
  }

  return { ok: true, code: 'valid', message: 'DAG origin validated' };
}

// CLI entry: exit 0 on valid, exit 1 on failure with formatted error
if (process.argv[1] && /validate-dag-origin/.test(process.argv[1])) {
  const root = process.argv[2] || process.cwd();
  const result = validateDagOrigin(root);
  if (!result.ok) {
    console.error(`\x1b[31m❌ DAG origin validation failed\x1b[0m`);
    console.error(`   ${result.message}`);
    if (result.fix) {
      console.error(`   Fix: ${result.fix}`);
    }
    process.exit(1);
  }
  process.exit(0);
}
