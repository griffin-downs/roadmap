// @module agent-dispatch
// @exports validateBriefSchema, BriefSchemaError, BriefValidationResult

import type { Brief } from '../brief.ts';
import type { ValidationRule } from '../protocol/types.ts';

/**
 * Comprehensive brief schema validation error.
 * Enforces Contract 7: Brief Isolation
 * - Agent brief contains ONLY: nodeId, produces, consumes, description, idempotent, validate
 * - NO DAG introspection (pattern, remaining, handoffs, etc.)
 */
export class BriefSchemaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BriefSchemaError';
  }
}

export interface BriefValidationResult {
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    path?: string;
  }>;
}

/**
 * Validate brief structure and types against sealed contract.
 * Enforces Contract 7: no DAG introspection.
 *
 * Accepted fields:
 * - position: string (current node-id)
 * - produces: string[] (files to create)
 * - consumes: string[] (files to read)
 * - description: string (what to implement)
 * - idempotent: boolean (safe to re-run)
 * - validate: ValidationRule[] (how to verify completion)
 *
 * Rejected fields (leak internal state):
 * - deps, pattern, remaining, handoffs, level, status, etc.
 */
export function validateBriefSchema(brief: unknown): BriefValidationResult {
  const errors: BriefValidationResult['errors'] = [];

  // Root must be object
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    errors.push({
      code: 'BRIEF_NOT_OBJECT',
      message: `Brief must be an object, got ${Array.isArray(brief) ? 'array' : typeof brief}`,
    });
    return { valid: false, errors };
  }

  const briefObj = brief as Record<string, unknown>;

  // Track allowed fields
  const allowedFields = new Set(['position', 'produces', 'consumes', 'description', 'idempotent', 'validate']);

  // Check for forbidden fields (DAG introspection leak)
  const forbiddenFields = ['deps', 'pattern', 'remaining', 'handoffs', 'level', 'status', 'mode', 'expandedFrom', 'nodes'];
  for (const field of forbiddenFields) {
    if (field in briefObj) {
      errors.push({
        code: 'BRIEF_LEAKS_DAG_STATE',
        message: `Brief contains forbidden field '${field}' (violates Contract 7: Brief Isolation)`,
        path: field,
      });
    }
  }

  // Check for unknown fields
  for (const field of Object.keys(briefObj)) {
    if (!allowedFields.has(field)) {
      errors.push({
        code: 'BRIEF_UNKNOWN_FIELD',
        message: `Unknown field '${field}' in brief`,
        path: field,
      });
    }
  }

  // Validate required fields
  const required = ['position', 'produces', 'consumes', 'description', 'idempotent', 'validate'];
  for (const field of required) {
    if (!(field in briefObj)) {
      errors.push({
        code: 'BRIEF_MISSING_FIELD',
        message: `Missing required field: ${field}`,
        path: field,
      });
    }
  }

  // Type validation: position (string)
  if ('position' in briefObj && typeof briefObj.position !== 'string') {
    errors.push({
      code: 'BRIEF_INVALID_POSITION',
      message: `position must be string, got ${typeof briefObj.position}`,
      path: 'position',
    });
  }

  // Type validation: position non-empty
  if ('position' in briefObj && typeof briefObj.position === 'string' && !briefObj.position.trim()) {
    errors.push({
      code: 'BRIEF_EMPTY_POSITION',
      message: 'position cannot be empty',
      path: 'position',
    });
  }

  // Type validation: produces (non-empty string[])
  if ('produces' in briefObj) {
    if (!Array.isArray(briefObj.produces)) {
      errors.push({
        code: 'BRIEF_INVALID_PRODUCES',
        message: `produces must be array, got ${typeof briefObj.produces}`,
        path: 'produces',
      });
    } else {
      if (briefObj.produces.length === 0) {
        errors.push({
          code: 'BRIEF_EMPTY_PRODUCES',
          message: 'produces list cannot be empty',
          path: 'produces',
        });
      }

      for (let i = 0; i < briefObj.produces.length; i++) {
        const p = briefObj.produces[i];
        if (typeof p !== 'string') {
          errors.push({
            code: 'BRIEF_INVALID_PRODUCE_ITEM',
            message: `produces[${i}] must be string, got ${typeof p}`,
            path: `produces[${i}]`,
          });
        } else if (!p.trim()) {
          errors.push({
            code: 'BRIEF_EMPTY_PRODUCE_PATH',
            message: `produces[${i}] cannot be empty string`,
            path: `produces[${i}]`,
          });
        }
      }

      // Check for duplicate paths
      const producePaths = new Set<string>();
      for (let i = 0; i < briefObj.produces.length; i++) {
        const p = briefObj.produces[i];
        if (typeof p === 'string' && p.trim()) {
          if (producePaths.has(p)) {
            errors.push({
              code: 'BRIEF_DUPLICATE_PRODUCE',
              message: `produces contains duplicate path: ${p}`,
              path: `produces[${i}]`,
            });
          }
          producePaths.add(p);
        }
      }
    }
  }

  // Type validation: consumes (string[] — can be empty)
  if ('consumes' in briefObj) {
    if (!Array.isArray(briefObj.consumes)) {
      errors.push({
        code: 'BRIEF_INVALID_CONSUMES',
        message: `consumes must be array, got ${typeof briefObj.consumes}`,
        path: 'consumes',
      });
    } else {
      for (let i = 0; i < briefObj.consumes.length; i++) {
        const c = briefObj.consumes[i];
        if (typeof c !== 'string') {
          errors.push({
            code: 'BRIEF_INVALID_CONSUME_ITEM',
            message: `consumes[${i}] must be string, got ${typeof c}`,
            path: `consumes[${i}]`,
          });
        } else if (!c.trim()) {
          errors.push({
            code: 'BRIEF_EMPTY_CONSUME_PATH',
            message: `consumes[${i}] cannot be empty string`,
            path: `consumes[${i}]`,
          });
        }
      }

      // Check for duplicate paths
      const consumePaths = new Set<string>();
      for (let i = 0; i < briefObj.consumes.length; i++) {
        const c = briefObj.consumes[i];
        if (typeof c === 'string' && c.trim()) {
          if (consumePaths.has(c)) {
            errors.push({
              code: 'BRIEF_DUPLICATE_CONSUME',
              message: `consumes contains duplicate path: ${c}`,
              path: `consumes[${i}]`,
            });
          }
          consumePaths.add(c);
        }
      }

      // Sanity check: consumes and produces should not overlap
      if (Array.isArray(briefObj.produces)) {
        const producePaths = new Set(briefObj.produces);
        for (let i = 0; i < briefObj.consumes.length; i++) {
          const c = briefObj.consumes[i];
          if (typeof c === 'string' && producePaths.has(c)) {
            errors.push({
              code: 'BRIEF_CONSUME_PRODUCE_OVERLAP',
              message: `Path '${c}' appears in both consumes and produces`,
              path: `consumes[${i}]`,
            });
          }
        }
      }
    }
  }

  // Type validation: description (string)
  if ('description' in briefObj && typeof briefObj.description !== 'string') {
    errors.push({
      code: 'BRIEF_INVALID_DESCRIPTION',
      message: `description must be string, got ${typeof briefObj.description}`,
      path: 'description',
    });
  }

  // Type validation: description non-empty
  if ('description' in briefObj && typeof briefObj.description === 'string' && !briefObj.description.trim()) {
    errors.push({
      code: 'BRIEF_EMPTY_DESCRIPTION',
      message: 'description cannot be empty',
      path: 'description',
    });
  }

  // Type validation: idempotent (boolean)
  if ('idempotent' in briefObj && typeof briefObj.idempotent !== 'boolean') {
    errors.push({
      code: 'BRIEF_INVALID_IDEMPOTENT',
      message: `idempotent must be boolean, got ${typeof briefObj.idempotent}`,
      path: 'idempotent',
    });
  }

  // Type validation: validate (ValidationRule[])
  if ('validate' in briefObj) {
    if (!Array.isArray(briefObj.validate)) {
      errors.push({
        code: 'BRIEF_INVALID_VALIDATE',
        message: `validate must be array, got ${typeof briefObj.validate}`,
        path: 'validate',
      });
    } else {
      if (briefObj.validate.length === 0) {
        errors.push({
          code: 'BRIEF_EMPTY_VALIDATE',
          message: 'validate list cannot be empty',
          path: 'validate',
        });
      }

      for (let i = 0; i < briefObj.validate.length; i++) {
        const rule = briefObj.validate[i];
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
          errors.push({
            code: 'BRIEF_INVALID_VALIDATE_RULE',
            message: `validate[${i}] must be an object, got ${Array.isArray(rule) ? 'array' : typeof rule}`,
            path: `validate[${i}]`,
          });
        } else {
          const ruleObj = rule as Record<string, unknown>;

          // Rule must have type field
          if (!('type' in ruleObj)) {
            errors.push({
              code: 'BRIEF_VALIDATE_MISSING_TYPE',
              message: `validate[${i}] missing required field: type`,
              path: `validate[${i}].type`,
            });
          } else if (typeof ruleObj.type !== 'string') {
            errors.push({
              code: 'BRIEF_VALIDATE_INVALID_TYPE',
              message: `validate[${i}].type must be string, got ${typeof ruleObj.type}`,
              path: `validate[${i}].type`,
            });
          } else {
            const validTypes = ['artifact-exists', 'shell', 'spec-conformance', 'build-produces', 'launch-check', 'artifact-schema', 'intent'];
            const ruleType = ruleObj.type as string;
            if (!validTypes.includes(ruleType)) {
              errors.push({
                code: 'BRIEF_VALIDATE_UNKNOWN_TYPE',
                message: `validate[${i}].type '${ruleType}' is not a recognized validation rule type`,
                path: `validate[${i}].type`,
              });
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate and throw if brief schema is invalid.
 * Convenience wrapper for enforced validation.
 */
export function assertBriefSchema(brief: unknown): asserts brief is Brief {
  const result = validateBriefSchema(brief);
  if (!result.valid) {
    const errorMsg = result.errors.map(e => `[${e.code}] ${e.path ? `${e.path}: ` : ''}${e.message}`).join('\n');
    throw new BriefSchemaError('BRIEF_SCHEMA_INVALID', `Brief schema validation failed:\n${errorMsg}`, 'brief', {
      errorCount: result.errors.length,
      errors: result.errors,
    });
  }
}
