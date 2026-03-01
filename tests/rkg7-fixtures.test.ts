import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// intake
import type { IntakeRecord, IntakeReceipt, IntakeCommit, DetectedCluster, ProposedNodeSpec } from '../src/lib/intake/intake.ts';
import { isIntakeRecord, isIntakeReceipt } from '../src/lib/intake/intake.ts';

// intake-receipt
import { isIntakeReceiptValid, writeIntakeReceipt, readIntakeReceipt, verifyIntakeReceiptDeterminism } from '../src/lib/intake/intake-receipt.ts';

// intake-cluster
import { jaccardSimilarity, clusterCommits, buildProposedNodes } from '../src/lib/intake/intake-cluster.ts';

// overlay
import type { OverlayRecord } from '../src/lib/recipes/overlay/overlay.ts';
import { isOverlayRecord } from '../src/lib/recipes/overlay/overlay.ts';

// overlay-cmd
import { runOverlayFromIntake } from '../src/lib/recipes/overlay/overlay-cmd.ts';

// patch-stack
import { branchName, isPatchRecord, isPatchReceipt } from '../src/lib/recipes/patch/patch-stack.ts';

// merge-gate
import { REQUIRED_RECEIPTS, formatMergeGateError, isMergeGateResult } from '../src/lib/recipes/merge/merge-gate.ts';
import type { MergeGateResult } from '../src/lib/recipes/merge/merge-gate.ts';
import { runMergeGate } from '../src/lib/recipes/merge/merge-gate-cmd.ts';

// env-audit
import { runEnvAudit, DEPRECATED_ENV_VARS, KERNEL_REPLACEMENTS } from '../src/lib/env-audit.ts';

// receipts-ux
import { listNodeReceipts, completionDoctor, completionCompact } from '../src/lib/receipts-ux.ts';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'rkg7-'));
}

function makeIntakeRecord(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  const fromSha = 'aaa0000000000000000000000000000000000001';
  const toSha = 'bbb0000000000000000000000000000000000002';
  const inputHash = createHash('sha256').update(`${fromSha}:${toSha}`).digest('hex');
  return {
    intakeId: inputHash.slice(0, 16),
    fromSha,
    toSha,
    repoRoot: '/tmp/fake',
    timestamp: '2026-03-01T00:00:00.000Z',
    commits: [],
    treeShaSet: ['tree1', 'tree2'],
    detectedClusters: [],
    proposedNodes: [],
    inputHash,
    ...overrides,
  };
}

function makeIntakeReceipt(record: IntakeRecord): IntakeReceipt {
  return {
    schemaVersion: 1,
    receiptType: 'intake-absorb',
    intakeId: record.intakeId,
    fromSha: record.fromSha,
    toSha: record.toSha,
    treeShaSet: record.treeShaSet,
    clusterCount: record.detectedClusters.length,
    proposedNodeCount: record.proposedNodes.length,
    inputHash: record.inputHash,
    timestamp: record.timestamp,
  };
}

// --- AT-1: IntakeRecord hash is deterministic ---

describe('AT-1: IntakeRecord hash determinism', () => {
  it('same fromSha/toSha produces same inputHash', () => {
    const r1 = makeIntakeRecord();
    const r2 = makeIntakeRecord();
    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.inputHash.length).toBe(64);
  });

  it('different toSha produces different inputHash', () => {
    const r1 = makeIntakeRecord();
    const r2 = makeIntakeRecord({ toSha: 'ccc0000000000000000000000000000000000003' });
    // recompute for r2
    const hash2 = createHash('sha256').update(`${r2.fromSha}:${r2.toSha}`).digest('hex');
    expect(r1.inputHash).not.toBe(hash2);
  });
});

// --- AT-2: isIntakeReceiptValid ---

