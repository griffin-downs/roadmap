// @module audit
// @exports AuditTrail
// @types AuditEntry, AuditSession
// @entry roadmap/recovery

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AuditEntry {
  readonly nodeId: string;
  readonly status: 'complete' | 'failed' | 'skipped';
  readonly duration: number;
  readonly artifacts?: Array<{ path: string; hash: string }>;
  readonly validation?: { type: string; passed: boolean };
  readonly error?: string;
}

export interface AuditSession {
  readonly sessionId: string;
  readonly agent: string;
  readonly start: number;
  end?: number;
  readonly restoredFrom?: string;
  entries: AuditEntry[];
}

export class AuditTrail {
  private session: AuditSession | null = null;
  private entries: AuditEntry[] = [];

  constructor(private repoRoot: string) {}

  /**
   * Start audit session
   */
  startSession(agent: string, restoredFrom?: string): void {
    const now = Date.now();
    const timestamp = new Date(now).toISOString().replace(/[^\d]/g, '').slice(0, 14);
    this.session = {
      sessionId: `session-${timestamp}`,
      agent,
      start: now,
      restoredFrom,
      entries: [],
    };
    this.entries = [];
  }

  /**
   * Record node completion
   */
  record(entry: AuditEntry): void {
    this.entries.push(entry);
  }

  /**
   * End session and write audit files
   */
  async endSession(): Promise<void> {
    if (!this.session) throw new Error('No active session');

    this.session.end = Date.now();
    this.session.entries = this.entries;

    // Write JSON (machine-readable)
    const auditDir = join(this.repoRoot, '.roadmap', 'audit');
    await mkdir(auditDir, { recursive: true });
    await writeFile(
      join(auditDir, `${this.session.sessionId}.json`),
      JSON.stringify(this.session, null, 2)
    );

    // Append to AUDIT.md (human-readable)
    await this.appendMarkdown();

    this.session = null;
    this.entries = [];
  }

  /**
   * Append session to AUDIT.md
   */
  private async appendMarkdown(): Promise<void> {
    if (!this.session) return;

    const auditPath = join(this.repoRoot, 'AUDIT.md');
    const mdEntry = this.formatMarkdown();

    try {
      const existing = await readFile(auditPath, 'utf-8');
      await writeFile(auditPath, existing + '\n' + mdEntry);
    } catch {
      await writeFile(auditPath, mdEntry);
    }
  }

  /**
   * Format session as markdown
   */
  private formatMarkdown(): string {
    if (!this.session) return '';

    const startDate = new Date(this.session.start).toISOString();
    const duration = this.session.end ? (this.session.end - this.session.start) / 1000 : 0;
    const restored = this.session.restoredFrom ? `\nRestored from: ${this.session.restoredFrom}` : '';

    const rows = this.entries
      .map(
        e =>
          `| ${e.nodeId} | ${e.status === 'complete' ? '✓' : e.status === 'failed' ? '✗' : '—'} | ${(e.duration / 1000).toFixed(2)}s | ${e.artifacts?.map(a => a.path).join(', ') || '—'} | ${e.error || '—'} |`
      )
      .join('\n');

    return `## Session ${this.session.sessionId} (${startDate})

Agent: ${this.session.agent}${restored}

| Phase | Status | Duration | Artifacts | Notes |
|-------|--------|----------|-----------|-------|
${rows}

**Summary**: ${this.entries.length} phases, ${this.entries.filter(e => e.status === 'complete').length} passed, ${this.entries.filter(e => e.status === 'failed').length} failed (${duration.toFixed(1)}s total)
`;
  }

  /**
   * Query: get all failed phases
   */
  getFailedPhases(): string[] {
    return this.entries.filter(e => e.status === 'failed').map(e => e.nodeId);
  }

  /**
   * Query: get all artifacts with hashes
   */
  getArtifacts(): Array<{ nodeId: string; path: string; hash: string }> {
    const result = [];
    for (const entry of this.entries) {
      if (entry.artifacts) {
        for (const artifact of entry.artifacts) {
          result.push({ nodeId: entry.nodeId, ...artifact });
        }
      }
    }
    return result;
  }

  /**
   * Query: get total duration
   */
  getTotalDuration(): number {
    return this.entries.reduce((sum, e) => sum + e.duration, 0);
  }
}

export async function createAuditTrail(repoRoot: string): Promise<AuditTrail> {
  return new AuditTrail(repoRoot);
}

export default createAuditTrail;
