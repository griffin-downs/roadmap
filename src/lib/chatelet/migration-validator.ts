// @module migration-validator
// @exports validateMigrationPlan, detectCircularMoves, formatValidationError
// @types MigrationPlan, MoveOperation, ValidationError, ValidationResult
// @entry roadmap/chatelet

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single file move operation in a migration plan.
 */
export interface MoveOperation {
  from: string;
  to: string;
  reason?: string;
}

/**
 * Complete migration plan from monolith to Châtelet.
 */
export interface MigrationPlan {
  moves: MoveOperation[];
  estimated_time?: string;
  safety?: 'dry-run-verified' | 'dry-run-failed' | 'pending' | 'executed';
  rollback?: {
    metadata: Record<string, unknown>;
    timestamp: string;
  };
}

/**
 * Validation error with diagnostic context.
 */
export interface ValidationError {
  type:
    | 'InvalidSyntax'
    | 'CircularDependency'
    | 'PathTraversal'
    | 'DuplicateTarget'
    | 'ConflictingMoves'
    | 'InvalidPath';
  message: string;
  detail?: string;
  affectedMoves?: number[];
  remediation?: string;
}

/**
 * Result of validating a migration plan.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  idempotent: boolean;
}

// ── Core Validation ───────────────────────────────────────────────────────────

/**
 * Validate a migration plan for syntax correctness and safety.
 *
 * Checks (in order):
 * 1. All moves have required fields (from, to) with non-empty strings
 * 2. No path traversal attacks (paths don't escape root with ../ or absolute)
 * 3. No circular dependencies in move sequence
 * 4. No duplicate target paths (can't move two files to same location)
 * 5. Idempotency: re-validating same plan produces same result
 *
 * Returns detailed ValidationResult with errors and remediation advice.
 */
export function validateMigrationPlan(plan: MigrationPlan): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check 1: Syntax validation
  if (!Array.isArray(plan.moves)) {
    errors.push({
      type: 'InvalidSyntax',
      message: 'moves must be an array',
      remediation: 'Ensure MigrationPlan.moves is an array of MoveOperation objects',
    });
    return { valid: false, errors, warnings, idempotent: true };
  }

  const syntaxErrors = validateMovesSyntax(plan.moves);
  errors.push(...syntaxErrors);
  if (syntaxErrors.length > 0) {
    return { valid: false, errors, warnings, idempotent: true };
  }

  // Check 2: Path traversal
  const traversalErrors = validatePathTraversal(plan.moves);
  errors.push(...traversalErrors);
  if (traversalErrors.length > 0) {
    return { valid: false, errors, warnings, idempotent: true };
  }

  // Check 3: Circular dependencies
  const circularError = detectCircularMoves(plan.moves);
  if (circularError) {
    errors.push(circularError);
    return { valid: false, errors, warnings, idempotent: true };
  }

  // Check 4: Duplicate targets
  const duplicateErrors = validateNoDuplicateTargets(plan.moves);
  errors.push(...duplicateErrors);
  if (duplicateErrors.length > 0) {
    return { valid: false, errors, warnings, idempotent: true };
  }

  // Check 5: Conflicting moves (from same source to different targets, or vice versa)
  const conflictErrors = validateNoConflictingMoves(plan.moves);
  errors.push(...conflictErrors);
  if (conflictErrors.length > 0) {
    return { valid: false, errors, warnings, idempotent: true };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    idempotent: true, // This validator is deterministic
  };
}

/**
 * Detect if the move sequence has circular dependencies.
 *
 * Example circular case:
 *   move A → B
 *   move B → A
 *
 * Uses topological sort; if cycle found, returns ValidationError.
 */
