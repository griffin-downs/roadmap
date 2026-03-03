import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  type SpecOrigin,
  type SpecImportReceipt,
  isSpecOrigin,
  loadSpecOrigin,
  writeSpecOrigin,
  writeSpecImportReceipt,
  hasSpecOriginSync,
  validateOriginHash,
  sha256,
  sha256File,
  requireSpecOriginForEdit,
  SPEC_ORIGIN_PATH,
} from '../src/lib/intake/spec-origin.ts';
import {
  validateOriginComplete,
  validateOriginIntegrity,
  validateOriginVersion,
} from '../src/lib/intake/origin-validator.ts';

function makeOrigin(overrides?: Partial<SpecOrigin>): SpecOrigin {
  return {
    schemaVersion: 1,
    engine: 'spec-kit',
    version: '0.1.0',
    compile_hash: sha256('compiled-dag-content'),
    spec_sha: sha256('spec-file-content'),
    importedAt: new Date().toISOString(),
    dagId: 'test-dag',
    ...overrides,
  };
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-origin-test-'));
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  return root;
}

describe('SpecOrigin — type guard', () => {
  it('accepts valid SpecOrigin', () => {
    expect(isSpecOrigin(makeOrigin())).toBe(true);
  });

  it('rejects null', () => {
    expect(isSpecOrigin(null)).toBe(false);
  });

  it('rejects missing fields', () => {
    const partial = { schemaVersion: 1, engine: 'spec-kit' };
    expect(isSpecOrigin(partial)).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    expect(isSpecOrigin(makeOrigin({ schemaVersion: 2 as 1 }))).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isSpecOrigin('string')).toBe(false);
    expect(isSpecOrigin(42)).toBe(false);
    expect(isSpecOrigin([])).toBe(false);
  });
});

describe('SpecOrigin — load/save roundtrip', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('writeSpecOrigin + loadSpecOrigin roundtrips', () => {
    const origin = makeOrigin();
    writeSpecOrigin(repo, origin);
    const loaded = loadSpecOrigin(repo);
    expect(loaded).toEqual(origin);
  });

  it('loadSpecOrigin returns null when file missing', () => {
    expect(loadSpecOrigin(repo)).toBeNull();
  });

  it('loadSpecOrigin returns null for invalid JSON', () => {
    writeFileSync(join(repo, SPEC_ORIGIN_PATH), 'not json');
    expect(loadSpecOrigin(repo)).toBeNull();
  });

  it('loadSpecOrigin returns null for valid JSON but wrong shape', () => {
    writeFileSync(join(repo, SPEC_ORIGIN_PATH), JSON.stringify({ foo: 'bar' }));
    expect(loadSpecOrigin(repo)).toBeNull();
  });

  it('hasSpecOriginSync returns true after write', () => {
    writeSpecOrigin(repo, makeOrigin());
    expect(hasSpecOriginSync(repo)).toBe(true);
  });

  it('hasSpecOriginSync returns false when missing', () => {
    expect(hasSpecOriginSync(repo)).toBe(false);
  });
});

describe('SpecOrigin — hash validation', () => {
  let repo: string;
  let specFile: string;
  const specContent = 'feature: login\nscenario: valid credentials';

  beforeEach(() => {
    repo = makeRepo();
    specFile = join(repo, 'spec.md');
    writeFileSync(specFile, specContent);
    const origin = makeOrigin({ spec_sha: sha256(specContent) });
    writeSpecOrigin(repo, origin);
  });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('validateOriginHash returns true when spec unchanged', () => {
    expect(validateOriginHash(repo, specFile)).toBe(true);
  });

  it('validateOriginHash returns false when spec mutated', () => {
    writeFileSync(specFile, specContent + '\n# added line');
    expect(validateOriginHash(repo, specFile)).toBe(false);
  });

  it('validateOriginHash returns false when spec file missing', () => {
    expect(validateOriginHash(repo, join(repo, 'nonexistent.md'))).toBe(false);
  });

  it('validateOriginHash returns false when origin missing', () => {
    const emptyRepo = makeRepo();
    expect(validateOriginHash(emptyRepo, specFile)).toBe(false);
    rmSync(emptyRepo, { recursive: true, force: true });
  });

  it('sha256File matches manual hash', () => {
    const expected = createHash('sha256').update(specContent).digest('hex');
    expect(sha256File(specFile)).toBe(expected);
  });

  it('sha256 matches crypto directly', () => {
    const input = 'hello world';
    const expected = createHash('sha256').update(input).digest('hex');
    expect(sha256(input)).toBe(expected);
  });
});

describe('SpecOrigin — requireSpecOriginForEdit gate', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('allows edits when no origin exists', () => {
    const result = requireSpecOriginForEdit(repo);
    expect(result.ok).toBe(true);
  });

  it('blocks edits when origin exists', () => {
    writeSpecOrigin(repo, makeOrigin());
    const result = requireSpecOriginForEdit(repo);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('imported from a spec-compiled source');
      expect(result.fix).toContain('roadmap import');
    }
  });
});

