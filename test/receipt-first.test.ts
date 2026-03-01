import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CmdReceiptWriter } from '../src/lib/receipt-first/cmd-receipt.ts';
import type { CmdReceipt } from '../src/lib/receipt-first/cmd-receipt.ts';
import type { ScenarioRegistry } from '../src/lib/receipt-first/scenario-registry.ts';
import { enforceChain } from '../src/lib/receipt-first/chain-enforcer.ts';
import { openBreakglass, loadBreakglass } from '../src/lib/receipt-first/breakglass.ts';
import type { BreakglassReceipt } from '../src/lib/receipt-first/breakglass.ts';
import { getBreakglassStatus, formatBreakglassStatus } from '../src/lib/receipt-first/verify-breakglass.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `rf-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(tmpRoot, '.roadmap'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeScenarios(repoRoot: string, registry: ScenarioRegistry): void {
  const dir = join(repoRoot, '.roadmap', 'scenarios');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SCENARIOS.json'), JSON.stringify(registry, null, 2) + '\n');
}

function writeFakeReceipt(repoRoot: string, cmd: string, runId: string, headSha: string): CmdReceipt {
  const dir = join(repoRoot, '.roadmap', 'receipts', 'cmd', cmd);
  mkdirSync(dir, { recursive: true });
  const receipt: CmdReceipt = {
    schema_version: 1,
    type: 'cmd-receipt',
    cmd,
    runId,
    repoRoot,
    headSha,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ok: true,
    exitCode: 0,
    dataSha256: 'abc123',
    evidence: { argv: [cmd], stdout_sha256: '', stderr_sha256: '', artifacts_read: [], artifacts_written: [] },
  };
  writeFileSync(join(dir, `${runId}.json`), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

// ── AT-1: Command receipts always written ─────────────────────────────────────

describe('AT-1: command receipts always written', () => {
  it('CmdReceiptWriter.write() produces a valid CmdReceipt', () => {
    const writer = new CmdReceiptWriter(tmpRoot);
    const receipt = writer.write({
      cmd: 'validate',
      runId: 'run-001',
      ok: true,
      exitCode: 0,
      argv: ['validate', '--note', 'test'],
      stdout: 'ok',
      stderr: '',
      artifacts_read: ['head.json'],
      artifacts_written: [],
      scenario: 'scenario-x',
    });

    expect(receipt.schema_version).toBe(1);
    expect(receipt.type).toBe('cmd-receipt');
    expect(receipt.cmd).toBe('validate');
    expect(receipt.runId).toBe('run-001');
    expect(receipt.ok).toBe(true);
    expect(receipt.exitCode).toBe(0);
    expect(typeof receipt.headSha).toBe('string');
    expect(typeof receipt.startedAt).toBe('string');
    expect(typeof receipt.endedAt).toBe('string');
    expect(typeof receipt.dataSha256).toBe('string');
    expect(receipt.evidence.argv).toEqual(['validate', '--note', 'test']);
    expect(typeof receipt.evidence.stdout_sha256).toBe('string');
    expect(receipt.evidence.artifacts_read).toEqual(['head.json']);
    expect(receipt.scenario).toBe('scenario-x');
  });

  it('receipt file exists on disk at expected path', () => {
    const writer = new CmdReceiptWriter(tmpRoot);
    writer.write({ cmd: 'orient', runId: 'run-002', ok: true, exitCode: 0, argv: ['orient'] });

    const path = writer.receiptPath('orient', 'run-002');
    expect(existsSync(path)).toBe(true);

    const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as CmdReceipt;
    expect(onDisk.cmd).toBe('orient');
    expect(onDisk.runId).toBe('run-002');
  });
});

// ── AT-2: Scenario gating blocks free-run ─────────────────────────────────────

describe('AT-2: scenario gating blocks free-run', () => {
  it('enforceChain returns go: false when required receipt is absent', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'pre-expand',
        desc: 'Must validate before expand',
        requiredReceipts: [{ type: 'cmd', cmd: 'validate' }],
        allowBreakglass: false,
      }],
    });

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'expand',
      headSha: 'abc123',
      scenarioId: 'pre-expand',
    });

    expect(result.go).toBe(false);
    expect(result.missingReceipts).toBeDefined();
    expect(result.missingReceipts!.length).toBe(1);
    expect(result.missingReceipts![0].cmd).toBe('validate');
  });

  it('enforceChain returns go: true when required receipt exists', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'pre-expand',
        desc: 'Must validate before expand',
        requiredReceipts: [{ type: 'cmd', cmd: 'validate' }],
        allowBreakglass: false,
      }],
    });

    writeFakeReceipt(tmpRoot, 'validate', 'run-v1', 'abc123');

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'expand',
      headSha: 'abc123',
      scenarioId: 'pre-expand',
    });

    expect(result.go).toBe(true);
  });

  it('ungated command (no scenarioId) returns go: true', () => {
    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'orient',
      headSha: 'abc',
    });
    expect(result.go).toBe(true);
  });
});

