// Unit tests for CompletionStore — the single truth regime for node completion.
import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';

describe('CompletionStore', () => {
  it('empty() has no passing nodes', () => {
    const store = CompletionStore.empty();
    expect(store.hasPassing('any')).toBe(false);
    expect(store.passingIds().size).toBe(0);
  });

  it('from() marks listed nodes as passing', () => {
    const store = CompletionStore.from(['a', 'b']);
    expect(store.hasPassing('a')).toBe(true);
    expect(store.hasPassing('b')).toBe(true);
    expect(store.hasPassing('c')).toBe(false);
  });

  it('passingIds() returns all passing node IDs', () => {
    const store = CompletionStore.from(['x', 'y', 'z']);
    const ids = store.passingIds();
    expect(ids.size).toBe(3);
    expect(ids.has('x')).toBe(true);
    expect(ids.has('y')).toBe(true);
    expect(ids.has('z')).toBe(true);
  });

  it('evidence() returns empty array for unknown node', () => {
    const store = CompletionStore.empty();
    expect(store.evidence('missing')).toEqual([]);
  });

  it('from() creates synthetic passing evidence', () => {
    const store = CompletionStore.from(['a']);
    const ev = store.evidence('a');
    expect(ev.length).toBe(1);
    expect(ev[0].passed).toBe(true);
  });

  it('loadOrEmpty() returns empty store for nonexistent path', () => {
    const store = CompletionStore.loadOrEmpty('/nonexistent/path');
    expect(store.hasPassing('anything')).toBe(false);
  });

  it('load() throws for nonexistent path', () => {
    expect(() => CompletionStore.load('/nonexistent/path')).toThrow();
  });
});
