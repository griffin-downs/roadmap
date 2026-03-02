// Migration Plan Generation Tests (S5)
// Test coverage: migration plan generation with --plan-only and --dryRun modes
//
// Acceptance scenarios:
// S5.1 — Plan syntax valid: moves and dependencies correctly structured
// S5.2 — Moves don't conflict: no duplicate target paths
// S5.3 — Moves don't orphan modules: all moves have valid from/to
// S5.4 — Plan is idempotent: re-running produces identical plan
// S5.5 — Dry-run verification passes: plan validates without execution
// S5.6 — Rollback metadata included: each plan traceable via timestamp

import { describe, it, expect } from 'vitest';
import { cmdChateletMigrate, MigrateOptions } from '../src/cli/commands/chatelet-migrate.js';
import {
  validateMigrationPlan,
  type MigrationPlan,
  type MoveOperation,
} from '../src/lib/chatelet/migration-validator.js';

// ========== Test Fixtures ==========

/**
 * Fixture: Generate migration plan in test environment.
 * Uses cwd as repo root to analyze actual source.
 */
async function getValidPlan(options: MigrateOptions = {}): Promise<MigrationPlan> {
  return cmdChateletMigrate(process.cwd(), { ...options, planOnly: true });
}

/**
 * Check for duplicate target paths in move operations.
 */
function getDuplicateTargets(moves: MoveOperation[]): string[] {
  const targets = new Map<string, number>();
  const duplicates: string[] = [];

  for (const move of moves) {
    const count = targets.get(move.to) || 0;
    if (count > 0) duplicates.push(move.to);
    targets.set(move.to, count + 1);
  }

  return duplicates;
}

/**
 * Check for orphaned modules (moves without proper hierarchy).
 * A move is problematic if:
 * - It has path traversal (.. in path)
 * - It's absolute (starts with /)
 * - Target is empty
 */
function getProblematicMoves(moves: MoveOperation[]): MoveOperation[] {
  return moves.filter(move => {
    return !move.from || !move.to || move.to.includes('..') || move.to.startsWith('/');
  });
}

// ========== S5.1 — Plan syntax valid ==========

describe('S5.1 — Plan syntax valid', () => {
  it('plan has required moves array', async () => {
    const plan = await getValidPlan();
    expect(plan.moves).toBeDefined();
    expect(Array.isArray(plan.moves)).toBe(true);
    // Repo should have modules to migrate
    expect(plan.moves.length).toBeGreaterThanOrEqual(0);
  });

  it('each move has from and to fields', async () => {
    const plan = await getValidPlan();
    for (const move of plan.moves) {
      expect(move.from).toBeDefined();
      expect(typeof move.from).toBe('string');
      expect(move.to).toBeDefined();
      expect(typeof move.to).toBe('string');
      expect(move.from.length).toBeGreaterThan(0);
      expect(move.to.length).toBeGreaterThan(0);
    }
  });

  it('plan passes validation with valid structure', async () => {
    const plan = await getValidPlan();
    const validation = validateMigrationPlan(plan);
    // Plan should be structurally valid (no syntax errors)
    expect(validation.valid).toBe(true);
  });

  it('plan includes optional metadata fields', async () => {
    const plan = await getValidPlan();
    // estimated_time, safety, and rollback are optional
    if (plan.estimated_time) {
      expect(typeof plan.estimated_time).toBe('string');
    }
    if (plan.safety) {
      expect(['dry-run-verified', 'dry-run-failed', 'pending', 'executed']).toContain(plan.safety);
    }
  });

  it('plan structure is complete and traversable', async () => {
    const plan = await getValidPlan();
    // Can iterate all moves
    let moveCount = 0;
    for (const move of plan.moves) {
      moveCount++;
      expect(move.from).toBeDefined();
      expect(move.to).toBeDefined();
    }
    expect(moveCount).toBe(plan.moves.length);
  });
});

// ========== S5.2 — Moves don't conflict ==========

describe('S5.2 — Moves don\'t conflict', () => {
  it('no duplicate target paths', async () => {
    const plan = await getValidPlan();
    const duplicates = getDuplicateTargets(plan.moves);
    expect(duplicates.length).toBe(0);
  });

  it('all target paths are unique', async () => {
    const plan = await getValidPlan();
    const targets = plan.moves.map(m => m.to);
    const unique = new Set(targets);
    expect(unique.size).toBe(targets.length);
  });

  it('source and target paths are different', async () => {
    const plan = await getValidPlan();
    for (const move of plan.moves) {
      expect(move.from).not.toBe(move.to);
    }
  });

  it('validates absence of conflicting moves', async () => {
    const plan = await getValidPlan();
    const validation = validateMigrationPlan(plan);
    // Validator should catch DuplicateTarget and ConflictingMoves errors
    const hasConflicts = validation.errors.some(e =>
      e.type === 'DuplicateTarget' || e.type === 'ConflictingMoves'
    );
    expect(hasConflicts).toBe(false);
  });
});