describe('SpecImportReceipt — write + read', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('writeSpecImportReceipt creates receipt file', () => {
    const origin = makeOrigin();
    const receipt: SpecImportReceipt = {
      schemaVersion: 1,
      type: 'spec-import',
      specOrigin: origin,
      dagHash: sha256('dag-content'),
      inputHash: sha256('input'),
      timestamp: new Date().toISOString(),
    };
    const path = writeSpecImportReceipt(repo, receipt);
    const written = JSON.parse(readFileSync(path, 'utf-8'));
    expect(written.schemaVersion).toBe(1);
    expect(written.type).toBe('spec-import');
    expect(written.specOrigin.dagId).toBe('test-dag');
  });
});

describe('origin-validator — validateOriginComplete', () => {
  let repo: string;
  let specFile: string;
  let dagFile: string;
  const specContent = 'the spec';
  const dagContent = 'the dag';

  beforeEach(() => {
    repo = makeRepo();
    specFile = join(repo, 'spec.md');
    dagFile = join(repo, '.roadmap', 'head.json');
    writeFileSync(specFile, specContent);
    writeFileSync(dagFile, dagContent);
    writeSpecOrigin(repo, makeOrigin({
      spec_sha: sha256(specContent),
      compile_hash: sha256(dagContent),
    }));
  });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('returns valid when all checks pass', () => {
    const result = validateOriginComplete(repo, { specFilePath: specFile, dagPath: dagFile });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checks.originExists).toBe(true);
    expect(result.checks.originParseable).toBe(true);
    expect(result.checks.specHashMatch).toBe(true);
    expect(result.checks.dagHashMatch).toBe(true);
    expect(result.checks.versionCompatible).toBe(true);
  });

  it('returns invalid when origin missing', () => {
    const emptyRepo = makeRepo();
    const result = validateOriginComplete(emptyRepo);
    expect(result.valid).toBe(false);
    expect(result.checks.originExists).toBe(false);
    rmSync(emptyRepo, { recursive: true, force: true });
  });

  it('returns invalid when spec mutated', () => {
    writeFileSync(specFile, 'mutated content');
    const result = validateOriginComplete(repo, { specFilePath: specFile });
    expect(result.valid).toBe(false);
    expect(result.checks.specHashMatch).toBe(false);
    expect(result.errors.some(e => e.includes('spec_sha mismatch'))).toBe(true);
  });

  it('returns invalid when DAG mutated', () => {
    writeFileSync(dagFile, 'mutated dag');
    const result = validateOriginComplete(repo, { dagPath: dagFile });
    expect(result.valid).toBe(false);
    expect(result.checks.dagHashMatch).toBe(false);
  });

  it('skips spec check when specFilePath not provided', () => {
    const result = validateOriginComplete(repo);
    expect(result.checks.specHashMatch).toBeNull();
  });

  it('skips DAG check when dagPath not provided', () => {
    const result = validateOriginComplete(repo);
    expect(result.checks.dagHashMatch).toBeNull();
  });

  it('returns invalid for unparseable origin file', () => {
    writeFileSync(join(repo, SPEC_ORIGIN_PATH), '{ broken json');
    const result = validateOriginComplete(repo);
    expect(result.valid).toBe(false);
    expect(result.checks.originParseable).toBe(false);
  });
});

describe('origin-validator — validateOriginIntegrity', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('returns true with valid origin and no spec file', () => {
    writeSpecOrigin(repo, makeOrigin());
    expect(validateOriginIntegrity(repo)).toBe(true);
  });

  it('returns false without origin', () => {
    expect(validateOriginIntegrity(repo)).toBe(false);
  });

  it('returns true when spec file matches', () => {
    const content = 'spec content';
    const specFile = join(repo, 'spec.md');
    writeFileSync(specFile, content);
    writeSpecOrigin(repo, makeOrigin({ spec_sha: sha256(content) }));
    expect(validateOriginIntegrity(repo, specFile)).toBe(true);
  });

  it('returns false when spec file diverges', () => {
    const specFile = join(repo, 'spec.md');
    writeFileSync(specFile, 'changed');
    writeSpecOrigin(repo, makeOrigin({ spec_sha: sha256('original') }));
    expect(validateOriginIntegrity(repo, specFile)).toBe(false);
  });
});

describe('origin-validator — validateOriginVersion', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('returns true for supported version', () => {
    writeSpecOrigin(repo, makeOrigin({ schemaVersion: 1 }));
    expect(validateOriginVersion(repo)).toBe(true);
  });

  it('returns false when no origin', () => {
    expect(validateOriginVersion(repo)).toBe(false);
  });
});
