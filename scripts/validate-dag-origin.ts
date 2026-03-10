// @module validate-dag-origin
// @exports validateDagOrigin, ValidateResult
// Pre-commit gate: rejects DAG mutations without valid spec origin.
// Called from scripts/hooks/pre-commit when .roadmap/head.json is staged.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  code: 'valid' | 'missing-origin' | 'invalid-format' | 'invalid-hash' | 'dag-id-mismatch' | 'missing-mutation-receipt';
  message: string;
  fix?: string;
}

const HEAD_PATH = '.roadmap/head.json';
/** @deprecated legacy path, kept only for fallback reads */
const LEGACY_SPEC_ORIGIN_PATH = '.roadmap/spec-origin.json';

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

type LoadOriginResult =
  | { ok: true; origin: SpecOrigin; head: Record<string, unknown> | null }
  | { ok: false; code: 'missing-origin' | 'invalid-format'; message: string };

/** Load SpecOrigin from head.json._origin (canonical) or legacy spec-origin.json. */
function loadOrigin(repoRoot: string): LoadOriginResult {
  const headPath = join(repoRoot, HEAD_PATH);
  let head: Record<string, unknown> | null = null;

  if (existsSync(headPath)) {
    try {
      const parsed = JSON.parse(readFileSync(headPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        head = parsed as Record<string, unknown>;
        if ('_origin' in head) {
          if (isSpecOrigin(head['_origin'])) {
            return { ok: true, origin: head['_origin'] as SpecOrigin, head };
          }
          // _origin exists but is invalid format
          return {
            ok: false,
            code: 'invalid-format',
            message: 'Invalid: head.json._origin has wrong schema (expected schemaVersion=1, valid hashes)',
          };
        }
      }
    } catch { /* fall through to legacy */ }
  }

  // Legacy fallback: spec-origin.json
  const legacyPath = join(repoRoot, LEGACY_SPEC_ORIGIN_PATH);
  if (existsSync(legacyPath)) {
    let raw: string;
    try {
      raw = readFileSync(legacyPath, 'utf-8');
    } catch {
      return { ok: false, code: 'invalid-format', message: 'Corrupt: .roadmap/spec-origin.json is not valid JSON' };
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, code: 'invalid-format', message: 'Corrupt: .roadmap/spec-origin.json is not valid JSON' };
    }
    if (isSpecOrigin(data)) {
      return { ok: true, origin: data, head };
    }
    return {
      ok: false,
      code: 'invalid-format',
      message: 'Invalid: .roadmap/spec-origin.json has wrong schema (expected schemaVersion=1, valid hashes)',
    };
  }

  return {
    ok: false,
    code: 'missing-origin',
    message: 'Missing: head.json._origin (no spec provenance found)',
  };
}

export function validateDagOrigin(repoRoot: string): ValidateResult {
  // 1. Origin must exist (in head.json._origin or legacy spec-origin.json)
  const loaded = loadOrigin(repoRoot);

  if (!loaded.ok) {
    if (loaded.code === 'missing-origin') {
      return {
        ok: false,
        code: 'missing-origin',
        message: loaded.message,
        fix: 'DAGs must be created via: roadmap make <spec.json> --note "..."\n   Or restore origin: roadmap spec init --from <spec.json> --note "..."',
      };
    }
    return {
      ok: false,
      code: 'invalid-format',
      message: loaded.message,
      fix: 'Re-run the spec pipeline: roadmap make <spec.json> --note "..."',
    };
  }

  const { origin, head } = loaded;

  // 2. If head.json is loaded, verify dagId matches
  if (head !== null && 'id' in head) {
    if (head.id !== origin.dagId) {
      return {
        ok: false,
        code: 'dag-id-mismatch',
        message: `Mismatch: head.json id "${head.id}" != spec-origin dagId "${origin.dagId}"`,
        fix: 'The DAG was modified outside the spec pipeline. Re-import: roadmap make <spec.json> --note "..."',
      };
    }
  }

  // 3. If head.json changed, verify trail.jsonl has mutation receipts for this DAG
  const headPath = join(repoRoot, HEAD_PATH);
  const trailPath = join(repoRoot, '.roadmap/trail.jsonl');
  const DAG_MUTATION_CMDS = new Set(['dag.insert', 'dag.remove', 'dag.modify']);
  if (existsSync(headPath) && existsSync(trailPath)) {
    try {
      const headData = JSON.parse(readFileSync(headPath, 'utf-8'));
      const dagId = typeof headData === 'object' && headData !== null && 'id' in headData ? headData.id : null;
      if (dagId) {
        const lines = readFileSync(trailPath, 'utf-8').split('\n').filter((l: string) => l.trim());
        // Collect mutation receipts from trail.jsonl dag mutation events
        const mutationReceipts: { timestamp?: string }[] = [];
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (DAG_MUTATION_CMDS.has(entry.cmd) && entry.detail?.receipt) {
              const receipt = entry.detail.receipt;
              if (!receipt.dagId || receipt.dagId === dagId) {
                mutationReceipts.push(receipt);
              }
            }
          } catch { /* skip malformed lines */ }
        }
        // Valid if: no mutation entries yet (DAG created via make, no mutations)
        // or has at least one recent receipt (mutations tracked through CLI)
        if (mutationReceipts.length > 0) {
          const STALE_THRESHOLD_MS = 60_000;
          const now = Date.now();
          const hasRecentReceipt = mutationReceipts.some(entry => {
            if (!entry.timestamp) return false;
            const ts = new Date(entry.timestamp).getTime();
            return !isNaN(ts) && (now - ts) < STALE_THRESHOLD_MS;
          });
          if (!hasRecentReceipt) {
            return {
              ok: false,
              code: 'missing-mutation-receipt',
              message: `trail.jsonl has no recent mutation receipts for DAG "${dagId}" (all older than ${STALE_THRESHOLD_MS / 1000}s)`,
              fix: 'Use roadmap dag {insert,remove,modify} to mutate the DAG, not direct edits',
            };
          }
        }
      }
    } catch {
      // parse failure — non-fatal, other gates catch corruption
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
