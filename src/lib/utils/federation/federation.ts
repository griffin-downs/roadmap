// @module federation
// @exports FederationPeer, FederationView, FederatedNode, addPeer, removePeer, loadPeers, savePeers, buildFederationView, loadFederationView, federationStatus
// @types FederationPeer, FederationView, FederatedNode
// @entry roadmap

// Multi-repo federation: manage peers.json, build namespaced view.json,
// report cross-repo status.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export interface FederationPeer {
  id: string;
  path: string;        // absolute path to repo root
  addedAt: string;      // ISO 8601
}

export interface FederatedNode {
  id: string;           // namespaced: <peerId>::<nodeId>
  peerId: string;
  nodeId: string;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  status: 'pending' | 'complete';
}

export interface FederationView {
  schemaVersion: 1;
  builtAt: string;
  peers: FederationPeer[];
  nodes: FederatedNode[];
  viewHash: string;     // sha256 of deterministic node content
}

export interface FederationStatus {
  peers: Array<{
    id: string;
    path: string;
    hasDag: boolean;
    nodeCount: number;
    completedCount: number;
  }>;
  totalNodes: number;
  totalCompleted: number;
}

const FEDERATION_DIR = '.roadmap/federation';
const PEERS_FILE = 'peers.json';
const VIEW_FILE = 'view.json';

function federationDir(repoRoot: string): string {
  return join(repoRoot, FEDERATION_DIR);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadPeers(repoRoot: string): FederationPeer[] {
  const p = join(federationDir(repoRoot), PEERS_FILE);
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function savePeers(repoRoot: string, peers: FederationPeer[]): void {
  const dir = federationDir(repoRoot);
  ensureDir(dir);
  writeFileSync(join(dir, PEERS_FILE), JSON.stringify(peers, null, 2) + '\n');
}

export function addPeer(repoRoot: string, peerId: string, peerPath: string): FederationPeer {
  const peers = loadPeers(repoRoot);
  const existing = peers.find(p => p.id === peerId);
  if (existing) {
    existing.path = resolve(peerPath);
    savePeers(repoRoot, peers);
    return existing;
  }

  const peer: FederationPeer = {
    id: peerId,
    path: resolve(peerPath),
    addedAt: new Date().toISOString(),
  };
  peers.push(peer);
  savePeers(repoRoot, peers);
  return peer;
}

export function removePeer(repoRoot: string, peerId: string): boolean {
  const peers = loadPeers(repoRoot);
  const idx = peers.findIndex(p => p.id === peerId);
  if (idx === -1) return false;
  peers.splice(idx, 1);
  savePeers(repoRoot, peers);
  return true;
}

/** Load a peer's DAG and completion state, produce FederatedNodes. */
function loadPeerNodes(peer: FederationPeer): FederatedNode[] {
  const dagPath = join(peer.path, '.roadmap', 'head.json');
  if (!existsSync(dagPath)) return [];

  try {
    const dag = JSON.parse(readFileSync(dagPath, 'utf-8'));
    const nodes = dag.nodes as Record<string, {
      id: string; desc?: string; produces?: string[];
      consumes?: string[]; deps?: string[];
    }> | undefined;
    if (!nodes) return [];

    // Load completions
    const completedIds = new Set<string>();
    const completedPath = join(peer.path, '.roadmap', 'completed.json');
    if (existsSync(completedPath)) {
      try {
        const records = JSON.parse(readFileSync(completedPath, 'utf-8'));
        if (Array.isArray(records)) {
          for (const r of records) completedIds.add(r.nodeId);
        }
      } catch { /* ignore */ }
    }

    return Object.values(nodes).map(n => ({
      id: `${peer.id}::${n.id}`,
      peerId: peer.id,
      nodeId: n.id,
      desc: n.desc ?? '',
      produces: (n.produces ?? []).map(p => `${peer.id}::${p}`),
      consumes: (n.consumes ?? []).map(c => typeof c === 'string' ? `${peer.id}::${c}` : c),
      deps: (n.deps ?? []).map(d => `${peer.id}::${d}`),
      status: completedIds.has(n.id) ? 'complete' as const : 'pending' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Build a deterministic federation view from all peers.
 * Read-only snapshot — does not modify peer repos.
 */
export function buildFederationView(repoRoot: string): FederationView {
  const peers = loadPeers(repoRoot);
  const allNodes: FederatedNode[] = [];

  for (const peer of peers) {
    allNodes.push(...loadPeerNodes(peer));
  }

  // Sort for determinism
  allNodes.sort((a, b) => a.id.localeCompare(b.id));

  const viewContent = JSON.stringify(allNodes);
  const viewHash = createHash('sha256').update(viewContent).digest('hex');

  const view: FederationView = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    peers,
    nodes: allNodes,
    viewHash,
  };

  // Write view.json
  const dir = federationDir(repoRoot);
  ensureDir(dir);
  writeFileSync(join(dir, VIEW_FILE), JSON.stringify(view, null, 2) + '\n');

  return view;
}

export function loadFederationView(repoRoot: string): FederationView | null {
  const p = join(federationDir(repoRoot), VIEW_FILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function federationStatus(repoRoot: string): FederationStatus {
  const peers = loadPeers(repoRoot);
  const peerStatuses = peers.map(peer => {
    const nodes = loadPeerNodes(peer);
    return {
      id: peer.id,
      path: peer.path,
      hasDag: existsSync(join(peer.path, '.roadmap', 'head.json')),
      nodeCount: nodes.length,
      completedCount: nodes.filter(n => n.status === 'complete').length,
    };
  });

  return {
    peers: peerStatuses,
    totalNodes: peerStatuses.reduce((s, p) => s + p.nodeCount, 0),
    totalCompleted: peerStatuses.reduce((s, p) => s + p.completedCount, 0),
  };
}
