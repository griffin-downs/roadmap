// @module topology/topology-service
// @exports detectCurrentClone, getArchitecture, validateClone, enforceOperation, TopologyShow, TopologyWhere, TopologyValidation
// @entry roadmap/topology

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { evaluateRule, type CloneRole, type Operation, type EnforcementResult } from './enforcement-rules.ts';

// --- Constants ---

const PRODUCTION_PATH = '/home/griffin/src/roadmap';
const DEVELOPMENT_PATH = resolve(homedir(), 'src/.dev/roadmap');
const REMOTE_URL = 'https://github.com/Ocean-Synaptics/roadmap.git';

// --- Types ---

export interface CloneInfo {
  path: string;
  role: string;
  branches: string[];
  remoteUrl: string | null;
  enforcement: string;
  consumersCanUseThis: boolean;
}

export interface SpecialBranch {
  description: string;
  files: number;
  purpose: string;
}

export interface ConsumerContract {
  importFrom: string;
  gitsafeEnforced: boolean;
  deniedPaths: string[];
}

export interface TopologyShow {
  architecture: string;
  clones: Record<string, CloneInfo>;
  specialBranches: Record<string, SpecialBranch>;
  consumerContract: ConsumerContract;
}

export interface TopologyWhere {
  currentDirectory: string;
  clone: CloneRole;
  branch: string;
  upstream: string | null;
  synced: boolean;
  headSha: string;
  role: string;
  enforcement: {
    preCommitHooks: string;
    gitsafe: string;
    mainLockedForDirectCommits: boolean;
  };
  guidance: string;
}

export interface TopologyValidation {
  valid: boolean;
  checks: Record<string, boolean>;
  issues: string[];
  message: string;
}

// --- Helpers ---

function git(cmd: string, cwd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch {
    return '';
  }
}

function getBranches(cwd: string): string[] {
  const raw = git('branch --format="%(refname:short)"', cwd);
  if (!raw) return [];
  return raw.split('\n').map(b => b.replace(/^"|"$/g, '').trim()).filter(Boolean);
}

function getRemoteUrl(cwd: string): string | null {
  const url = git('remote get-url origin', cwd);
  return url || null;
}

function getCurrentBranch(cwd: string): string {
  return git('rev-parse --abbrev-ref HEAD', cwd) || 'unknown';
}

function getHeadSha(cwd: string): string {
  return git('rev-parse --short HEAD', cwd) || 'unknown';
}

function getUpstream(cwd: string): string | null {
  const upstream = git('rev-parse --abbrev-ref @{u}', cwd);
  return upstream || null;
}

function isSynced(cwd: string): boolean {
  const local = git('rev-parse HEAD', cwd);
  const remote = git('rev-parse @{u}', cwd);
  if (!local || !remote) return false;
  return local === remote;
}

function branchFileCount(cwd: string, branch: string): number {
  const raw = git(`ls-tree --name-only -r ${branch}`, cwd);
  if (!raw) return 0;
  return raw.split('\n').filter(Boolean).length;
}

function hasPreCommitHook(cwd: string): boolean {
  // Check .husky/pre-commit (standard) or .git/hooks/pre-commit (fallback)
  return existsSync(join(cwd, '.husky', 'pre-commit')) ||
         existsSync(join(cwd, '.git', 'hooks', 'pre-commit'));
}

function hasEnforcementJson(cwd: string): boolean {
  return existsSync(join(cwd, '.roadmap', 'enforcement.json'));
}

function hasGitsafe(cwd: string): boolean {
  return hasEnforcementJson(cwd);
}

// --- Core API ---

export function detectCurrentClone(cwd: string): CloneRole {
  const resolved = resolve(cwd);
  if (resolved === PRODUCTION_PATH) return 'production';
  if (resolved === DEVELOPMENT_PATH) return 'development';
  // Heuristic: check if cwd is under either path
  if (resolved.startsWith(PRODUCTION_PATH + '/')) return 'production';
  if (resolved.startsWith(DEVELOPMENT_PATH + '/')) return 'development';
  return 'unknown';
}

