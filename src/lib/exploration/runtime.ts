// @module runtime-explore
// @exports launchApp, runExploreScript, mapObservationsToChecks, teardown
// @types LaunchHandle, ExploreScriptResult
// @entry roadmap

import { spawn, execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { ExploreResult, ObservationResult, ValidationCheck, ValidationRule } from '../protocol.ts';

// Handle returned by launchApp — caller must teardown
export interface LaunchHandle {
  process: ChildProcess;
  cdpUrl: string;
  port: number;
}

export interface ExploreScriptResult {
  success: boolean;
  result?: ExploreResult;
  error?: string;
}

// ── Launch Manager ──────────────────────────────────────────────────────────

export async function launchApp(opts: {
  command: string;
  port?: number;
  timeout?: number;
  rebuild?: boolean;
  buildCommand?: string;
}): Promise<LaunchHandle> {
  const port = opts.port ?? 9222;
  const timeout = opts.timeout ?? 10000;

  // Optional build step
  if (opts.buildCommand) {
    try {
      execSync(opts.buildCommand, { stdio: 'pipe', timeout: 60000 });
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || e.message || '';
      throw new Error(`Build failed: ${opts.buildCommand} — ${stderr.slice(0, 300)}`);
    }
  }

  // Optional native module rebuild
  if (opts.rebuild) {
    try {
      execSync('npx electron-rebuild', { stdio: 'pipe', timeout: 120000 });
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || e.message || '';
      throw new Error(`electron-rebuild failed: ${stderr.slice(0, 300)}`);
    }
  }

  // Launch app with CDP debugging enabled
  const child = spawn(opts.command, [`--remote-debugging-port=${port}`], {
    shell: true,
    stdio: 'pipe',
  });

  // Await CDP readiness by polling the /json/version endpoint
  const cdpUrl = `http://localhost:${port}`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      execSync(`curl -sf ${cdpUrl}/json/version`, { stdio: 'pipe', timeout: 2000 });
      return { process: child, cdpUrl, port };
    } catch {
      // Not ready yet — wait and retry
      await new Promise(r => setTimeout(r, 250));
    }

    // Check if process exited prematurely
    if (child.exitCode !== null) {
      const stderr = child.stderr?.read()?.toString() || '';
      throw new Error(`App exited prematurely (code ${child.exitCode}): ${stderr.slice(0, 300)}`);
    }
  }

  // Timeout — teardown and throw
  teardown(child);
  throw new Error(`CDP not ready after ${timeout}ms on port ${port}`);
}

// ── Explore Script Runner ───────────────────────────────────────────────────

export async function runExploreScript(opts: {
  script: string;
  cdpUrl: string;
  port: number;
  timeout?: number;
}): Promise<ExploreScriptResult> {
  const timeout = opts.timeout ?? 30000;

  return new Promise<ExploreScriptResult>((resolve) => {
    const child = spawn('npx', ['tsx', opts.script], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CDP_URL: opts.cdpUrl,
        CDP_PORT: String(opts.port),
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ success: false, error: `Explore script timed out after ${timeout}ms` });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ success: false, error: `Explore script exited ${code}: ${stderr.slice(0, 300)}` });
        return;
      }

      // Parse JSON from stdout — script may emit non-JSON lines before the result
      const lines = stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as ExploreResult;
          if (parsed.observations && Array.isArray(parsed.observations)) {
            resolve({ success: true, result: parsed });
            return;
          }
        } catch {
          // Not JSON — try previous line
        }
      }

      resolve({ success: false, error: `No valid ExploreResult JSON in stdout: ${stdout.slice(0, 200)}` });
    });
  });
}

// ── Observation → ValidationCheck mapping ───────────────────────────────────

export function mapObservationsToChecks(
  observations: ObservationResult[],
  rule: ValidationRule & { type: 'runtime-explore' },
): ValidationCheck[] {
  return observations.map((obs) => ({
    rule,
    passed: obs.pass,
    evidence: `[${obs.id}] ${obs.evidence}${obs.value !== undefined ? ` (value: ${obs.value})` : ''}`,
    observations: [obs], // attach observation result for intent enrichment
  }));
}

// ── Teardown ────────────────────────────────────────────────────────────────

export function teardown(proc: ChildProcess): void {
  if (proc.exitCode !== null) return; // already exited
  proc.kill('SIGTERM');
  // Force kill after 3s if still alive
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* already dead */ }
  }, 3000).unref();
}
