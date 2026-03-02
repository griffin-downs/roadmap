// @module mock-dag-switcher
// @exports MockDagSwitcher
// @types SwitchResult (from real API)
// @entry roadmap/mocks

import type { SwitchResult } from '../dag-switcher';
import type { Orientation } from '../../protocol/operations.ts';

/**
 * Mock DagSwitcher for testing without real DAG operations.
 * Returns sample data that matches the real API signatures.
 */
export class MockDagSwitcher {
  private repoRoot: string;
  private currentDAG: string = 'hardening-001';

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Mock: Switch to a different DAG by ID.
   * Returns sample switch result with new orientation.
   */
  async switch(dagId: string): Promise<SwitchResult> {
    const previousDagId = this.currentDAG;
    const dagPath = `.roadmap/head.${dagId}.json`;
    const headPath = `.roadmap/head.json`;

    // Create sample orientation for the new DAG
    const newOrientation: Orientation = {
      position: ['node-1', 'node-2'],
      level: 0,
      batchRemaining: ['node-1', 'node-2'],
      batchComplete: false,
      preGate: [],
      done: [],
      produces: ['artifact-1.ts', 'artifact-2.ts'],
      consumes: ['input-1.json', 'input-2.json'],
      remaining: ['node-1', 'node-2', 'node-3', 'node-4'],
    };

    // Update current DAG after successful switch
    this.currentDAG = dagId;

    return {
      dagId,
      dagPath,
      headPath,
      switched: true,
      previousDagId,
      newOrientation,
    };
  }

  /**
   * Mock: Get current DAG ID.
   * Returns the ID of the currently active DAG.
   */
  getCurrentDAG(): string | null {
    return this.currentDAG;
  }

  /**
   * Mock: Validate that a DAG exists.
   * Returns true if DAG ID is in the list of available DAGs.
   */
  validateDAGExists(dagId: string): boolean {
    const availableDAGs = this.getAvailableDAGs();
    return availableDAGs.includes(dagId);
  }

  /**
   * Mock: Get list of available DAGs.
   * Returns sample DAG IDs for testing.
   */
  getAvailableDAGs(): string[] {
    return ['hardening-001', 'integration-suite', 'phase-2', 'phase-3'].sort();
  }
}

/**
 * Mock standalone utility: switch DAG
 */
export async function switchDAG(repoRoot: string, dagId: string): Promise<SwitchResult> {
  const switcher = new MockDagSwitcher(repoRoot);
  return switcher.switch(dagId);
}