// ── AT-3: Receipt binding rejects drift ───────────────────────────────────────

describe('AT-3: receipt binding rejects drift', () => {
  it('matchHeadSha blocks when receipt headSha differs from current', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'strict-validate',
        desc: 'Validate must match current head',
        requiredReceipts: [{ type: 'cmd', cmd: 'validate', matchHeadSha: true }],
        allowBreakglass: false,
      }],
    });

    // Receipt written with old sha
    writeFakeReceipt(tmpRoot, 'validate', 'run-old', 'old-sha-111');

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'expand',
      headSha: 'new-sha-222', // different from receipt
      scenarioId: 'strict-validate',
    });

    expect(result.go).toBe(false);
    expect(result.missingReceipts).toBeDefined();
    expect(result.missingReceipts![0].fix).toContain('old-sha-111');
    expect(result.missingReceipts![0].fix).toContain('new-sha-222');
  });

  it('matchHeadSha passes when receipt headSha matches current', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'strict-validate',
        desc: 'Validate must match current head',
        requiredReceipts: [{ type: 'cmd', cmd: 'validate', matchHeadSha: true }],
        allowBreakglass: false,
      }],
    });

    writeFakeReceipt(tmpRoot, 'validate', 'run-match', 'same-sha');

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'expand',
      headSha: 'same-sha',
      scenarioId: 'strict-validate',
    });

    expect(result.go).toBe(true);
  });
});

// ── AT-4: Breakglass enables bounded bypass ───────────────────────────────────

describe('AT-4: breakglass enables bounded bypass', () => {
  it('active breakglass allows gated command when scenario allows breakglass', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'gated-deploy',
        desc: 'Deploy requires approval receipt',
        requiredReceipts: [{ type: 'cmd', cmd: 'approve' }],
        allowBreakglass: true,
      }],
    });

    // Open breakglass covering 'deploy' command with 30 min TTL
    openBreakglass(tmpRoot, {
      reason: 'hotfix needed',
      evidence: 'ticket-123',
      scope: { commands: ['deploy'], invariantsBypassed: ['approval-check'] },
      ttlMinutes: 30,
    });

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'deploy',
      headSha: 'any',
      scenarioId: 'gated-deploy',
    });

    expect(result.go).toBe(true);
    expect(result.breakglassActive).toBe(true);
    expect(result.breakglassId).toBeDefined();
  });

  it('breakglass does not bypass when scenario disallows it', () => {
    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'strict-gate',
        desc: 'No breakglass allowed',
        requiredReceipts: [{ type: 'cmd', cmd: 'verify' }],
        allowBreakglass: false,
      }],
    });

    openBreakglass(tmpRoot, {
      reason: 'urgent',
      evidence: 'none',
      scope: { commands: ['verify'], invariantsBypassed: [] },
      ttlMinutes: 30,
    });

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'some-cmd',
      headSha: 'any',
      scenarioId: 'strict-gate',
    });

    expect(result.go).toBe(false);
  });
});

// ── AT-5: Breakglass expiry ───────────────────────────────────────────────────

