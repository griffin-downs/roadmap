// @module cli/commands
// @exports cmdPacksList, PackMetadata, PackListResult, formatPacksText, formatPacksJson
// @entry roadmap/cli

import { execSync } from 'node:child_process';

export interface PackMetadata {
  name: string;
  modules: number;
  size: number;
}

export interface PackListResult {
  packs: PackMetadata[];
  count: number;
  errors: string[];
}

function discoverPacks(repoRoot: string = '.'): string[] {
  try {
    const cmd = `cd "${repoRoot}" && git for-each-ref --format='%(refname:short)' refs/heads/packs/`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    const branches = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(branch => branch.replace(/^packs\//, ''))
      .sort();
    return branches;
  } catch (err) {
    return [];
  }
}

function getPackMetadata(repoRoot: string, packName: string): PackMetadata | null {
  try {
    const ref = `packs/${packName}`;

    // Count modules via git ls-tree (count directories or source files)
    const lsCmd = `cd "${repoRoot}" && git ls-tree -r ${ref} | grep -E '\\.ts$|\\.tsx$|\\.js$|\\.jsx$' | wc -l`;
    const moduleCount = Math.max(1, parseInt(execSync(lsCmd, { encoding: 'utf-8', timeout: 5000 }).trim(), 10) || 0);

    // Calculate pack size
    const sizeCmd = `cd "${repoRoot}" && git ls-tree -r --long ${ref} | awk '{sum += $4} END {print sum}'`;
    const sizeOutput = execSync(sizeCmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    const size = parseInt(sizeOutput, 10) || 0;

    return {
      name: packName,
      modules: moduleCount,
      size: Math.max(size, 0),
    };
  } catch (err) {
    return null;
  }
}

export function formatPacksText(packs: PackMetadata[]): string {
  if (packs.length === 0) {
    return '(no packs discovered)';
  }

  // Format: name, module count, human-readable size
  return packs
    .map(pack => {
      const sizeKB = pack.size > 0 ? Math.ceil(pack.size / 1024) : 0;
      const sizeStr = sizeKB > 0 ? `${sizeKB}KB` : '0KB';
      const moduleStr = pack.modules === 1 ? 'module' : 'modules';
      return `${pack.name}  ${pack.modules} ${moduleStr}, ${sizeStr}`;
    })
    .join('\n');
}

export function formatPacksJson(packs: PackMetadata[]): string {
  return JSON.stringify({ packs }, null, 2);
}

export async function cmdPacksList(
  repoRoot: string = '.',
  format: 'json' | 'text' = 'text'
): Promise<string> {
  const errors: string[] = [];
  const packNames = discoverPacks(repoRoot);

  const packs: PackMetadata[] = [];
  for (const name of packNames) {
    const metadata = getPackMetadata(repoRoot, name);
    if (metadata) {
      packs.push(metadata);
    } else {
      errors.push(`Failed to read metadata for pack: ${name}`);
    }
  }

  if (format === 'json') {
    return formatPacksJson(packs);
  } else {
    return formatPacksText(packs);
  }
}
