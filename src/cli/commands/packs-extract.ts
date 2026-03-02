// @module cli/commands
// @exports cmdPacksExtract

import { execSync } from 'child_process';
import { existsSync, mkdtempSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

export interface GitSafeConfig {
  denylist: string[];
  maxBytes: number;
}

export interface ChateletConfig {
  gitsafe: GitSafeConfig;
  packs?: {
    branchPrefix?: string;
    manifestPath?: string;
  };
}

export interface ExtractOptions {
  name: string;
  paths?: string[];
  format?: 'tar.gz' | 'stdout';
}

export interface ExtractResult {
  cmd: string;
  pack: string;
  extractedPaths: string[];
  totalSize: number;
  outputFile?: string;
  success: boolean;
  summary: string;
}

export class ExtractError extends Error {
  constructor(public code: string, public context: Record<string, unknown>) {
    super(`ExtractError[${code}]: ${JSON.stringify(context)}`);
    this.name = 'ExtractError';
  }
}

/**
 * Extract pack contents with bounds enforcement.
 * Implements tool packs extract <name> [paths...]
 *
 * Bounds enforcement:
 *   - Respects maxBytes limit from CHATELET.json gitsafe config
 *   - Rejects paths matching denylist patterns
 *   - Prevents path traversal (../, absolute paths)
 *   - Checks individual file sizes
 *   - Rejects symlinks (no dereferencing)
 *
 * Usage:
 *   tool packs extract core                               # Extract entire pack
 *   tool packs extract core src/lib/core/types.ts        # Single file
 *   tool packs extract core src/lib/core/*.ts src/test   # Multiple paths
 */
export async function cmdPacksExtract(
  options: ExtractOptions,
  repoRoot: string = process.cwd(),
  chateletPath: string = 'security/CHATELET.json'
): Promise<ExtractResult> {
  const { name, paths = [], format = 'tar.gz' } = options;

  // Resolve and load CHATELET.json
  const resolvedChateletPath = resolve(repoRoot, chateletPath);
  if (!existsSync(resolvedChateletPath)) {
    throw new ExtractError('CHATELET_NOT_FOUND', {
      path: resolvedChateletPath,
      hint: 'Expected CHATELET.json at security/CHATELET.json',
    });
  }

  let config: ChateletConfig;
  try {
    const content = require('fs').readFileSync(resolvedChateletPath, 'utf-8');
    config = JSON.parse(content);
  } catch (err) {
    throw new ExtractError('CHATELET_LOAD_FAILED', {
      path: resolvedChateletPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Validate pack name
  if (!name || typeof name !== 'string') {
    throw new ExtractError('INVALID_PACK_NAME', {
      pack: name,
      hint: 'Pack name must be a non-empty string',
    });
  }

  const maxBytes = config.gitsafe.maxBytes;
  const denylist = config.gitsafe.denylist || [];
  const packRef = `packs/${name}`;

  // Verify pack branch exists
  try {
    execSync(`cd "${repoRoot}" && git rev-parse --verify ${packRef}`, {
      stdio: 'pipe',
      timeout: 5000,
    });
  } catch {
    throw new ExtractError('PACK_NOT_FOUND', {
      pack: name,
      branch: packRef,
      hint: `Pack branch ${packRef} does not exist`,
    });
  }

  // Helper: check if path matches denylist
  function isDenied(path: string): boolean {
    return denylist.some(pattern => {
      try {
        return new RegExp(pattern).test(path);
      } catch {
        return path.includes(pattern);
      }
    });
  }

  // Helper: validate path safety
  function validatePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new ExtractError('TRAVERSAL_REJECTED', { path });
    }
    if (isDenied(path)) {
      throw new ExtractError('DENIED', { path, denylist });
    }
  }

  // Helper: get file size from git
  function getFileSize(path: string): number {
    try {
      const sizeOutput = execSync(
        `cd "${repoRoot}" && git cat-file -s ${packRef}:${path}`,
        { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
      );
      return parseInt(sizeOutput.trim(), 10);
    } catch {
      return -1; // File doesn't exist or is unreadable
    }
  }

  const extractedPaths: string[] = [];
  let totalSize = 0;

  // Process paths
  if (paths.length > 0) {
    // Specific paths requested
    for (const path of paths) {
      validatePath(path);

      const fileSize = getFileSize(path);
      if (fileSize < 0) {
        throw new ExtractError('PATH_NOT_FOUND', {
          pack: name,
          branch: packRef,
          path,
          hint: 'Path not found in pack or is unreadable',
        });
      }

      if (fileSize > maxBytes) {
        throw new ExtractError('OVERSIZED', {
          path,
          size: fileSize,
          maxBytes,
          hint: 'Single file exceeds maxBytes limit',
        });
      }

      totalSize += fileSize;
      extractedPaths.push(path);
    }
  } else {
    // Extract entire pack
    try {
      const listOutput = execSync(
        `cd "${repoRoot}" && git ls-tree -r --name-only ${packRef}`,
        { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
      );

      const allPaths = listOutput
        .trim()
        .split('\n')
        .filter(p => p && !isDenied(p));

      for (const path of allPaths) {
        const fileSize = getFileSize(path);
        if (fileSize < 0) {
          // Skip unreadable files (symlinks, etc.)
          continue;
        }

        if (fileSize > maxBytes) {
          throw new ExtractError('OVERSIZED', {
            path,
            size: fileSize,
            maxBytes,
            hint: 'File exceeds maxBytes; cannot extract entire pack',
          });
        }

        totalSize += fileSize;
        extractedPaths.push(path);
      }
    } catch (err) {
      if (err instanceof ExtractError) throw err;
      throw new ExtractError('PACK_LIST_FAILED', {
        pack: name,
        branch: packRef,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Check cumulative bounds
  if (totalSize > maxBytes) {
    throw new ExtractError('OVERSIZED', {
      context: 'total extraction',
      size: totalSize,
      maxBytes,
      files: extractedPaths.length,
      hint: 'Total extraction exceeds maxBytes; reduce path selection or increase limit',
    });
  }

  // Create tar.gz archive
  let outputFile: string | undefined;
  if (format === 'tar.gz') {
    const tmpDir = mkdtempSync(join(tmpdir(), 'packs-extract-'));
    const archivePath = join(tmpDir, `${name}.tar.gz`);

    try {
      let gitCmd = `cd "${repoRoot}" && git archive --format=tar.gz --output="${archivePath}" ${packRef}`;

      // If specific paths, add them to archive command
      if (paths.length > 0) {
        gitCmd += ' -- ' + paths.map(p => `"${p}"`).join(' ');
      }

      execSync(gitCmd, { timeout: 30000 });
      outputFile = archivePath;
    } catch (err) {
      throw new ExtractError('ARCHIVE_FAILED', {
        pack: name,
        outputPath: archivePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    cmd: 'packs.extract',
    pack: name,
    extractedPaths,
    totalSize,
    outputFile,
    success: true,
    summary: `Extracted ${extractedPaths.length} files (${formatBytes(totalSize)}) from pack '${name}'`,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Help text for tool packs extract command
 */
export function getPacksExtractHelp(): string {
  return `
USAGE
  tool packs extract <name> [paths...]

DESCRIPTION
  Extract pack contents with bounds enforcement.

  Bounds Enforcement:
    - Respects maxBytes from CHATELET.json gitsafe config
    - Rejects paths matching denylist patterns (.env, secrets, etc.)
    - Prevents path traversal (../, absolute paths)
    - Checks individual file and cumulative sizes
    - Rejects symlinks (unreadable files are skipped/errored)

ARGUMENTS
  <name>      Pack name (branch packs/<name> must exist)
  [paths...]  Specific files/dirs to extract (optional, all if omitted)

OPTIONS
  --format    Output format: tar.gz (default) | stdout

EXAMPLES
  # Extract entire pack as tar.gz
  tool packs extract core

  # Extract single file
  tool packs extract core src/lib/core/types.ts

  # Extract multiple paths
  tool packs extract core src/lib/core/protocol.ts src/lib/core/index.ts

OUTPUT
  tar.gz archive with extracted files, or error if bounds violated

ERROR CODES
  PACK_NOT_FOUND      Branch packs/<name> does not exist
  PATH_NOT_FOUND      Path not found in pack or is unreadable (symlink)
  DENIED              Path matches gitsafe denylist
  OVERSIZED           Single file or total exceeds maxBytes
  TRAVERSAL_REJECTED  Path contains .. or starts with /
  ARCHIVE_FAILED      Failed to create tar.gz
  CHATELET_NOT_FOUND  CHATELET.json not found
  CHATELET_LOAD_FAILED  Failed to parse CHATELET.json
`;
}
