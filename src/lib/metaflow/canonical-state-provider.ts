// @module metaflow/canonical-state-provider
// @exports CanonicalStateProvider
// @entry roadmap/metaflow

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface CanonicalManifest {
  timestamp: string;
  trailChecksum: string;
  completedNodes: Array<{ id: string; completedAt: string; produces: string[] }>;
  conflictsResolved: number;
  stateCoherent: boolean;
  stateTimelinePath: string;
  coherenceReportPath: string;
  validationErrors: string[];
}

export class CanonicalStateProvider {
  private manifest: CanonicalManifest | null = null;
  private root: string;

  constructor(root: string) {
    this.root = root;
    this.load();
  }

  private load(): void {
    const manifestPath = join(
      this.root,
      ".roadmap/metaflow/canonical/canonical-state.json"
    );

    if (existsSync(manifestPath)) {
      const content = readFileSync(manifestPath, "utf-8");
      this.manifest = JSON.parse(content) as CanonicalManifest;
    }
  }

  /**
   * Get authoritative completion status for a node
   */
  isNodeComplete(nodeId: string): boolean {
    if (!this.manifest) return false;
    return this.manifest.completedNodes.some((n) => n.id === nodeId);
  }

  /**
   * Get when a node completed (or null if not completed)
   */
  getCompletionTimestamp(nodeId: string): Date | null {
    if (!this.manifest) return null;
    const node = this.manifest.completedNodes.find((n) => n.id === nodeId);
    return node ? new Date(node.completedAt) : null;
  }

  /**
   * Get all produces from a node
   */
  getNodeProduces(nodeId: string): string[] {
    if (!this.manifest) return [];
    const node = this.manifest.completedNodes.find((n) => n.id === nodeId);
    return node?.produces ?? [];
  }

  /**
   * Get count of completed nodes
   */
  getCompletedCount(): number {
    return this.manifest?.completedNodes.length ?? 0;
  }

  /**
   * Check if artifact exists in canonical state
   */
  artifactExists(path: string): boolean {
    if (!this.manifest) return false;
    for (const node of this.manifest.completedNodes) {
      if (node.produces.includes(path)) return true;
    }
    return false;
  }

  /**
   * Validate state coherence
   */
  isStateCoherent(): boolean {
    return this.manifest?.stateCoherent ?? false;
  }

  /**
   * Get all validation errors from state reconstruction
   */
  getValidationErrors(): string[] {
    return this.manifest?.validationErrors ?? [];
  }

  /**
   * Get total conflict count
   */
  getConflictsResolved(): number {
    return this.manifest?.conflictsResolved ?? 0;
  }

  /**
   * Get all completed nodes
   */
  getCompletedNodes(): Array<{ id: string; completedAt: string; produces: string[] }> {
    return this.manifest?.completedNodes ?? [];
  }

  /**
   * Check if provider has valid state
   */
  hasValidState(): boolean {
    return (
      this.manifest !== null &&
      this.manifest.stateCoherent &&
      this.manifest.validationErrors.length === 0
    );
  }

  /**
   * Reload manifest from disk
   */
  refresh(): void {
    this.load();
  }

  /**
   * Get full manifest (for debugging)
   */
  getManifest(): CanonicalManifest | null {
    return this.manifest;
  }
}

/**
 * Global singleton for canonical state access
 */
let globalProvider: CanonicalStateProvider | null = null;

export function initializeCanonicalState(root: string): CanonicalStateProvider {
  globalProvider = new CanonicalStateProvider(root);
  return globalProvider;
}

export function getCanonicalState(): CanonicalStateProvider | null {
  return globalProvider;
}
