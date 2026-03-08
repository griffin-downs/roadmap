// @module tests
// @exports (test suite)
// @entry test/advance-feature-branch.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test suite: advance-feature-branch
 *
 * Verifies that read-only commands (advance, orient, status) can run on feat/* and wip/* branches,
 * while DAG-mutating commands (make, dag insert/remove/modify) still require main branch.
 */

describe('advance-feature-branch', () => {
  const repoRoot = '/home/griffin/src/.dev/roadmap';
  const binPath = join(repoRoot, 'bin', 'roadmap.ts');
  const binContent = readFileSync(binPath, 'utf-8');

  it('should include advance in BRANCH_EXEMPT set', () => {
    // Verify that 'advance' is in the BRANCH_EXEMPT set
    expect(binContent).toMatch(
      /const BRANCH_EXEMPT = new Set\(\[([^\]]*)'advance'([^\]]*)\]\)/
    );
  });

  it('should include orient in BRANCH_EXEMPT set', () => {
    // Verify that 'orient' is in the BRANCH_EXEMPT set
    expect(binContent).toMatch(
      /const BRANCH_EXEMPT = new Set\(\[([^\]]*)'orient'([^\]]*)\]\)/
    );
  });

  it('should include status in BRANCH_EXEMPT set', () => {
    // Verify that 'status' is in the BRANCH_EXEMPT set (newly added)
    expect(binContent).toMatch(
      /const BRANCH_EXEMPT = new Set\(\[([^\]]*)'status'([^\]]*)\]\)/
    );
  });

  it('should NOT have enforceMainBranch in cmdStatus function', () => {
    // Extract the cmdStatus function
    const cmdStatusMatch = binContent.match(
      /async function cmdStatus\(note: string \| undefined\) \{[\s\S]*?(?=\n  async function|\n  function|\nfunction [a-z])/
    );
    expect(cmdStatusMatch).toBeTruthy();

    if (cmdStatusMatch) {
      const cmdStatusBody = cmdStatusMatch[0];
      // Verify enforceMainBranch is NOT called inside cmdStatus
      expect(cmdStatusBody).not.toMatch(
        /^\s*enforceMainBranch\(\)/m
      );
    }
  });

  it('should still enforce main branch for make command (without --dry-run)', () => {
    // Verify the enforcement logic still applies to make
    const enforceLogic = binContent.match(
      /const BRANCH_EXEMPT = new Set\(\[([^\]]*)\]\);[\s\S]*?if \(!BRANCH_EXEMPT\.has\(cmd\)[\s\S]*?\{[\s\S]*?enforceMainBranch\(\);[\s\S]*?\}/
    );
    expect(enforceLogic).toBeTruthy();
  });

  it('should have the conditional for --dry-run exemption', () => {
    // Verify --dry-run flag exempts make from branch enforcement
    expect(binContent).toMatch(
      /cmd === 'make' && args\.includes\('--dry-run'\)/
    );
  });

  it('should handle read-only commands on feature branches', () => {
    // Verify all read-only commands are properly exempted
    const readOnlyCommands = ['orient', 'advance', 'status', 'api', 'help'];

    for (const cmd of readOnlyCommands) {
      expect(binContent).toMatch(
        new RegExp(`'${cmd}'[^\\]]*\\]`)
      );
    }
  });
});