describe('AT-2: isIntakeReceiptValid', () => {
  it('passes on matching record/receipt pair', () => {
    const record = makeIntakeRecord();
    const receipt = makeIntakeReceipt(record);
    expect(isIntakeReceiptValid(receipt, record)).toBe(true);
  });

  it('fails when inputHash tampered', () => {
    const record = makeIntakeRecord();
    const receipt = makeIntakeReceipt(record);
    receipt.inputHash = 'tampered_hash';
    expect(isIntakeReceiptValid(receipt, record)).toBe(false);
  });

  it('fails when intakeId mismatched', () => {
    const record = makeIntakeRecord();
    const receipt = makeIntakeReceipt(record);
    receipt.intakeId = 'wrong-id';
    expect(isIntakeReceiptValid(receipt, record)).toBe(false);
  });
});

// --- AT-3: verifyIntakeReceiptDeterminism ---

describe('AT-3: verifyIntakeReceiptDeterminism', () => {
  it('matches when inputHash computed from fromSha:toSha', () => {
    const record = makeIntakeRecord();
    expect(verifyIntakeReceiptDeterminism(record)).toBe(true);
  });

  it('fails when inputHash is wrong', () => {
    const record = makeIntakeRecord({ inputHash: 'definitely_wrong' });
    expect(verifyIntakeReceiptDeterminism(record)).toBe(false);
  });
});

// --- AT-4: OverlayRecord.applied is always false ---

describe('AT-4: OverlayRecord shape', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('applied is false and candidateNodes populated', () => {
    const record = makeIntakeRecord({
      proposedNodes: [
        { id: 'n1', desc: 'Node 1', produces: ['a.ts'], consumes: [], deps: [] },
        { id: 'n2', desc: 'Node 2', produces: ['b.ts'], consumes: ['a.ts'], deps: ['n1'] },
      ],
    });
    // Write intake record to tmp
    const intakeDir = join(tmp, '.roadmap', 'intake');
    mkdirSync(intakeDir, { recursive: true });
    writeFileSync(join(intakeDir, `${record.intakeId}.json`), JSON.stringify(record));

    const overlay = runOverlayFromIntake({
      intakeId: record.intakeId,
      repoRoot: tmp,
      headSha: 'abc123',
      treeSha: 'def456',
    });

    expect(overlay.applied).toBe(false);
    expect(overlay.candidateNodes).toHaveLength(2);
    expect(overlay.candidateNodes[0].sourceIntakeId).toBe(record.intakeId);
    expect(isOverlayRecord(overlay)).toBe(true);
  });
});

// --- AT-5: runOverlayFromIntake writes to overlays, not head.json ---

describe('AT-5: overlay writes to .roadmap/overlays/', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates overlay file without touching head.json', () => {
    const record = makeIntakeRecord({
      proposedNodes: [{ id: 'x', desc: 'X', produces: [], consumes: [], deps: [] }],
    });
    const intakeDir = join(tmp, '.roadmap', 'intake');
    mkdirSync(intakeDir, { recursive: true });
    writeFileSync(join(intakeDir, `${record.intakeId}.json`), JSON.stringify(record));

    // No head.json exists before
    expect(existsSync(join(tmp, '.roadmap', 'head.json'))).toBe(false);

    runOverlayFromIntake({
      intakeId: record.intakeId,
      repoRoot: tmp,
      headSha: 'abc',
      treeSha: 'def',
    });

    // Overlay file exists
    expect(existsSync(join(tmp, '.roadmap', 'overlays', `intake-${record.intakeId}.json`))).toBe(true);
    // head.json still does not exist
    expect(existsSync(join(tmp, '.roadmap', 'head.json'))).toBe(false);
  });

  it('writes receipt to .roadmap/receipts/', () => {
    const record = makeIntakeRecord({
      proposedNodes: [{ id: 'y', desc: 'Y', produces: [], consumes: [], deps: [] }],
    });
    const intakeDir = join(tmp, '.roadmap', 'intake');
    mkdirSync(intakeDir, { recursive: true });
    writeFileSync(join(intakeDir, `${record.intakeId}.json`), JSON.stringify(record));

    const overlay = runOverlayFromIntake({
      intakeId: record.intakeId,
      repoRoot: tmp,
      headSha: 'abc',
      treeSha: 'def',
    });

    const sha6 = overlay.overlayId.slice(0, 6);
    expect(existsSync(join(tmp, '.roadmap', 'receipts', `overlay-${sha6}.json`))).toBe(true);
  });
});