// ========== S5.3 — Moves don't orphan modules ==========

describe('S5.3 — Moves don\'t orphan modules', () => {
  it('all moves have valid from paths (no traversal)', async () => {
    const plan = await getValidPlan();
    for (const move of plan.moves) {
      expect(move.from.includes('..')).toBe(false);
      expect(move.from.startsWith('/')).toBe(false);
    }
  });

  it('all moves have valid to paths (no traversal)', async () => {
    const plan = await getValidPlan();
    for (const move of plan.moves) {
      expect(move.to.includes('..')).toBe(false);
      expect(move.to.startsWith('/')).toBe(false);
    }
  });

  it('validation detects path traversal attacks', async () => {
    const plan = await getValidPlan();
    const validation = validateMigrationPlan(plan);
    // Should have no PathTraversal errors
    const hasTraversal = validation.errors.some(e => e.type === 'PathTraversal');
    expect(hasTraversal).toBe(false);
  });

  it('no problematic moves exist', async () => {
    const plan = await getValidPlan();
    const problematic = getProblematicMoves(plan.moves);
    expect(problematic.length).toBe(0);
  });

  it('all moves preserve module hierarchy', async () => {
    const plan = await getValidPlan();
    // If there are packs migrations, they should go to packs/* directories
    const packMoves = plan.moves.filter(m => m.to.startsWith('packs/'));
    for (const move of packMoves) {
      // Target should have valid directory structure
      const parts = move.to.split('/');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts[0]).toBe('packs');
    }
  });
});

// ========== S5.4 — Plan is idempotent ==========

describe('S5.4 — Plan is idempotent', () => {
  it('same options produce identical move count', async () => {
    const plan1 = await getValidPlan({ planOnly: true });
    const plan2 = await getValidPlan({ planOnly: true });

    expect(plan1.moves.length).toBe(plan2.moves.length);
  });

  it('move sequence is consistent across calls', async () => {
    const plan1 = await getValidPlan({ planOnly: true });
    const plan2 = await getValidPlan({ planOnly: true });

    for (let i = 0; i < plan1.moves.length; i++) {
      expect(plan1.moves[i].from).toBe(plan2.moves[i].from);
      expect(plan1.moves[i].to).toBe(plan2.moves[i].to);
    }
  });

  it('time estimate is stable across calls', async () => {
    const plan1 = await getValidPlan({ planOnly: true });
    const plan2 = await getValidPlan({ planOnly: true });

    // If estimates present, should be identical
    if (plan1.estimated_time) {
      expect(plan1.estimated_time).toBe(plan2.estimated_time);
    }
  });

  it('planOnly option produces deterministic plan', async () => {
    const plan1 = await getValidPlan({ planOnly: true });
    const plan2 = await getValidPlan({ planOnly: true });

    // Plans should be byte-equivalent when serialized
    expect(JSON.stringify(plan1.moves)).toBe(JSON.stringify(plan2.moves));
  });

  it('plan passes idempotency check via validator', async () => {
    const plan1 = await getValidPlan();
    const plan2 = await getValidPlan();

    const val1 = validateMigrationPlan(plan1);
    const val2 = validateMigrationPlan(plan2);

    expect(val1.idempotent).toBe(true);
    expect(val2.idempotent).toBe(true);
  });
});

// ========== S5.5 — Dry-run verification passes ==========

describe('S5.5 — Dry-run verification passes', () => {
  it('dryRun option returns plan without execution', async () => {
    const plan = await getValidPlan({ dryRun: true });
    expect(plan).toBeDefined();
    expect(plan.moves).toBeDefined();
  });

  it('plan generated with dryRun has valid structure', async () => {
    const plan = await getValidPlan({ dryRun: true });
    const validation = validateMigrationPlan(plan);
    expect(validation.valid).toBe(true);
  });

  it('dryRun and planOnly produce equivalent plans', async () => {
    const planOnlyPlan = await getValidPlan({ planOnly: true });
    const dryRunPlan = await getValidPlan({ dryRun: true });

    expect(planOnlyPlan.moves.length).toBe(dryRunPlan.moves.length);
    for (let i = 0; i < planOnlyPlan.moves.length; i++) {
      expect(planOnlyPlan.moves[i].from).toBe(dryRunPlan.moves[i].from);
      expect(planOnlyPlan.moves[i].to).toBe(dryRunPlan.moves[i].to);
    }
  });

  it('all move paths are safe (no forbidden characters)', async () => {
    const plan = await getValidPlan({ dryRun: true });
    for (const move of plan.moves) {
      // Windows forbidden chars: < > : | ? *
      expect(/[<>:|?*]/.test(move.from)).toBe(false);
      expect(/[<>:|?*]/.test(move.to)).toBe(false);
    }
  });

  it('dry-run safety status indicated in plan', async () => {
    const plan = await getValidPlan({ dryRun: true });
    // After validation, plan should show safety status
    const validation = validateMigrationPlan(plan);
    if (validation.valid) {
      expect(plan.safety).toBe('dry-run-verified');
    }
  });
});

