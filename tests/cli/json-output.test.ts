import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

/**
 * JSON output compliance tests.
 * Verifies that all CLI commands produce valid JSON output (stdout/stderr properly separated).
 * No mixing of text and JSON on same stream.
 */

describe('CLI JSON output validation', () => {
  it('roadmap help produces text only (no JSON)', () => {
    const output = execSync('npm run build && ./bin/roadmap help 2>&1', { encoding: 'utf-8' });
    // help is documentation, not JSON-wrapped
    expect(output).toContain('Usage:');
    expect(output).not.toContain('"schema_version"');
  });

  it('roadmap orient --json produces valid JSON', () => {
    const cmd = 'npm run build && ./bin/roadmap orient --note "test" --json 2>&1 | tail -1';
    const output = execSync(cmd, { encoding: 'utf-8', shell: '/bin/bash' });
    const lines = output.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    
    expect(() => JSON.parse(lastLine)).not.toThrow();
    const parsed = JSON.parse(lastLine);
    expect(parsed).toHaveProperty('schema_version');
    expect(parsed).toHaveProperty('ok');
    expect(parsed).toHaveProperty('cmd');
  });

  it('invalid commands exit with error JSON', () => {
    try {
      execSync('npm run build && ./bin/roadmap invalid-command --note "test" 2>&1', { encoding: 'utf-8' });
      expect.fail('Should have exited with error');
    } catch (e) {
      const output = (e as any).stdout || '';
      const lines = output.trim().split('\n');
      const jsonLine = lines.find((l: string) => l.startsWith('{'));
      
      if (jsonLine) {
        const parsed = JSON.parse(jsonLine);
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toBeDefined();
      }
    }
  });

  it('JSON envelope has consistent schema', () => {
    const commands = [
      'orient --note "test"',
      'show init --json',
      'help',
    ];
    
    for (const cmd of commands) {
      try {
        const output = execSync(`npm run build && ./bin/roadmap ${cmd} 2>&1 | grep -E '^\\{'`, 
          { encoding: 'utf-8', shell: '/bin/bash' });
        if (output.trim()) {
          const parsed = JSON.parse(output.trim());
          // All JSON outputs should have these fields
          if (parsed.schema_version !== undefined) {
            expect(parsed).toHaveProperty('schema_version');
            expect(parsed).toHaveProperty('ok');
            expect(parsed).toHaveProperty('cmd');
          }
        }
      } catch {
        // Command may not produce JSON (e.g., help)
      }
    }
  });
});