describe('AT-5: breakglass expiry', () => {
  it('expired breakglass returns active: false', () => {
    // Write a breakglass with expiresAt in the past — auto-expired on read by loadBreakglass
    const bgDir = join(tmpRoot, '.roadmap', 'receipts', 'breakglass');
    mkdirSync(bgDir, { recursive: true });
    const bg: BreakglassReceipt = {
      schema_version: 1,
      type: 'breakglass',
      id: 'bg-expired-test',
      openedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      scope: { commands: ['deploy'], invariantsBypassed: [] },
      reason: 'was urgent',
      evidence: 'ticket',
      requiredFollowups: [],
      status: 'open', // still open but past expiry — auto-expire on read
    };
    writeFileSync(join(bgDir, 'bg-expired-test.json'), JSON.stringify(bg, null, 2) + '\n');

    // loadBreakglass auto-expires, so activeBreakglass returns empty
    const status = getBreakglassStatus(tmpRoot);
    expect(status.active).toBe(false);

    // Verify the receipt was auto-expired on disk
    const loaded = loadBreakglass(tmpRoot, 'bg-expired-test')!;
    expect(loaded.status).toBe('expired');
  });

  it('expired breakglass does not bypass enforceChain', () => {
    const bgDir = join(tmpRoot, '.roadmap', 'receipts', 'breakglass');
    mkdirSync(bgDir, { recursive: true });
    const bg: BreakglassReceipt = {
      schema_version: 1,
      type: 'breakglass',
      id: 'bg-expired-enforce',
      openedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      scope: { commands: ['deploy'], invariantsBypassed: [] },
      reason: 'was urgent',
      evidence: 'ticket',
      requiredFollowups: [],
      status: 'open',
    };
    writeFileSync(join(bgDir, 'bg-expired-enforce.json'), JSON.stringify(bg, null, 2) + '\n');

    writeScenarios(tmpRoot, {
      schema_version: 1,
      scenarios: [{
        id: 'gated',
        desc: 'Needs receipt',
        requiredReceipts: [{ type: 'cmd', cmd: 'approve' }],
        allowBreakglass: true,
      }],
    });

    const result = enforceChain({
      repoRoot: tmpRoot,
      cmd: 'deploy',
      headSha: 'any',
      scenarioId: 'gated',
    });

    // Breakglass is expired — should NOT bypass
    expect(result.go).toBe(false);
  });

  it('loadBreakglass auto-expires on read', () => {
    const bgDir = join(tmpRoot, '.roadmap', 'receipts', 'breakglass');
    mkdirSync(bgDir, { recursive: true });
    const bg: BreakglassReceipt = {
      schema_version: 1,
      type: 'breakglass',
      id: 'bg-autoexpire',
      openedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
      scope: { commands: ['x'], invariantsBypassed: [] },
      reason: 'test',
      evidence: 'test',
      requiredFollowups: [],
      status: 'open',
    };
    writeFileSync(join(bgDir, 'bg-autoexpire.json'), JSON.stringify(bg, null, 2) + '\n');

    const loaded = loadBreakglass(tmpRoot, 'bg-autoexpire')!;
    expect(loaded.status).toBe('expired');
  });
});

// ── AT-6: Verify surfaces breakglass ──────────────────────────────────────────

describe('AT-6: verify surfaces breakglass', () => {
  it('getBreakglassStatus returns full status for active breakglass', () => {
    openBreakglass(tmpRoot, {
      reason: 'production incident',
      evidence: 'INC-456',
      scope: { commands: ['deploy', 'expand'], invariantsBypassed: ['pre-validate'] },
      ttlMinutes: 60,
      requiredFollowups: ['post-deploy-verify'],
    });

    const status = getBreakglassStatus(tmpRoot);
    expect(status.active).toBe(true);
    expect(status.id).toBeDefined();
    expect(status.id!.startsWith('bg-')).toBe(true);
    expect(status.remainingMs).toBeDefined();
    expect(status.remainingMs!).toBeGreaterThan(0);
    expect(status.scope).toBeDefined();
    expect(status.scope!.commands).toContain('deploy');
    expect(status.scope!.commands).toContain('expand');
    expect(status.scope!.invariantsBypassed).toContain('pre-validate');
    expect(status.reason).toBe('production incident');
    expect(status.requiredFollowups).toContain('post-deploy-verify');
  });

  it('formatBreakglassStatus produces non-empty string for active breakglass', () => {
    openBreakglass(tmpRoot, {
      reason: 'emergency',
      evidence: 'EV-1',
      scope: { commands: ['deploy'], invariantsBypassed: ['lint'] },
      ttlMinutes: 15,
      requiredFollowups: ['fix-lint'],
    });

    const status = getBreakglassStatus(tmpRoot);
    const formatted = formatBreakglassStatus(status);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('BREAKGLASS ACTIVE');
    expect(formatted).toContain('deploy');
    expect(formatted).toContain('Expires in');
  });

  it('formatBreakglassStatus handles no active breakglass', () => {
    const status = getBreakglassStatus(tmpRoot);
    const formatted = formatBreakglassStatus(status);
    expect(formatted).toBe('No active breakglass');
  });

  it('formatBreakglassStatus handles expired breakglass', () => {
    const status: import('../src/lib/receipt-first/verify-breakglass.ts').BreakglassStatus = {
      active: false,
      expired: true,
      id: 'bg-old',
    };
    const formatted = formatBreakglassStatus(status);
    expect(formatted).toContain('BREAKGLASS EXPIRED');
    expect(formatted).toContain('bg-old');
  });
});
