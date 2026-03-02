// @module fixtures/test-repo-factory
// @exports TestRepo, createTestRepo
// @types TestRepoConfig, GitCommit
// @entry test-utils

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

export interface GitCommit {
  sha: string;
  message: string;
  timestamp: string;
}

export interface TestRepoConfig {
  name?: string;
  basePath?: string;
  initGit?: boolean;
}

/**
 * TestRepo: Factory for creating isolated test repositories with full roadmap state
 *
 * Provides:
 * - Temporary directory management (auto-cleanup)
 * - Git operations (init, commit, state tracking)
 * - File operations (write, read, exists checks)
 * - Roadmap file access (.roadmap/head.json, git-state.json, recovery-state.json)
 * - State inspection (getCurrentSha, getHeadJson, etc.)
 */
export class TestRepo {
  readonly basePath: string;
  readonly repoPath: string;
  readonly roadmapPath: string;
  private initialized = false;
  private commits: Map<string, GitCommit> = new Map();

  constructor(config: TestRepoConfig = {}) {
    const basePath = config.basePath || mkdtempSync(join('/tmp', `roadmap-test-${Date.now()}-`));
    this.basePath = basePath;
    this.repoPath = basePath;
    this.roadmapPath = join(this.repoPath, '.roadmap');

    // Create base directories
    mkdirSync(this.roadmapPath, { recursive: true });
    mkdirSync(join(this.repoPath, 'src'), { recursive: true });

    // Initialize git if requested
    if (config.initGit !== false) {
      this.initializeGit();
    }

    this.initialized = true;
  }

  /**
   * Factory: Create and initialize a test repo with defaults
   */
  static setup(name: string = 'test-repo'): TestRepo {
    return new TestRepo({ name, initGit: true });
  }

  /**
   * Initialize git repo
   */
  private initializeGit(): void {
    try {
      execSync('git init', { cwd: this.repoPath, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: this.repoPath, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: this.repoPath, stdio: 'pipe' });
    } catch (err) {
      throw new Error(`Failed to initialize git: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * Create a git commit
   * Returns the commit SHA
   */
  createCommit(message: string, filePath: string = 'test.txt', content: string = 'test'): string {
    try {
      // Write file if path provided
      if (filePath) {
        this.writeFile(filePath, content);
      }

      // Add and commit
      execSync(`git add -A`, { cwd: this.repoPath, stdio: 'pipe' });
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.repoPath,
        stdio: 'pipe',
      });

      // Get the SHA
      const sha = execSync('git rev-parse HEAD', {
        cwd: this.repoPath,
        encoding: 'utf-8',
      }).trim();

      // Track the commit
      this.commits.set(sha, {
        sha,
        message,
        timestamp: new Date().toISOString(),
      });

      return sha;
    } catch (err) {
      throw new Error(`Failed to create commit: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * Get current git HEAD SHA
   */
  getCurrentSha(): string {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.repoPath,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return 'HEAD'; // No commits yet
    }
  }

  /**
   * Write a file to the repo
   */
  writeFile(path: string, content: string): void {
    const fullPath = resolve(this.repoPath, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  /**
   * Read a file from the repo
   */
  readFile(path: string): string {
    const fullPath = resolve(this.repoPath, path);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${path}`);
    }
    return readFileSync(fullPath, 'utf-8');
  }

  /**
   * Check if a file exists
   */
  fileExists(path: string): boolean {
    return existsSync(resolve(this.repoPath, path));
  }

  /**
   * Get head.json content
   */
  getHeadJson(): any {
    const path = join(this.roadmapPath, 'head.json');
    if (!existsSync(path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Write head.json
   */
  setHeadJson(dag: any): void {
    const path = join(this.roadmapPath, 'head.json');
    writeFileSync(path, JSON.stringify(dag, null, 2) + '\n');
  }

  /**
   * Get git-state.json content
   */
  getGitState(): any {
    const path = join(this.roadmapPath, 'git-state.json');
    if (!existsSync(path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Write git-state.json
   */
  setGitState(state: any): void {
    const path = join(this.roadmapPath, 'git-state.json');
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
  }

  /**
   * Get recovery-state.json content
   */
  getRecoveryState(): any | null {
    const path = join(this.roadmapPath, 'recovery-state.json');
    if (!existsSync(path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Write recovery-state.json
   */
  setRecoveryState(state: any): void {
    const path = join(this.roadmapPath, 'recovery-state.json');
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
  }

  /**
   * Get trail.jsonl content as parsed entries
   */
  getTrailEntries(): any[] {
    const path = join(this.roadmapPath, 'trail.jsonl');
    if (!existsSync(path)) {
      return [];
    }
    try {
      const content = readFileSync(path, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Append entry to trail.jsonl
   */
  appendTrailEntry(entry: any): void {
    const path = join(this.roadmapPath, 'trail.jsonl');
    const line = JSON.stringify(entry) + '\n';
    if (existsSync(path)) {
      const current = readFileSync(path, 'utf-8');
      writeFileSync(path, current + line);
    } else {
      writeFileSync(path, line);
    }
  }

  /**
   * Create a head.{dagId}.json alternate DAG
   */
  createAlternateDag(dagId: string, dagContent: any): void {
    const path = join(this.roadmapPath, `head.${dagId}.json`);
    writeFileSync(path, JSON.stringify(dagContent, null, 2) + '\n');
  }

  /**
   * Clean up the test repo (remove temp directory)
   */
  teardown(): void {
    if (!this.initialized) return;
    try {
      if (existsSync(this.repoPath)) {
        rmSync(this.repoPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`Warning: failed to teardown test repo: ${err}`);
    }
    this.initialized = false;
  }

  /**
   * Get absolute path for a relative path in the repo
   */
  resolve(path: string): string {
    return resolve(this.repoPath, path);
  }
}

/**
 * Convenience factory function
 */
export function createTestRepo(config: TestRepoConfig = {}): TestRepo {
  return new TestRepo(config);
}
