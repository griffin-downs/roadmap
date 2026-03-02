// Migration validator tests — comprehensive coverage of plan validation
//
// Spec: src/lib/chatelet/migration-validator.ts
// - Validates move operation syntax
// - Detects circular dependencies in moves
// - Reports helpful diagnostic errors
// - Ensures idempotency and plan soundness

import { describe, it, expect } from 'vitest';
import {
  validateMigrationPlan,
  detectCircularMoves,
  formatValidationError,
  MigrationPlan,
  ValidationError,
} from '../src/lib/chatelet/migration-validator.ts';

describe('Migration Validator: Syntax Validation', () => {
  it('accepts valid migration plan with basic moves', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/lib/utils.ts', to: 'packs/utils/src/lib/utils.ts' },
        { from: 'src/lib/config.ts', to: 'packs/config/src/lib/config.ts' },
      ],
      estimated_time: '2h',
      safety: 'dry-run-verified',
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.idempotent).toBe(true);
  });

  it('rejects plan with non-array moves', () => {
    const plan = {
      moves: 'not an array',
      safety: 'pending',
    } as unknown as MigrationPlan;

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('InvalidSyntax');
  });

  it('rejects move without from field', () => {
    const plan: MigrationPlan = {
      moves: [{ to: 'packs/utils/file.ts' } as any],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('InvalidSyntax');
    expect(result.errors[0].message).toContain('from');
  });

  it('rejects move without to field', () => {
    const plan: MigrationPlan = {
      moves: [{ from: 'src/file.ts' } as any],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('InvalidSyntax');
    expect(result.errors[0].message).toContain('to');
  });

  it('rejects move with empty from string', () => {
    const plan: MigrationPlan = {
      moves: [{ from: '', to: 'packs/utils/file.ts' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('InvalidSyntax');
  });

  it('rejects move with empty to string', () => {
    const plan: MigrationPlan = {
      moves: [{ from: 'src/file.ts', to: '   ' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('InvalidSyntax');
  });
});

describe('Migration Validator: Path Traversal Security', () => {
  it('rejects moves with absolute from paths', () => {
    const plan: MigrationPlan = {
      moves: [{ from: '/etc/passwd', to: 'packs/utils/file.ts' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('PathTraversal');
  });

  it('rejects moves with absolute to paths', () => {
    const plan: MigrationPlan = {
      moves: [{ from: 'src/file.ts', to: '/var/lib/dangerous' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('PathTraversal');
  });

  it('rejects moves with directory traversal in from', () => {
    const plan: MigrationPlan = {
      moves: [{ from: '../../etc/passwd', to: 'packs/utils/file.ts' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('PathTraversal');
  });

  it('rejects moves with directory traversal in to', () => {
    const plan: MigrationPlan = {
      moves: [{ from: 'src/file.ts', to: 'packs/../../../etc/passwd' }],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('PathTraversal');
  });
});

describe('Migration Validator: Circular Dependencies', () => {
  it('detects simple circular move: A → B, B → A', () => {
    const moves = [
      { from: 'src/a.ts', to: 'packs/utils/a.ts' },
      { from: 'packs/utils/a.ts', to: 'src/a.ts' },
    ];

    const error = detectCircularMoves(moves);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('CircularDependency');
  });

  it('detects three-cycle: A → B → C → A', () => {
    const moves = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];

    const error = detectCircularMoves(moves);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('CircularDependency');
  });

  it('accepts acyclic moves', () => {
    const moves = [
      { from: 'src/utils.ts', to: 'packs/utils/utils.ts' },
      { from: 'src/config.ts', to: 'packs/config/config.ts' },
      { from: 'src/types.ts', to: 'packs/shared/types.ts' },
    ];

    const error = detectCircularMoves(moves);
    expect(error).toBeNull();
  });

  it('accepts chain without cycles: A → B → C (no back edge)', () => {
    const moves = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];

    const error = detectCircularMoves(moves);
    expect(error).toBeNull();
  });

  it('detects cycles in larger graph', () => {
    const moves = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'b' }, // Cycle: b → c → d → b
    ];

    const error = detectCircularMoves(moves);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('CircularDependency');
  });
});

describe('Migration Validator: Duplicate Targets', () => {
  it('rejects when two moves target same file', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/file1.ts', to: 'packs/utils/shared.ts' },
        { from: 'src/file2.ts', to: 'packs/utils/shared.ts' },
      ],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('DuplicateTarget');
    expect(result.errors[0].affectedMoves).toEqual([0, 1]);
  });

  it('case-insensitive duplicate detection', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/a.ts', to: 'packs/utils/File.ts' },
        { from: 'src/b.ts', to: 'packs/utils/file.ts' },
      ],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('DuplicateTarget');
  });
});

describe('Migration Validator: Conflicting Moves', () => {
  it('rejects duplicate source moves to different targets', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/utils.ts', to: 'packs/utils/utils.ts' },
        { from: 'src/utils.ts', to: 'packs/shared/utils.ts' },
      ],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('ConflictingMoves');
  });

  it('rejects multiple different sources moving to same target', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/a.ts', to: 'packs/utils/merged.ts' },
        { from: 'src/b.ts', to: 'packs/utils/merged.ts' },
      ],
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(false);
    // This is also caught by DuplicateTarget
    expect([result.errors[0].type]).toContain('DuplicateTarget' || 'ConflictingMoves');
  });
});

describe('Migration Validator: Error Formatting', () => {
  it('formats validation error with all fields', () => {
    const error: ValidationError = {
      type: 'CircularDependency',
      message: 'Circular dependency detected',
      detail: 'Cycle found in move sequence',
      affectedMoves: [0, 1, 2],
      remediation: 'Remove one of the circular moves',
    };

    const formatted = formatValidationError(error);
    expect(formatted).toContain('[CircularDependency]');
    expect(formatted).toContain('Circular dependency detected');
    expect(formatted).toContain('Detail:');
    expect(formatted).toContain('Affected moves: 0, 1, 2');
    expect(formatted).toContain('Remove one of the circular moves');
  });

  it('formats error without optional fields', () => {
    const error: ValidationError = {
      type: 'InvalidSyntax',
      message: 'Invalid syntax',
    };

    const formatted = formatValidationError(error);
    expect(formatted).toContain('[InvalidSyntax]');
    expect(formatted).toContain('Invalid syntax');
  });
});

describe('Migration Validator: Complex Scenarios', () => {
  it('accepts large valid migration plan (100 moves)', () => {
    const moves = Array.from({ length: 100 }, (_, i) => ({
      from: `src/lib/file${i}.ts`,
      to: `packs/lib-${i % 5}/src/lib/file${i}.ts`,
    }));

    const plan: MigrationPlan = {
      moves,
      safety: 'dry-run-verified',
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('validates plan with rollback metadata', () => {
    const plan: MigrationPlan = {
      moves: [{ from: 'src/file.ts', to: 'packs/utils/file.ts' }],
      safety: 'executed',
      rollback: {
        metadata: { revision: 'abc123', timestamp: '2026-03-02T00:00:00Z' },
        timestamp: '2026-03-02T00:00:00Z',
      },
    };

    const result = validateMigrationPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('idempotency: same plan validates identically across calls', () => {
    const plan: MigrationPlan = {
      moves: [
        { from: 'src/utils.ts', to: 'packs/utils/utils.ts' },
        { from: 'src/config.ts', to: 'packs/config/config.ts' },
      ],
    };

    const result1 = validateMigrationPlan(plan);
    const result2 = validateMigrationPlan(plan);

    expect(result1.valid).toBe(result2.valid);
    expect(result1.errors.length).toBe(result2.errors.length);
    expect(result1.idempotent).toBe(true);
    expect(result2.idempotent).toBe(true);
  });
});
