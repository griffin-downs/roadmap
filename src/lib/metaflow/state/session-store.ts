// @module metaflow/session-store
// @exports SessionStore

import type { RunId, SessionBinding, SessionsStore } from '../types.ts';
import { readSessions, writeSessions } from '../fs.ts';

export class SessionStore {
  private runId: RunId;
  private base: string;

  constructor(runId: RunId, opts: { base?: string } = {}) {
    this.runId = runId;
    this.base = opts.base ?? process.cwd();
  }

  /** Register a new session. Sets status='running'. */
  register(binding: Omit<SessionBinding, 'lastSeenAt' | 'status'>): void {
    const store = readSessions(this.runId, this.base);
    const existing = store.sessions.findIndex(s => s.workerId === binding.workerId);
    const entry: SessionBinding = {
      ...binding,
      lastSeenAt: new Date().toISOString(),
      status: 'running',
    };
    if (existing !== -1) {
      store.sessions[existing] = entry;
    } else {
      store.sessions.push(entry);
    }
    writeSessions(this.runId, store, this.base);
  }

  /** Update lastSeenAt for a worker. */
  touch(workerId: string): void {
    const store = readSessions(this.runId, this.base);
    const session = store.sessions.find(s => s.workerId === workerId);
    if (session) {
      session.lastSeenAt = new Date().toISOString();
      writeSessions(this.runId, store, this.base);
    }
  }

  /** Set a worker's status to idle. */
  retire(workerId: string): void {
    const store = readSessions(this.runId, this.base);
    const session = store.sessions.find(s => s.workerId === workerId);
    if (session) {
      session.status = 'idle';
      session.lastSeenAt = new Date().toISOString();
      writeSessions(this.runId, store, this.base);
    }
  }

  /** Find an idle session with superset capabilities. Returns null if none. */
  findReusable(capabilities: string[]): SessionBinding | null {
    const store = readSessions(this.runId, this.base);
    return store.sessions.find(
      s => s.status === 'idle' && capabilities.every(c => s.capabilities.includes(c))
    ) ?? null;
  }

  /** Validate that at least one session is registered. Throws with SESSION_BINDING_MISSING if not. */
  validate(): void {
    const store = readSessions(this.runId, this.base);
    if (!store.sessions || store.sessions.length === 0) {
      const err = new Error('SESSION_BINDING_MISSING: no sessions registered for this run');
      (err as any).code = 'SESSION_BINDING_MISSING';
      throw err;
    }
  }

  /** Set all sessions to idle (retire-team). */
  retireAll(): number {
    const store = readSessions(this.runId, this.base);
    const count = store.sessions.length;
    for (const s of store.sessions) {
      s.status = 'idle';
      s.lastSeenAt = new Date().toISOString();
    }
    writeSessions(this.runId, store, this.base);
    return count;
  }

  /** Mark team-reuse-missed in store. */
  markTeamReuseMissed(): void {
    const store = readSessions(this.runId, this.base);
    store.reuseField = { teamReuseMissed: true, missedAt: new Date().toISOString() };
    writeSessions(this.runId, store, this.base);
  }
}