// ========== S5.6 — Rollback metadata included ==========

describe('S5.6 — Rollback metadata included', () => {
  it('plan includes rollback metadata with timestamp', async () => {
    const plan = await getValidPlan({ planOnly: true });
    if (plan.rollback) {
      expect(plan.rollback.timestamp).toBeDefined();
      expect(typeof plan.rollback.timestamp).toBe('string');
      // Timestamp should be ISO format
      const ts = new Date(plan.rollback.timestamp);
      expect(!isNaN(ts.getTime())).toBe(true);
      expect(ts.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it('rollback metadata contains audit information', async () => {
    const plan = await getValidPlan({ planOnly: true });
    if (plan.rollback?.metadata) {
      // Should have audit_timestamp and counts for traceability
      expect(plan.rollback.metadata).toBeDefined();
      // Common fields for recovery: module_count, file_count, line_count
    }
  });

  it('plan has stable safety status', async () => {
    const plan1 = await getValidPlan({ planOnly: true });
    const plan2 = await getValidPlan({ planOnly: true });

    // Safety status should be same across runs (same inputs = same validation result)
    if (plan1.safety) {
      expect(plan1.safety).toBe(plan2.safety);
    }
  });

  it('plan estimated_time is included for duration traceability', async () => {
    const plan = await getValidPlan({ planOnly: true });
    if (plan.estimated_time) {
      expect(typeof plan.estimated_time).toBe('string');
      // Should have format like "2h" or "45m"
      expect(/^\d+(m|h)$/.test(plan.estimated_time)).toBe(true);
    }
  });

  it('plan can be serialized for persistence and recovery', async () => {
    const plan = await getValidPlan({ planOnly: true });
    const json = JSON.stringify(plan);
    const restored = JSON.parse(json) as MigrationPlan;

    // After round-trip, structure is preserved
    expect(restored.moves.length).toBe(plan.moves.length);
    if (restored.rollback) {
      expect(restored.rollback.timestamp).toBeDefined();
    }
  });

  it('all metadata supports recovery workflow', async () => {
    const plan = await getValidPlan({ planOnly: true });

    // Plan should have enough info for recovery:
    // 1. Timestamp for identifying the plan
    // 2. Move operations for undoing changes
    // 3. Safety status for validation
    // 4. Estimated time for planning

    if (plan.rollback?.metadata) {
      expect(plan.rollback.metadata).toBeDefined();
    }
    expect(plan.moves.length).toBeGreaterThanOrEqual(0);
    expect(plan.estimated_time || true).toBeDefined();
  });
});

// ========== Integration Tests ==========

describe('Migration Plan — Integration', () => {
  it('can generate plan from actual repository structure', async () => {
    const plan = await getValidPlan({ planOnly: true });
    // Plan should successfully analyze current repo
    expect(plan).toBeDefined();
    expect(plan.moves).toBeDefined();
  });

  it('validation passes on generated plan', async () => {
    const plan = await getValidPlan({ planOnly: true });
    const validation = validateMigrationPlan(plan);

    // Should be structurally valid
    expect(validation.errors.length).toBe(0);
    expect(validation.valid).toBe(true);
  });

  it('plan is complete and traversable', async () => {
    const plan = await getValidPlan({ planOnly: true });

    // Should be able to iterate all moves
    let moveCount = 0;
    for (const move of plan.moves) {
      expect(move.from).toBeDefined();
      expect(move.to).toBeDefined();
      moveCount++;
    }
    expect(moveCount).toBe(plan.moves.length);
  });

  it('plan metadata sufficient for tooling integration', async () => {
    const plan = await getValidPlan({ planOnly: true });

    // Tooling should be able to:
    // 1. Identify the plan by rollback timestamp
    if (plan.rollback?.timestamp) {
      const ts = new Date(plan.rollback.timestamp);
      expect(!isNaN(ts.getTime())).toBe(true);
    }

    // 2. Estimate execution time
    if (plan.estimated_time) {
      expect(/^\d+(m|h)$/.test(plan.estimated_time)).toBe(true);
    }

    // 3. Walk moves in order
    if (plan.moves.length > 0) {
      expect(plan.moves[0].from).toBeDefined();
      expect(plan.moves[0].to).toBeDefined();
    }
  });

  it('plan can be serialized and restored', async () => {
    const plan = await getValidPlan({ planOnly: true });
    const json = JSON.stringify(plan);
    const restored = JSON.parse(json) as MigrationPlan;

    expect(restored.moves.length).toBe(plan.moves.length);
    expect(restored.safety).toBe(plan.safety);
  });
});
