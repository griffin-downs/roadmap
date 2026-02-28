import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addPeer, removePeer, loadPeers, buildFederationView, loadFederationView, federationStatus,
} from '../src/lib/federation.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'fed-test-'));
}

function makePeerRepo(dir: string, dagId: string, nodes: Record<string, unknown>, completed: string[] = []): void {
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  const dag = { id: dagId, desc: 'test', init: 'init', term: 'term', nodes };
  writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(dag, null, 2));
  if (completed.length > 0) {
    const records = completed.map(id => ({ nodeId: id, completedAt: new Date().toISOString() }));
    writeFileSync(join(dir, '.roadmap', 'completed.json'), JSON.stringify(records, null, 2));
  }
}

describe('federation', () => {
  let root: string;
  let peerA: string;
  let peerB: string;

  beforeEach(() => {
    root = makeTmpDir();
    peerA = makeTmpDir();
    peerB = makeTmpDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(peerA, { recursive: true, force: true });
    rmSync(peerB, { recursive: true, force: true });
  });

  describe('peer management', () => {
    it('adds and loads peers', () => {
      addPeer(root, 'alpha', peerA);
      addPeer(root, 'beta', peerB);
      const peers = loadPeers(root);
      expect(peers).toHaveLength(2);
      expect(peers[0].id).toBe('alpha');
      expect(peers[1].id).toBe('beta');
    });

    it('removes a peer', () => {
      addPeer(root, 'alpha', peerA);
      addPeer(root, 'beta', peerB);
      expect(removePeer(root, 'alpha')).toBe(true);
      expect(loadPeers(root)).toHaveLength(1);
      expect(loadPeers(root)[0].id).toBe('beta');
    });

    it('returns false for removing non-existent peer', () => {
      expect(removePeer(root, 'nonexistent')).toBe(false);
    });

    it('updates path on duplicate add', () => {
      addPeer(root, 'alpha', '/old/path');
      addPeer(root, 'alpha', peerA);
      const peers = loadPeers(root);
      expect(peers).toHaveLength(1);
      expect(peers[0].path).toBe(peerA);
    });
  });

  describe('buildFederationView', () => {
    it('builds view with namespaced nodes', () => {
      makePeerRepo(peerA, 'dag-a', {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
        task1: { id: 'task1', desc: 'Task 1', produces: ['src/a.ts'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'Term', produces: [], consumes: [], deps: ['task1'] },
      }, ['init']);

      addPeer(root, 'alpha', peerA);
      const view = buildFederationView(root);

      expect(view.peers).toHaveLength(1);
      expect(view.nodes.length).toBe(3);
      const task = view.nodes.find(n => n.id === 'alpha::task1');
      expect(task).toBeDefined();
      expect(task!.produces).toContain('alpha::src/a.ts');
      expect(task!.status).toBe('pending');

      const init = view.nodes.find(n => n.id === 'alpha::init');
      expect(init!.status).toBe('complete');
    });

    it('produces deterministic viewHash', () => {
      makePeerRepo(peerA, 'dag-a', {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
      });
      addPeer(root, 'alpha', peerA);

      const v1 = buildFederationView(root);
      const v2 = buildFederationView(root);
      expect(v1.viewHash).toBe(v2.viewHash);
    });

    it('writes view.json', () => {
      makePeerRepo(peerA, 'dag-a', {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
      });
      addPeer(root, 'alpha', peerA);
      buildFederationView(root);

      const loaded = loadFederationView(root);
      expect(loaded).not.toBeNull();
      expect(loaded!.schemaVersion).toBe(1);
    });
  });

  describe('federationStatus', () => {
    it('reports status across peers', () => {
      makePeerRepo(peerA, 'dag-a', {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
        task1: { id: 'task1', desc: 'T', produces: [], consumes: [], deps: ['init'] },
      }, ['init']);

      makePeerRepo(peerB, 'dag-b', {
        init: { id: 'init', desc: 'Init', produces: [], consumes: [], deps: [] },
      }, ['init']);

      addPeer(root, 'alpha', peerA);
      addPeer(root, 'beta', peerB);

      const status = federationStatus(root);
      expect(status.peers).toHaveLength(2);
      expect(status.totalNodes).toBe(3);
      expect(status.totalCompleted).toBe(2);
    });
  });
});
