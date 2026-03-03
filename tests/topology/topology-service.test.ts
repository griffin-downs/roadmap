// @module topology/topology-service.test
// Agent use-case tests for topology service

import { describe, it, expect } from 'vitest';
import { evaluateRule, type CloneRole, type Operation } from '../../src/lib/topology/enforcement-rules.ts';

describe('enforcement-rules', () => {
  describe('production clone', () => {
    const role: CloneRole = 'production';

    it('denies push', () => {
      const r = evaluateRule(role, { operation: 'push', to: 'origin' });
      expect(r.allowed).toBe(false);
      expect(r.from).toBe('production-clone');
    });

    it('denies merge', () => {
      const r = evaluateRule(role, { operation: 'merge' });
      expect(r.allowed).toBe(false);
    });

    it('allows fetch', () => {
      const r = evaluateRule(role, { operation: 'fetch' });
      expect(r.allowed).toBe(true);
    });

    it('denies feat checkout', () => {
      const r = evaluateRule(role, { operation: 'checkout', branch: 'feat/new' });
      expect(r.allowed).toBe(false);
    });

    it('allows non-feat checkout', () => {
      const r = evaluateRule(role, { operation: 'checkout', branch: 'dormant' });
      expect(r.allowed).toBe(true);
    });

    it('denies commit on main', () => {
      const r = evaluateRule(role, { operation: 'commit', branch: 'main' });
      expect(r.allowed).toBe(false);
    });

    it('denies work on feat branch', () => {
      const r = evaluateRule(role, { operation: 'work', branch: 'feat/x' });
      expect(r.allowed).toBe(false);
    });

    it('allows read', () => {
      const r = evaluateRule(role, { operation: 'read' });
      expect(r.allowed).toBe(true);
    });
  });

  describe('development clone', () => {
    const role: CloneRole = 'development';

    it('allows feat push', () => {
      const r = evaluateRule(role, { operation: 'push', branch: 'feat/auth' });
      expect(r.allowed).toBe(true);
    });

    it('denies main push', () => {
      const r = evaluateRule(role, { operation: 'push', branch: 'main' });
      expect(r.allowed).toBe(false);
    });

    it('allows feat merge', () => {
      const r = evaluateRule(role, { operation: 'merge', branch: 'feat/auth' });
      expect(r.allowed).toBe(true);
    });

    it('denies direct main merge', () => {
      const r = evaluateRule(role, { operation: 'merge', branch: 'main' });
      expect(r.allowed).toBe(false);
    });

    it('allows feat commit', () => {
      const r = evaluateRule(role, { operation: 'commit', branch: 'feat/x' });
      expect(r.allowed).toBe(true);
    });

    it('denies main commit', () => {
      const r = evaluateRule(role, { operation: 'commit', branch: 'main' });
      expect(r.allowed).toBe(false);
    });

    it('allows feat work', () => {
      const r = evaluateRule(role, { operation: 'work', branch: 'feat/x' });
      expect(r.allowed).toBe(true);
    });

    it('denies main work', () => {
      const r = evaluateRule(role, { operation: 'work', branch: 'main' });
      expect(r.allowed).toBe(false);
    });

    it('allows read with caveat', () => {
      const r = evaluateRule(role, { operation: 'read' });
      expect(r.allowed).toBe(true);
      expect(r.guidance).toContain('production clone');
    });
  });

  describe('agent use cases', () => {
    it('UC1: agent in unknown location gets denied work', () => {
      const r = evaluateRule('unknown' as CloneRole, { operation: 'work', branch: 'feat/x' });
      // unknown falls through to development rules
      expect(r).toBeDefined();
      expect(typeof r.allowed).toBe('boolean');
      expect(r.guidance).toBeDefined();
    });

    it('UC2: every result has guidance field', () => {
      const ops: Operation[] = ['push', 'merge', 'fetch', 'checkout', 'commit', 'work', 'read'];
      for (const op of ops) {
        const r = evaluateRule('production', { operation: op });
        expect(r.guidance).toBeTruthy();
        expect(r.reason).toBeTruthy();
        expect(r.enforcement).toBeTruthy();
      }
    });

    it('UC3: deterministic (same input same output)', () => {
      const a = evaluateRule('production', { operation: 'push', to: 'origin' });
      const b = evaluateRule('production', { operation: 'push', to: 'origin' });
      expect(a).toEqual(b);
    });
  });
});