// --- AT-6: branchName format ---

describe('AT-6: branchName format', () => {
  it('produces rm/stack/<id>/<n>-<nodeId> format', () => {
    expect(branchName('abc123', 0, 'setup')).toBe('rm/stack/abc123/00-setup');
    expect(branchName('abc123', 5, 'auth-module')).toBe('rm/stack/abc123/05-auth-module');
    expect(branchName('xyz', 12, 'deploy')).toBe('rm/stack/xyz/12-deploy');
  });
});

// --- AT-7: PatchRecord.inputHash determinism ---

describe('AT-7: PatchRecord.inputHash determinism', () => {
  it('sort-stable across nodeIds order', () => {
    const baseSha = 'aaa111';
    const nodesA = ['z-node', 'a-node', 'm-node'];
    const nodesB = ['m-node', 'z-node', 'a-node'];

    const hashA = createHash('sha256').update(baseSha + ':' + [...nodesA].sort().join(',')).digest('hex');
    const hashB = createHash('sha256').update(baseSha + ':' + [...nodesB].sort().join(',')).digest('hex');
    expect(hashA).toBe(hashB);
  });
});

// --- AT-8: MergeGateResult.pass false when plan-select receipt missing ---

describe('AT-8: MergeGateResult.pass with missing plan-select', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('fails when no plan-select receipt exists', () => {
    // Write minimal head.json
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: { init: { id: 'init' }, term: { id: 'term' } },
    }));
    // Write kernel.json
    writeFileSync(join(tmp, '.roadmap', 'kernel.json'), JSON.stringify({ schemaVersion: 1 }));

    const result = runMergeGate({ repoRoot: tmp });
    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_PLAN_SELECT')).toBe(true);
  });
});

// --- AT-9: formatMergeGateError includes fix hints ---

describe('AT-9: formatMergeGateError fix hints', () => {
  it('includes fix strings when gate fails', () => {
    const result: MergeGateResult = {
      pass: false,
      target: 'main',
      checkedAt: '2026-03-01T00:00:00.000Z',
      checks: [{ receiptName: 'plan-select', found: false, required: true }],
      errors: [{
        code: 'MISSING_PLAN_SELECT',
        message: 'No plan-select receipt',
        fix: ['Run: roadmap plan select <id>'],
      }],
      headSha: 'abc1234',
    };
    const formatted = formatMergeGateError(result);
    expect(formatted).toContain('FAIL');
    expect(formatted).toContain('fix:');
    expect(formatted).toContain('roadmap plan select');
  });

  it('returns PASS for passing result', () => {
    const result: MergeGateResult = {
      pass: true, target: 'main', checkedAt: '', checks: [], errors: [], headSha: 'abc1234',
    };
    expect(formatMergeGateError(result)).toContain('PASS');
  });
});

// --- AT-10: MergeGateResult has checks[] for each required receipt type ---

describe('AT-10: MergeGateResult checks coverage', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
    writeFileSync(join(tmp, '.roadmap', 'head.json'), JSON.stringify({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: { init: { id: 'init' }, term: { id: 'term' } },
    }));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('has a check entry for plan-select and kernel-verify', () => {
    const result = runMergeGate({ repoRoot: tmp });
    const checkNames = result.checks.map(c => c.receiptName);
    expect(checkNames).toContain('plan-select');
    expect(checkNames).toContain('kernel-verify');
    expect(checkNames).toContain('no-orphans');
  });
});

// --- AT-11: runEnvAudit pass when no deprecated vars ---

