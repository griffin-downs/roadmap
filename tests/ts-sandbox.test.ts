import { describe, it, expect } from 'vitest';
import {
  validateImports,
  extractImports,
  executeSandboxed,
  typecheckCode,
  detectDangerousAPIs,
  IMPORT_ALLOWLIST,
} from '../src/lib/ts-sandbox.ts';

describe('ts-sandbox', () => {
  describe('extractImports', () => {
    it('extracts static imports', () => {
      const code = `import { define } from 'roadmap/protocol';\nimport path from 'node:path';`;
      expect(extractImports(code)).toContain('roadmap/protocol');
      expect(extractImports(code)).toContain('node:path');
    });

    it('extracts dynamic imports', () => {
      expect(extractImports(`const m = import('node:fs');`)).toContain('node:fs');
    });

    it('extracts require calls', () => {
      expect(extractImports(`const x = require('node:fs');`)).toContain('node:fs');
    });

    it('extracts type imports', () => {
      expect(extractImports(`import type { Graph } from 'roadmap/protocol';`)).toContain('roadmap/protocol');
    });
  });

  describe('validateImports', () => {
    it('allows listed modules', () => {
      const r = validateImports(`import { define } from 'roadmap/protocol';`);
      expect(r.valid).toBe(true);
      expect(r.blocked).toEqual([]);
    });

    it('blocks unlisted modules', () => {
      const r = validateImports(`import fs from 'node:fs';`);
      expect(r.valid).toBe(false);
      expect(r.blocked).toContain('node:fs');
    });

    it('allows relative lib imports', () => {
      const r = validateImports(`import { foo } from './bar.ts';`);
      expect(r.valid).toBe(true);
    });

    it('allows src/lib/ imports', () => {
      const r = validateImports(`import { foo } from 'src/lib/claims.ts';`);
      expect(r.valid).toBe(true);
    });

    it('blocks network modules', () => {
      const r = validateImports(`import http from 'node:http';`);
      expect(r.valid).toBe(false);
    });
  });

  describe('detectDangerousAPIs', () => {
    it('detects child_process', () => {
      expect(detectDangerousAPIs('child_process')).toHaveLength(1);
    });

    it('detects fetch', () => {
      expect(detectDangerousAPIs('fetch("url")')).toHaveLength(1);
    });

    it('passes clean code', () => {
      expect(detectDangerousAPIs('const x = 1 + 2;')).toHaveLength(0);
    });
  });

  describe('executeSandboxed', () => {
    it('executes valid code', () => {
      const r = executeSandboxed('console.log("ok")');
      expect(r.ok).toBe(true);
      if ('stdout' in r) expect(r.stdout).toBe('ok');
    });

    it('rejects blocked imports', () => {
      const r = executeSandboxed(`import fs from 'node:fs'; fs.readFileSync('/etc/passwd');`);
      expect(r.ok).toBe(false);
      if ('blockedImports' in r) expect(r.blockedImports).toContain('node:fs');
    });

    it('rejects dangerous APIs', () => {
      const r = executeSandboxed('const { execSync } = require("child_process");');
      expect(r.ok).toBe(false);
    });

    it('captures non-zero exit', () => {
      const r = executeSandboxed('throw new Error("fail");');
      expect(r.ok).toBe(true);
      if ('exitCode' in r) expect(r.exitCode).not.toBe(0);
    });
  });

  describe('typecheckCode', () => {
    it('rejects blocked imports before typechecking', () => {
      const r = typecheckCode(`import fs from 'node:fs';`);
      expect(r.ok).toBe(false);
    });
  });

  describe('IMPORT_ALLOWLIST', () => {
    it('includes roadmap core entries', () => {
      expect(IMPORT_ALLOWLIST.has('roadmap')).toBe(true);
      expect(IMPORT_ALLOWLIST.has('roadmap/protocol')).toBe(true);
      expect(IMPORT_ALLOWLIST.has('roadmap/agent')).toBe(true);
    });

    it('includes safe node builtins', () => {
      expect(IMPORT_ALLOWLIST.has('node:path')).toBe(true);
      expect(IMPORT_ALLOWLIST.has('node:crypto')).toBe(true);
    });

    it('excludes dangerous builtins', () => {
      expect(IMPORT_ALLOWLIST.has('node:fs')).toBe(false);
      expect(IMPORT_ALLOWLIST.has('node:child_process')).toBe(false);
      expect(IMPORT_ALLOWLIST.has('node:http')).toBe(false);
      expect(IMPORT_ALLOWLIST.has('node:net')).toBe(false);
    });
  });
});
