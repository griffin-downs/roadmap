// @module recovery
// @exports AuditTrail, AuditEntry, logOrient, logModify, logCheckpoint, readTrail
// @types AuditTrail, AuditEntry
// @entry roadmap/recovery

import fs from 'fs';
import path from 'path';

/**
 * Audit trail entry: one operation in the session.
 */
export type AuditEntry = {
  timestamp: string;
  type: 'orient' | 'modify' | 'checkpoint' | 'restore' | 'merge' | 'error';
  session?: string;
  operator?: string;
  [key: string]: unknown;
};

/**
 * Audit trail: append-only log of operations.
 */
export class AuditTrail {
  private localPath: string;
  private globalPath: string;

  constructor(roadmapDir = '.roadmap') {
    this.localPath = path.join(roadmapDir, 'trail.jsonl');
    this.globalPath = path.join(process.env.HOME || '~', '.roadmap', 'trail.jsonl');
  }

  /**
   * Log orient operation.
   */
  logOrient(data: {
    position: string;
    produces: string[];
    consumes: string[];
    done: number;
    remaining: number;
  }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'orient',
      ...data,
    });
  }

  /**
   * Log modify operation.
   */
  logModify(data: { operation: 'add' | 'remove' | 'update'; nodeId: string; commit?: string }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'modify',
      ...data,
    });
  }

  /**
   * Log checkpoint creation.
   */
  logCheckpoint(data: { label: string; position: string; commit?: string }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'checkpoint',
      ...data,
    });
  }

  /**
   * Log checkpoint restore.
   */
  logRestore(data: { label: string; position: string; commit?: string }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'restore',
      ...data,
    });
  }

  /**
   * Log DAG merge.
   */
  logMerge(data: { g1: string; g2: string; position: string; commit?: string }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'merge',
      ...data,
    });
  }

  /**
   * Log error.
   */
  logError(data: { operation: string; code: string; context?: Record<string, unknown> }): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'error',
      ...data,
    });
  }

  /**
   * Read trail entries from local file.
   */
  readLocal(): AuditEntry[] {
    return this.read(this.localPath);
  }

  /**
   * Read trail entries from global file.
   */
  readGlobal(): AuditEntry[] {
    return this.read(this.globalPath);
  }

  /**
   * Get last N entries.
   */
  last(n: number): AuditEntry[] {
    return this.readLocal().slice(-n);
  }

  /**
   * Filter entries by type.
   */
  filterByType(type: AuditEntry['type']): AuditEntry[] {
    return this.readLocal().filter((e) => e.type === type);
  }

  /**
   * Archive local trail.
   */
  archive(): void {
    if (fs.existsSync(this.localPath)) {
      fs.unlinkSync(this.localPath);
    }
  }

  /**
   * Private: append entry to trail.
   */
  private append(entry: AuditEntry): void {
    try {
      const line = JSON.stringify(entry);

      // Append to local trail
      if (fs.existsSync(path.dirname(this.localPath))) {
        fs.appendFileSync(this.localPath, line + '\n');
      }

      // Append to global trail
      const globalDir = path.dirname(this.globalPath);
      if (fs.existsSync(globalDir)) {
        fs.appendFileSync(this.globalPath, line + '\n');
      }
    } catch {
      // Silently ignore trail failures
    }
  }

  /**
   * Private: read entries from file.
   */
  private read(filePath: string): AuditEntry[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }
}

/**
 * Default audit trail instance.
 */
const defaultTrail = new AuditTrail();

export function logOrient(data: Parameters<AuditTrail['logOrient']>[0]): void {
  defaultTrail.logOrient(data);
}

export function logModify(data: Parameters<AuditTrail['logModify']>[0]): void {
  defaultTrail.logModify(data);
}

export function logCheckpoint(data: Parameters<AuditTrail['logCheckpoint']>[0]): void {
  defaultTrail.logCheckpoint(data);
}

export function logRestore(data: Parameters<AuditTrail['logRestore']>[0]): void {
  defaultTrail.logRestore(data);
}

export function logMerge(data: Parameters<AuditTrail['logMerge']>[0]): void {
  defaultTrail.logMerge(data);
}

export function logError(data: Parameters<AuditTrail['logError']>[0]): void {
  defaultTrail.logError(data);
}

export function readTrail(): AuditEntry[] {
  return defaultTrail.readLocal();
}

export function getLastEntries(n: number): AuditEntry[] {
  return defaultTrail.last(n);
}

export function archiveTrail(): void {
  defaultTrail.archive();
}

