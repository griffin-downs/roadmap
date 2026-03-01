// @module audit/schema
// @exports SurfaceSchema, FileEntry, FileRole
// @entry roadmap/audit

export type FileRole =
  | 'cli-entry'
  | 'command'
  | 'test'
  | 'script'
  | 'doc'
  | 'config'
  | 'generated'
  | 'core'
  | 'lib';

export interface FileEntry {
  path: string;
  role: FileRole;
  hash: string;
  sizeBytes: number;
  exports?: string[];
}

export interface SurfaceSchema {
  version: number;
  timestamp: string;
  root: string;
  files: FileEntry[];
  summary: {
    total: number;
    byRole: Record<FileRole, number>;
  };
}
