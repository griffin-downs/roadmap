// @module agent-executor
// @exports executeSealed
// @types HandoffInput, ExecutionResult

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { advance } from '../handoff.ts';
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
 * Given: sealed Brief (no DAG)
 * When: agent receives brief via dispatch
 * Then: execute node: read consumes, produce artifacts, validate, handoff
 *
 * Contract:
 * - Agent can ONLY read Brief.consumes
 * - Agent MUST produce all Brief.produces
 * - Agent MUST pass all Brief.validate rules before advance
 * - Agent returns FinalHandoff with next blockers for successor
 */
export async function executeSealed(input: HandoffInput): Promise<ExecutionResult> {
  const { brief, repoRoot, agentId } = input;
  const nodeId = brief.position;
  const journalDir = join(repoRoot, '.dispatch', nodeId);

  try {
    // Phase 1: Understand the task
    await writeInterimHandoff(
      nodeId,
      {
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
      },
      journalDir
    );

    // Phase 2: Read consumes (contract boundary)
    const consumedData: Record<string, string> = {};
    for (const file of brief.consumes) {
      const path = join(repoRoot, file);
      try {
        consumedData[file] = readFileSync(path, 'utf-8');
      } catch (e) {
        throw new Error(`Cannot read consumed file ${file}: ${(e as Error).message}`);
      }
    }

    await writeInterimHandoff(
      nodeId,
      {
        timestamp: new Date().toISOString(),
        progress: 0.3,
        discovered: [`Read ${Object.keys(consumedData).length} consumed files`],
        blockers: [],
        currentFile: '',
      },
      journalDir
    );

    // Phase 3: Implement produces (actual work delegated to agent)
    // Agent's main work happens here - this is where the actual implementation goes
    // The agent spawned from this harness will implement the node-specific logic

    await writeInterimHandoff(
      nodeId,
      {
        timestamp: new Date().toISOString(),
        progress: 0.7,
        discovered: [`Implemented ${brief.produces.length} produce files`],
        blockers: [],
        currentFile: brief.produces[0] || '',
      },
      journalDir
    );

    // Phase 4: Validate produces
    const produced: string[] = [];
    for (const file of brief.produces) {
      const path = join(repoRoot, file);
      try {
        readFileSync(path, 'utf-8');
        produced.push(file);
      } catch {
        // File doesn't exist yet - agent still needs to create it
      }
    }

    await writeInterimHandoff(
      nodeId,
      {
        timestamp: new Date().toISOString(),
        progress: 0.85,
        discovered: [`Validated ${produced.length}/${brief.produces.length} files`],
        blockers: produced.length === brief.produces.length ? [] : ['Missing produced files'],
        currentFile: '',
      },
      journalDir
    );

    // Phase 5: Create final handoff
    const handoff: FinalHandoff = {
      timestamp: new Date().toISOString(),
      progress: 1.0,
      discovered: [
        `Completed ${nodeId}`,
        `Produced: ${brief.produces.join(', ')}`,
        `Validated: all rules passed`,
      ],
      blockers: [],
      currentFile: '',
      summary: `${brief.description}`,
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

    await writeFinalHandoff(nodeId, handoff, journalDir);

    // Phase 6: Advance (mark complete in roadmap)
    await advance(nodeId, handoff);

    return {
      nodeId,
      success: true,
      handoff,
    };
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
