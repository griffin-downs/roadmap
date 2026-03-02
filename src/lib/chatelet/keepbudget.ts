// @module chatelet
// @exports loadChatelet, validateChatelet, checkKeepBudget
// @types KeepBudget, KeepBudgetViolation, ValidationResult
// @entry roadmap/chatelet

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, join, isAbsolute } from 'node:path';
import type {
  KeepBudget,
  KeepBudgetViolation,
  ValidationResult,
} from './types.js';
import { ChateletError } from './types.js';

export type { KeepBudget, KeepBudgetViolation, ValidationResult };
export { ChateletError };

function loadJsonFile<T>(path: string): T {
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    throw new ChateletError('FILE_READ_ERROR', {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function loadChatelet(path: string): KeepBudget {
  if (!existsSync(path)) {
    throw new ChateletError('FILE_NOT_FOUND', { path });
  }

  const data = loadJsonFile<unknown>(path);
  const result = validateChateletStructure(data);

  if (!result.passed) {
    throw new ChateletError('INVALID_SCHEMA', {
      path,
      errors: result.errors,
    });
  }

  return data as KeepBudget;
}

function validateChateletStructure(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('CHATELET.json must be a JSON object');
    return { passed: false, errors, warnings };
  }

  const obj = data as Record<string, unknown>;

  // Version check
  if (obj.version !== '1.0') {
    errors.push('version must be "1.0"');
  }

  // Keep section
  if (!obj.keep || typeof obj.keep !== 'object') {
    errors.push('keep section is required and must be an object');
  } else {
    const keep = obj.keep as Record<string, unknown>;

    if (typeof keep.maxFiles !== 'number' || keep.maxFiles <= 0) {
      errors.push('keep.maxFiles must be a positive number');
    }

    if (typeof keep.maxLineCount !== 'number' || keep.maxLineCount <= 0) {
      errors.push('keep.maxLineCount must be a positive number');
    }

    if (!Array.isArray(keep.allowedDirs)) {
      errors.push('keep.allowedDirs must be an array of strings');
    } else {
      for (const dir of keep.allowedDirs) {
        if (typeof dir !== 'string') {
          errors.push('keep.allowedDirs must contain only strings');
          break;
        }
      }
    }
  }

  // Packs section
  if (!obj.packs || typeof obj.packs !== 'object') {
    errors.push('packs section is required and must be an object');
  } else {
    const packs = obj.packs as Record<string, unknown>;

    if (typeof packs.discoveryRoot !== 'string') {
      errors.push('packs.discoveryRoot must be a string');
    }

    if (typeof packs.maxSize !== 'number' || packs.maxSize <= 0) {
      errors.push('packs.maxSize must be a positive number');
    }
  }

  // GitSafe section
  if (!obj.gitsafe || typeof obj.gitsafe !== 'object') {
    errors.push('gitsafe section is required and must be an object');
  } else {
    const gitsafe = obj.gitsafe as Record<string, unknown>;

    if (!Array.isArray(gitsafe.denylist)) {
      errors.push('gitsafe.denylist must be an array of strings');
    } else {
      for (const pattern of gitsafe.denylist) {
        if (typeof pattern !== 'string') {
          errors.push('gitsafe.denylist must contain only strings');
          break;
        }
      }
    }

    if (typeof gitsafe.maxBytes !== 'number' || gitsafe.maxBytes <= 0) {
      errors.push('gitsafe.maxBytes must be a positive number');
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateChatelet(budget: KeepBudget): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Version validation
  if (budget.version !== '1.0') {
    errors.push('Unsupported CHATELET.json version: ' + budget.version);
  }

  // Keep constraints validation
  if (!budget.keep) {
    errors.push('keep section is missing');
  } else {
    if (budget.keep.maxFiles <= 0) {
      errors.push('keep.maxFiles must be positive');
    }

    if (budget.keep.maxLineCount <= 0) {
      errors.push('keep.maxLineCount must be positive');
    }

    if (!Array.isArray(budget.keep.allowedDirs) || budget.keep.allowedDirs.length === 0) {
      warnings.push('keep.allowedDirs is empty; keep/ will not be used');
    }
  }

  // Packs constraints validation
  if (!budget.packs) {
    errors.push('packs section is missing');
  } else {
    if (!budget.packs.discoveryRoot) {
      errors.push('packs.discoveryRoot must not be empty');
    }

    if (budget.packs.maxSize <= 0) {
      errors.push('packs.maxSize must be positive');
    }
  }

  // GitSafe constraints validation
  if (!budget.gitsafe) {
    errors.push('gitsafe section is missing');
  } else {
    if (!Array.isArray(budget.gitsafe.denylist)) {
      errors.push('gitsafe.denylist must be an array');
    }

    if (budget.gitsafe.maxBytes <= 0) {
      errors.push('gitsafe.maxBytes must be positive');
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

function countFileLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function getAllFilesRecursive(dirPath: string): string[] {
  const files: string[] = [];

  if (!existsSync(dirPath)) {
    return files;
  }

  function traverse(currentPath: string): void {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory read failed
    }
  }

  traverse(dirPath);
  return files;
}

export function checkKeepBudget(repoRoot: string, budget: KeepBudget): KeepBudgetViolation[] {
  const violations: KeepBudgetViolation[] = [];

  // First validate the budget structure itself
  const validateResult = validateChatelet(budget);
  if (!validateResult.passed) {
    for (const error of validateResult.errors) {
      violations.push({
        type: 'forbidden-directory',
        severity: 'error',
        message: 'Invalid KeepBudget: ' + error,
      });
    }
    return violations;
  }

  const keepDir = join(repoRoot, 'keep');

  if (!existsSync(keepDir)) {
    // No keep directory yet - no violations
    return violations;
  }

  // Get all files in keep/ directory
  const allowedDirPatterns = budget.keep.allowedDirs;
  const keepFiles: string[] = [];

  for (const dir of allowedDirPatterns) {
    const dirPath = join(repoRoot, dir);
    if (existsSync(dirPath)) {
      const files = getAllFilesRecursive(dirPath);
      keepFiles.push(...files);
    }
  }

  // Remove duplicates
  const uniqueFiles = Array.from(new Set(keepFiles));

  // Check file count
  if (uniqueFiles.length > budget.keep.maxFiles) {
    violations.push({
      type: 'file-count-exceeded',
      severity: 'error',
      message: `keep/ has ${uniqueFiles.length} files, exceeds limit of ${budget.keep.maxFiles}`,
      remediation: `Remove ${uniqueFiles.length - budget.keep.maxFiles} files or increase keep.maxFiles`,
      details: {
        current: uniqueFiles.length,
        limit: budget.keep.maxFiles,
        excess: uniqueFiles.length - budget.keep.maxFiles,
      },
    });
  }

  // Check total line count
  let totalLines = 0;
  for (const file of uniqueFiles) {
    const lines = countFileLines(file);
    totalLines += lines;
  }

  if (totalLines > budget.keep.maxLineCount) {
    violations.push({
      type: 'line-count-exceeded',
      severity: 'error',
      message: `keep/ has ${totalLines} total lines, exceeds limit of ${budget.keep.maxLineCount}`,
      remediation: `Remove ${totalLines - budget.keep.maxLineCount} lines or increase keep.maxLineCount`,
      details: {
        current: totalLines,
        limit: budget.keep.maxLineCount,
        excess: totalLines - budget.keep.maxLineCount,
      },
    });
  }

  // Check for forbidden directories (files outside allowedDirs)
  const keepRelativeFiles = new Set(
    uniqueFiles.map(f => relative(repoRoot, f))
  );

  for (const allowedDir of allowedDirPatterns) {
    // Ensure allowed dirs are checked
    const dirPattern = resolve(repoRoot, allowedDir);
  }

  // Any file in keep/* that is not under an allowedDir is a violation
  const allKeepFiles = getAllFilesRecursive(keepDir);
  for (const file of allKeepFiles) {
    const relativePath = relative(repoRoot, file);
    let isAllowed = false;

    for (const allowedDir of allowedDirPatterns) {
      if (relativePath.startsWith(allowedDir)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      violations.push({
        type: 'forbidden-directory',
        severity: 'error',
        message: `File ${relativePath} is in keep/ but not in allowedDirs`,
        remediation: `Move ${relativePath} to an allowed directory or add its directory to keep.allowedDirs`,
        details: {
          file: relativePath,
          allowedDirs: allowedDirPatterns,
        },
      });
    }
  }

  return violations;
}