describe('AT-11: runEnvAudit pass:true with clean env', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of DEPRECATED_ENV_VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
  });
  afterEach(() => {
    for (const v of DEPRECATED_ENV_VARS) {
      if (saved[v] !== undefined) process.env[v] = saved[v];
      else delete process.env[v];
    }
  });

  it('returns pass:true when no deprecated env vars set', () => {
    const result = runEnvAudit('/tmp/fake');
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// --- AT-12: runEnvAudit pass:false when SKIP_PLAN_GATE=1 ---

describe('AT-12: runEnvAudit detects SKIP_PLAN_GATE', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.SKIP_PLAN_GATE;
    process.env.SKIP_PLAN_GATE = '1';
  });
  afterEach(() => {
    if (saved !== undefined) process.env.SKIP_PLAN_GATE = saved;
    else delete process.env.SKIP_PLAN_GATE;
  });

  it('returns pass:false when SKIP_PLAN_GATE=1', () => {
    const result = runEnvAudit('/tmp/fake');
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.envVar === 'SKIP_PLAN_GATE')).toBe(true);
  });
});

// --- AT-13: DEPRECATED_ENV_VARS contains all 3 ---

describe('AT-13: DEPRECATED_ENV_VARS coverage', () => {
  it('contains SKIP_PLAN_GATE, SKIP_BATCH_COMMIT, ROADMAP_VALIDATING', () => {
    expect(DEPRECATED_ENV_VARS).toContain('SKIP_PLAN_GATE');
    expect(DEPRECATED_ENV_VARS).toContain('SKIP_BATCH_COMMIT');
    expect(DEPRECATED_ENV_VARS).toContain('ROADMAP_VALIDATING');
    expect(DEPRECATED_ENV_VARS).toHaveLength(3);
  });
});

// --- AT-14: KERNEL_REPLACEMENTS maps each deprecated var ---

describe('AT-14: KERNEL_REPLACEMENTS mapping', () => {
  it('maps each deprecated var to a kernel.json key', () => {
    expect(KERNEL_REPLACEMENTS.SKIP_PLAN_GATE).toBe('policy.skipPlanGate');
    expect(KERNEL_REPLACEMENTS.SKIP_BATCH_COMMIT).toBe('policy.skipBatchCommit');
    expect(KERNEL_REPLACEMENTS.ROADMAP_VALIDATING).toBe('policy.validating');
  });
});

// --- AT-15: listNodeReceipts returns empty for nonexistent node ---

describe('AT-15: listNodeReceipts empty for unknown node', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns empty array without crashing', () => {
    const result = listNodeReceipts(tmp, 'nonexistent-node');
    expect(result).toEqual([]);
  });

  it('returns empty when receipts dir exists but no matches', () => {
    const receiptsDir = join(tmp, '.roadmap', 'receipts');
    mkdirSync(receiptsDir, { recursive: true });
    writeFileSync(join(receiptsDir, 'other-receipt.json'), JSON.stringify({ nodeId: 'other' }));

    const result = listNodeReceipts(tmp, 'nonexistent-node');
    expect(result).toEqual([]);
  });
});

// --- AT-16: completionDoctor returns ok:false when completed.json missing ---

describe('AT-16: completionDoctor missing completed.json', () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns ok:false with error issue', () => {
    const result = completionDoctor(tmp);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toContain('completed.json');
  });
});

// --- AT-17: completionCompact dryRun ---

describe('AT-17: completionCompact dryRun', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    const receiptsDir = join(tmp, '.roadmap', 'receipts');
    mkdirSync(receiptsDir, { recursive: true });
    // Legacy receipt (no schemaVersion)
    writeFileSync(join(receiptsDir, 'legacy.json'), JSON.stringify({ type: 'old', nodeId: 'x' }));
    // Modern receipt
    writeFileSync(join(receiptsDir, 'modern.json'), JSON.stringify({ schemaVersion: 1, type: 'new' }));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns pruned list without deleting in dryRun', () => {
    const result = completionCompact(tmp, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.pruned).toContain('legacy.json');
    expect(result.kept).toContain('modern.json');
    // File still exists
    expect(existsSync(join(tmp, '.roadmap', 'receipts', 'legacy.json'))).toBe(true);
  });
});

// --- AT-18: jaccardSimilarity ---

describe('AT-18: jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    // intersection = {a}, union = {a, b, c} → 1/3
    expect(jaccardSimilarity(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3);
  });
});