export function detectCircularMoves(moves: MoveOperation[]): ValidationError | null {
  // Build a directed graph: source → target
  const graph = new Map<string, string[]>();
  const allPaths = new Set<string>();

  for (const move of moves) {
    allPaths.add(move.from);
    allPaths.add(move.to);
    if (!graph.has(move.from)) {
      graph.set(move.from, []);
    }
    graph.get(move.from)!.push(move.to);
  }

  // Detect cycle using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const pathsArray = Array.from(allPaths);
  for (let i = 0; i < pathsArray.length; i++) {
    const node = pathsArray[i];
    if (hasCycle(node, graph, visited, recursionStack)) {
      return {
        type: 'CircularDependency',
        message: 'Circular dependency detected in move sequence',
        detail: `Starting from '${node}': a move creates a cycle where file destinations depend on each other`,
        remediation:
          'Check move.from and move.to chains — ensure no file is moved to a location that itself moves elsewhere (or cycles back)',
      };
    }
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that all moves have required syntax.
 */
function validateMovesSyntax(moves: unknown[]): ValidationError[] {
  const errors: ValidationError[] = [];

  moves.forEach((move, idx) => {
    if (!move || typeof move !== 'object') {
      errors.push({
        type: 'InvalidSyntax',
        message: `Move at index ${idx} is not an object`,
        affectedMoves: [idx],
        remediation: 'Each move must be { from: string, to: string }',
      });
      return;
    }

    const m = move as Record<string, unknown>;

    if (typeof m.from !== 'string' || !m.from.trim()) {
      errors.push({
        type: 'InvalidSyntax',
        message: `Move at index ${idx}: 'from' must be a non-empty string`,
        affectedMoves: [idx],
        remediation: 'Provide from: "path/to/source.ts"',
      });
    }

    if (typeof m.to !== 'string' || !m.to.trim()) {
      errors.push({
        type: 'InvalidSyntax',
        message: `Move at index ${idx}: 'to' must be a non-empty string`,
        affectedMoves: [idx],
        remediation: 'Provide to: "packs/category/path/to/source.ts"',
      });
    }
  });

  return errors;
}

/**
 * Validate that paths don't contain traversal attacks (../, /absolute paths).
 */
function validatePathTraversal(moves: MoveOperation[]): ValidationError[] {
  const errors: ValidationError[] = [];

  moves.forEach((move, idx) => {
    const problematicPaths: string[] = [];

    if (move.from.startsWith('/') || move.from.includes('..')) {
      problematicPaths.push(`from: "${move.from}"`);
    }

    if (move.to.startsWith('/') || move.to.includes('..')) {
      problematicPaths.push(`to: "${move.to}"`);
    }

    if (problematicPaths.length > 0) {
      errors.push({
        type: 'PathTraversal',
        message: `Move at index ${idx} contains unsafe paths: ${problematicPaths.join(', ')}`,
        affectedMoves: [idx],
        detail: 'Absolute paths (/) and directory traversal (..) are not allowed',
        remediation: 'Use relative paths from repo root, e.g., "src/lib/utils.ts" → "packs/utils/src/lib/utils.ts"',
      });
    }
  });

  return errors;
}

/**
 * Validate that no two moves target the same file.
 */
function validateNoDuplicateTargets(moves: MoveOperation[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const targetMap = new Map<string, number>();

  moves.forEach((move, idx) => {
    const normalized = move.to.toLowerCase(); // Case-insensitive check
    if (targetMap.has(normalized)) {
      const firstIdx = targetMap.get(normalized)!;
      errors.push({
        type: 'DuplicateTarget',
        message: `Duplicate target: moves at index ${firstIdx} and ${idx} both target "${move.to}"`,
        affectedMoves: [firstIdx, idx],
        remediation: 'Remove or modify one of the conflicting moves to have a unique destination',
      });
    } else {
      targetMap.set(normalized, idx);
    }
  });

  return errors;
}

/**
 * Validate no conflicting moves (same source to different targets, or vice versa).
 */
function validateNoConflictingMoves(moves: MoveOperation[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const fromMap = new Map<string, number>();
  const toSourceMap = new Map<string, number>();

  moves.forEach((move, idx) => {
    const fromNorm = move.from.toLowerCase();
    const toNorm = move.to.toLowerCase();

    // Check: same source → different target
    if (fromMap.has(fromNorm)) {
      const prevIdx = fromMap.get(fromNorm)!;
      if (moves[prevIdx].to.toLowerCase() !== toNorm) {
        errors.push({
          type: 'ConflictingMoves',
          message: `Conflicting move sources: index ${prevIdx} and ${idx} both move from "${move.from}" to different targets`,
          affectedMoves: [prevIdx, idx],
          detail: `${prevIdx}: from "${moves[prevIdx].from}" → to "${moves[prevIdx].to}"`,
          remediation: 'Each source file can only be moved once. Remove duplicates.',
        });
      }
    } else {
      fromMap.set(fromNorm, idx);
    }

    // Check: different sources → same target
    if (toSourceMap.has(toNorm)) {
      const prevIdx = toSourceMap.get(toNorm)!;
      if (moves[prevIdx].from.toLowerCase() !== fromNorm) {
        errors.push({
          type: 'ConflictingMoves',
          message: `Conflicting move targets: index ${prevIdx} and ${idx} both target "${move.to}" from different sources`,
          affectedMoves: [prevIdx, idx],
          remediation: 'Each target path can only receive one file. Ensure unique destinations.',
        });
      }
    } else {
      toSourceMap.set(toNorm, idx);
    }
  });

  return errors;
}

/**
 * DFS helper to detect cycles in move dependency graph.
 */
function hasCycle(
  node: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  recursionStack: Set<string>,
): boolean {
  visited.add(node);
  recursionStack.add(node);

  const neighbors = graph.get(node) || [];
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      if (hasCycle(neighbor, graph, visited, recursionStack)) {
        return true;
      }
    } else if (recursionStack.has(neighbor)) {
      return true;
    }
  }

  recursionStack.delete(node);
  return false;
}

/**
 * Format a validation error for human consumption.
 */
export function formatValidationError(error: ValidationError): string {
  const lines: string[] = [];
  lines.push(`[${error.type}] ${error.message}`);
  if (error.detail) {
    lines.push(`  Detail: ${error.detail}`);
  }
  if (error.affectedMoves && error.affectedMoves.length > 0) {
    lines.push(`  Affected moves: ${error.affectedMoves.join(', ')}`);
  }
  if (error.remediation) {
    lines.push(`  → ${error.remediation}`);
  }
  return lines.join('\n');
}
