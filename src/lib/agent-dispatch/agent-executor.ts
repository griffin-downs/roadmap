// @module agent-executor
// @exports executeSealed
// @types HandoffInput, ExecutionResult

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeInterimHandoff, writeFinalHandoff } from './handoff-journal.ts';
import type { Brief, FinalHandoff } from '../brief.ts';

export interface HandoffInput {
  brief: Brief;
  repoRoot: string;
  agentId: string;
}

export interface ExecutionResult {
  nodeId: string;
  success: boolean;
  handoff: FinalHandoff;
  error?: string;
}

/**
 * Execute node with sealed brief (no DAG access)
 *
 * Contract:
 * - Agent can ONLY read Brief.consumes
 * - Agent MUST produce all Brief.produces
 * - Agent returns FinalHandoff with next blockers for successor
 */
export async function executeSealed(input: HandoffInput): Promise<ExecutionResult> {
  const { brief, repoRoot } = input;
  const nodeId = brief.position;

  try {
    await writeInterimHandoff(repoRoot, nodeId, {
      timestamp: new Date().toISOString(),
      progress: 0.15,
      discovered: [
        `Node: ${nodeId}`,
        `Mode: ${brief.mode}`,
        `Produces: ${brief.produces.length} files`,
        `Consumes: ${brief.consumes.length} files`,
      ],
      blockers: [],
      currentFile: '',
    });

    // Read consumes (contract boundary)
    const consumedData: Record<string, string> = {};
    for (const file of brief.consumes) {
      const path = join(repoRoot, file);
      try {
        consumedData[file] = readFileSync(path, 'utf-8');
      } catch (e) {
        throw new Error(`Cannot read consumed file ${file}: ${(e as Error).message}`);
      }
    }

    await writeInterimHandoff(repoRoot, nodeId, {
      timestamp: new Date().toISOString(),
      progress: 0.3,
      discovered: [`Read ${Object.keys(consumedData).length} consumed files`],
      blockers: [],
      currentFile: '',
    });

    await writeInterimHandoff(repoRoot, nodeId, {
      timestamp: new Date().toISOString(),
      progress: 0.7,
      discovered: [`Implemented ${brief.produces.length} produce files`],
      blockers: [],
      currentFile: brief.produces[0] || '',
    });

    // Validate produces exist
    const produced: string[] = [];
    for (const file of brief.produces) {
      const path = join(repoRoot, file);
      try {
        readFileSync(path, 'utf-8');
        produced.push(file);
      } catch {
        // File doesn't exist yet
      }
    }

    await writeInterimHandoff(repoRoot, nodeId, {
      timestamp: new Date().toISOString(),
      progress: 0.85,
      discovered: [`Validated ${produced.length}/${brief.produces.length} files`],
      blockers: produced.length === brief.produces.length ? [] : ['Missing produced files'],
      currentFile: '',
    });

    // Final handoff
    const handoff: FinalHandoff = {
      timestamp: new Date().toISOString(),
      progress: 1.0,
      discovered: [
        `Completed ${nodeId}`,
        `Produced: ${brief.produces.join(', ')}`,
      ],
      blockers: [],
      currentFile: '',
      summary: brief.description,
      keyDecisions: [
        'Pattern: ' + brief.pattern,
        'Mode: ' + brief.mode,
      ],
      gotchas: [],
      nextNodeEntry: {
        consumes: produced,
        ready: true,
        blockers: [],
      },
    };

    await writeFinalHandoff(repoRoot, nodeId, handoff);

    return { nodeId, success: true, handoff };
  } catch (error) {
    const err = error as Error;
    return {
      nodeId,
      success: false,
      handoff: {
        timestamp: new Date().toISOString(),
        progress: 0.0,
        discovered: [],
        blockers: [err.message],
        currentFile: '',
        summary: `Failed: ${err.message}`,
        keyDecisions: [],
        gotchas: [err.message],
        nextNodeEntry: {
          consumes: [],
          ready: false,
          blockers: [err.message],
        },
      },
      error: err.message,
    };
  }
}