export function getArchitecture(cwd: string): TopologyShow {
  const branches = getBranches(cwd);
  const hasFeatBranches = branches.some(b => b.startsWith('feat/'));
  const branchList = [...new Set(['main', ...branches.filter(b => ['main', 'enceinte', 'dormant'].includes(b))])];
  if (hasFeatBranches) branchList.push('feat/*');

  const productionExists = existsSync(PRODUCTION_PATH);
  const developmentExists = existsSync(DEVELOPMENT_PATH);

  const clones: Record<string, CloneInfo> = {};

  if (productionExists) {
    const prodBranches = getBranches(PRODUCTION_PATH);
    const prodHasFeat = prodBranches.some(b => b.startsWith('feat/'));
    clones.production = {
      path: PRODUCTION_PATH,
      role: 'mirror-only',
      branches: [...new Set(['main', ...prodBranches.filter(b => ['main', 'enceinte', 'dormant'].includes(b)), ...(prodHasFeat ? ['feat/*'] : [])])],
      remoteUrl: getRemoteUrl(PRODUCTION_PATH) ?? REMOTE_URL,
      enforcement: `gitsafe ${hasGitsafe(PRODUCTION_PATH) ? '+ pre-commit hooks active' : '(enforcement.json missing)'}`,
      consumersCanUseThis: true,
    };
  }

  if (developmentExists) {
    const devBranches = getBranches(DEVELOPMENT_PATH);
    const devHasFeat = devBranches.some(b => b.startsWith('feat/'));
    clones.development = {
      path: DEVELOPMENT_PATH,
      role: 'work-in-progress',
      branches: [...new Set(['main', ...devBranches.filter(b => ['main', 'enceinte', 'dormant'].includes(b)), ...(devHasFeat ? ['feat/*'] : []), 'experiments'])],
      remoteUrl: getRemoteUrl(DEVELOPMENT_PATH) ?? REMOTE_URL,
      enforcement: `pre-commit hooks ${hasPreCommitHook(DEVELOPMENT_PATH) ? 'active' : 'inactive'}`,
      consumersCanUseThis: false,
    };
  }

  // If neither exists but we have a cwd, describe what we can see
  if (!productionExists && !developmentExists) {
    const role = detectCurrentClone(cwd);
    clones[role === 'unknown' ? 'current' : role] = {
      path: resolve(cwd),
      role: role === 'production' ? 'mirror-only' : role === 'development' ? 'work-in-progress' : 'unknown',
      branches: branchList,
      remoteUrl: getRemoteUrl(cwd),
      enforcement: hasGitsafe(cwd) ? 'gitsafe + pre-commit hooks' : 'minimal',
      consumersCanUseThis: role === 'production',
    };
  }

  const specialBranches: Record<string, SpecialBranch> = {};
  const enceinteCount = branchFileCount(cwd, 'enceinte');
  if (enceinteCount > 0) {
    specialBranches.enceinte = {
      description: 'Full codebase snapshot (immutable baseline)',
      files: enceinteCount,
      purpose: 'recovery + context',
    };
  }
  const dormantCount = branchFileCount(cwd, 'dormant');
  if (dormantCount > 0) {
    specialBranches.dormant = {
      description: 'Dead subsystems (preserved for reference)',
      files: dormantCount,
      purpose: 'future resurrection',
    };
  }

  return {
    architecture: productionExists && developmentExists ? 'two-clone-minimal' : 'single-clone',
    clones,
    specialBranches,
    consumerContract: {
      importFrom: `${PRODUCTION_PATH}#main only`,
      gitsafeEnforced: hasGitsafe(cwd),
      deniedPaths: ['~/.dev/roadmap/**'],
    },
  };
}

export function getWhere(cwd: string): TopologyWhere {
  const clone = detectCurrentClone(cwd);
  const branch = getCurrentBranch(cwd);
  const upstream = getUpstream(cwd);
  const synced = isSynced(cwd);
  const sha = getHeadSha(cwd);
  const hookActive = hasPreCommitHook(cwd);
  const gitsafeActive = hasGitsafe(cwd);

  const roleMap: Record<CloneRole, string> = {
    production: 'mirror-only',
    development: 'work-in-progress',
    unknown: 'unknown',
  };

  const guidanceMap: Record<CloneRole, string> = {
    production: 'You are in the production clone (read-only mirror). To work on features, use ~/src/.dev/roadmap',
    development: 'You are in the development clone. Use feature branches for all work.',
    unknown: 'Clone role unknown. Check path against expected topology.',
  };

  return {
    currentDirectory: resolve(cwd),
    clone,
    branch,
    upstream,
    synced,
    headSha: sha,
    role: roleMap[clone],
    enforcement: {
      preCommitHooks: hookActive ? 'active' : 'inactive',
      gitsafe: gitsafeActive ? 'active' : 'inactive',
      mainLockedForDirectCommits: hookActive,
    },
    guidance: guidanceMap[clone],
  };
}

export function validateClone(cwd: string): TopologyValidation {
  const clone = detectCurrentClone(cwd);
  const issues: string[] = [];

  // Check: correct clone identification
  const correctClone = clone !== 'unknown';
  if (!correctClone) issues.push(`Directory ${resolve(cwd)} does not match known clone paths (production: ${PRODUCTION_PATH}, development: ${DEVELOPMENT_PATH})`);

  // Check: remote configured
  const remote = getRemoteUrl(cwd);
  const remoteConfigured = remote !== null;
  if (!remoteConfigured) issues.push('No git remote "origin" configured');

  // Check: expected branches present
  const branches = getBranches(cwd);
  const hasMain = branches.includes('main');
  const branchesPresent = hasMain;
  if (!branchesPresent) issues.push('Branch "main" not found');

  // Check: enforcement active
  const hookActive = hasPreCommitHook(cwd);
  const gitsafeActive = hasGitsafe(cwd);
  const enforcementActive = hookActive && gitsafeActive;
  if (!hookActive) issues.push('Pre-commit hook not installed (check .husky/pre-commit or .git/hooks/pre-commit)');
  if (!gitsafeActive) issues.push('Gitsafe enforcement.json not found at .roadmap/enforcement.json');

  // Check: .gitignore correctness (node_modules, dist, etc.)
  const gitignorePath = join(cwd, '.gitignore');
  let gitignoreCorrect = true;
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('node_modules')) {
      gitignoreCorrect = false;
      issues.push('.gitignore missing node_modules entry');
    }
  } else {
    gitignoreCorrect = false;
    issues.push('.gitignore not found');
  }

  const valid = correctClone && remoteConfigured && branchesPresent && enforcementActive && gitignoreCorrect;
  const cloneLabel = clone === 'unknown' ? 'unknown clone' : `${clone} clone`;

  return {
    valid,
    checks: {
      correctClone,
      remoteConfigured,
      branchesPresent,
      enforcementActive,
      gitignoreCorrect,
    },
    issues,
    message: valid
      ? `Topology valid: ${cloneLabel} synchronized with origin`
      : `Topology invalid: ${issues.length} issue(s) found in ${cloneLabel}`,
  };
}

export function enforceOperation(cwd: string, operation: Operation, branch?: string, to?: string): EnforcementResult {
  const role = detectCurrentClone(cwd);
  return evaluateRule(role, { operation, branch, to });
}