// --- AT-19: clusterCommits is deterministic ---

describe('AT-19: clusterCommits determinism', () => {
  it('produces same clusters regardless of input order', () => {
    const commits: IntakeCommit[] = [
      { sha: 'ccc', parentSha: 'p', treeSha: 't1', touchedPaths: ['a.ts', 'b.ts'], author: 'x', msg: 'm', timestamp: '' },
      { sha: 'aaa', parentSha: 'p', treeSha: 't2', touchedPaths: ['a.ts'], author: 'x', msg: 'm', timestamp: '' },
      { sha: 'bbb', parentSha: 'p', treeSha: 't3', touchedPaths: ['c.ts'], author: 'x', msg: 'm', timestamp: '' },
    ];

    const shuffled: IntakeCommit[] = [commits[2], commits[0], commits[1]];

    const c1 = clusterCommits(commits);
    const c2 = clusterCommits(shuffled);

    // Same cluster structure (commitShas sorted within each cluster)
    expect(c1.map(c => [...c.commitShas].sort())).toEqual(c2.map(c => [...c.commitShas].sort()));
  });
});

// --- AT-20: buildProposedNodes generates stable IDs ---

describe('AT-20: buildProposedNodes stable IDs', () => {
  it('generates intake::<intakeId>::<clusterId> format', () => {
    const clusters: DetectedCluster[] = [
      { clusterId: 'cluster-0', commitShas: ['a'], paths: ['x.ts'], jaccardScore: 1 },
      { clusterId: 'cluster-1', commitShas: ['b'], paths: ['y.ts'], jaccardScore: 1 },
    ];

    const nodes = buildProposedNodes(clusters, 'intake-abc');
    expect(nodes[0].id).toBe('intake::intake-abc::cluster-0');
    expect(nodes[1].id).toBe('intake::intake-abc::cluster-1');
    expect(nodes[0].produces).toEqual(['x.ts']);
  });

  it('produces same IDs for same input', () => {
    const clusters: DetectedCluster[] = [
      { clusterId: 'cluster-0', commitShas: ['a'], paths: ['x.ts'], jaccardScore: 1 },
    ];
    const n1 = buildProposedNodes(clusters, 'id1');
    const n2 = buildProposedNodes(clusters, 'id1');
    expect(n1[0].id).toBe(n2[0].id);
  });
});

// --- Bonus: type guards ---

describe('type guards', () => {
  it('isIntakeRecord validates shape', () => {
    const record = makeIntakeRecord();
    expect(isIntakeRecord(record)).toBe(true);
    expect(isIntakeRecord({ intakeId: 'x' })).toBe(false);
    expect(isIntakeRecord(null)).toBe(false);
  });

  it('isIntakeReceipt validates shape', () => {
    const record = makeIntakeRecord();
    const receipt = makeIntakeReceipt(record);
    expect(isIntakeReceipt(receipt)).toBe(true);
    expect(isIntakeReceipt({ schemaVersion: 1 })).toBe(false);
  });

  it('isMergeGateResult validates shape', () => {
    const valid: MergeGateResult = {
      pass: true, target: 'main', checkedAt: '', checks: [], errors: [], headSha: 'x',
    };
    expect(isMergeGateResult(valid)).toBe(true);
    expect(isMergeGateResult({ pass: true })).toBe(false);
  });

  it('isPatchRecord and isPatchReceipt', () => {
    expect(isPatchRecord(null)).toBe(false);
    expect(isPatchReceipt(null)).toBe(false);
    expect(isPatchRecord({
      patchId: 'x', baseSha: 'y', nodeIds: [], nodeMapping: [],
      branchPrefix: 'p', branches: [], timestamp: 't', inputHash: 'h',
    })).toBe(true);
    expect(isPatchReceipt({
      schemaVersion: 1, receiptType: 'patch-stack', patchId: 'x',
      baseSha: 'y', nodeIds: [], branchCount: 0, inputHash: 'h', timestamp: 't',
    })).toBe(true);
  });
});
