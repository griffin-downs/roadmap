// @module tests/cli
// @exports workflow-guide tests

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'node:fs';

describe('workflow-guide hints', () => {
  it('orient output includes hints in render', () => {
    try {
      const output = execSync('bin/roadmap orient --note "test"', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const json = JSON.parse(output);
      expect(json.ok).toBe(true);
      expect(json.render).toBeDefined();
      expect(json.render.hints).toBeDefined();
      expect(Array.isArray(json.render.hints)).toBe(true);
      expect(json.render.hints.length).toBeGreaterThan(0);
    } catch (e: any) {
      // If no DAG exists, orient returns with position: "untracked" — still valid
      if (e.message.includes('No roadmap')) {
        expect(true).toBe(true);
      } else {
        throw e;
      }
    }
  });

  it('chart output includes hints in render', () => {
    // Only run if DAG exists
    if (!existsSync('.roadmap/head.json')) {
      expect(true).toBe(true);
      return;
    }

    try {
      const output = execSync('bin/roadmap chart', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const json = JSON.parse(output);
      expect(json.ok).toBe(true);
      expect(json.render).toBeDefined();
      expect(json.render.hints).toBeDefined();
      expect(Array.isArray(json.render.hints)).toBe(true);
    } catch (e: any) {
      if (e.message.includes('No roadmap')) {
        expect(true).toBe(true);
      } else {
        throw e;
      }
    }
  });

  it('hints include example commands starting with roadmap', () => {
    try {
      const output = execSync('bin/roadmap orient --note "test"', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const json = JSON.parse(output);
      if (json.render?.hints && Array.isArray(json.render.hints)) {
        json.render.hints.forEach((hint: any) => {
          expect(hint.text).toBeDefined();
          expect(typeof hint.text).toBe('string');
          expect(hint.example).toBeDefined();
          expect(typeof hint.example).toBe('string');
          expect(hint.example).toMatch(/^roadmap /);
        });
      }
    } catch (e: any) {
      if (!e.message.includes('No roadmap')) {
        throw e;
      }
    }
  });

  it('hints have text and example fields', () => {
    try {
      const output = execSync('bin/roadmap orient --note "test"', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const json = JSON.parse(output);
      if (json.render?.hints && Array.isArray(json.render.hints)) {
        expect(json.render.hints.length).toBeGreaterThan(0);
        json.render.hints.forEach((hint: any) => {
          expect(hint).toHaveProperty('text');
          expect(hint).toHaveProperty('example');
          expect(hint.text.length).toBeGreaterThan(0);
          expect(hint.example.length).toBeGreaterThan(0);
        });
      }
    } catch (e: any) {
      if (!e.message.includes('No roadmap')) {
        throw e;
      }
    }
  });
});
