// @module agent-dispatch
// @exports AgentExecutor, ExecutionResult, ExecutionContext, executeSealed, HandoffInput
// @types ExecutionResult, ExecutionContext
// @entry roadmap/agent

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { writeInterimHandoff, writeFinalHandoff } from './handoff-journal.ts';
import type { Brief, FinalHandoff, InterimHandoff } from '../brief.ts';

/**
 * Execution context: sealed brief + environment
 * Agent can read this, nothing more
 */
export interface ExecutionContext {
  brief: Brief;
  repoRoot: string;
  agentId: string;
  sessionId?: string;
}

/**
 * Legacy input format for executeSealed (backwards compatible)
 */
export interface HandoffInput {
  brief: Brief;
  repoRoot: string;
  agentId: string;
}

/**
 * Completion result: what was done, what's next
 */
export interface ExecutionResult {
  nodeId: string;
  agentId: string;
  success: boolean;
  startTime: string;
  endTime: string;
  wallTimeMs: number;
  producedCount: number;
  handoff: FinalHandoff;
  error?: string;
}

/**
 * Sealed agent executor
 * Zero introspection into DAG. Only reads brief.
 * Agent must:
 *  1. Read files from brief.consumes only
 *  2. Write files to brief.produces only
 *  3. Call checkpoint() for progress
 *  4. Return handoff with next blockers
 */
export class AgentExecutor {
  private context: ExecutionContext;
  private startTime: Date;
  private produced: Set<string> = new Set();

  constructor(context: ExecutionContext) {
    this.context = context;
    this.startTime = new Date();
  }

  /**
   * Get the sealed brief (read-only contract)
   */
  getBrief(): Brief {
    return this.context.brief;
  }

  /**
   * Read consumed file
   * Can only read files declared in brief.consumes
   */
  readConsumed(relativePath: string): string {
    const brief = this.context.brief;

    // Validate consumed file is in brief.consumes
    if (!brief.consumes.includes(relativePath)) {
      throw new Error(
        `Access denied: ${relativePath} not in consumes. Allowed: ${brief.consumes.join(', ')}`
      );
    }

    const fullPath = join(this.context.repoRoot, relativePath);
    try {
      return readFileSync(fullPath, 'utf-8');
    } catch (e) {
      throw new Error(`Cannot read ${relativePath}: ${(e as Error).message}`);
    }
  }

  /**
   * Write produced file
   * Can only write files declared in brief.produces
   */
  writeProduced(relativePath: string, content: string): void {
    const brief = this.context.brief;

    // Validate produced file is in brief.produces
    if (!brief.produces.includes(relativePath)) {
      throw new Error(
        `Access denied: ${relativePath} not in produces. Allowed: ${brief.produces.join(', ')}`
      );
    }

    const fullPath = join(this.context.repoRoot, relativePath);
    const dirPath = dirname(fullPath);

    try {
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
      this.produced.add(relativePath);
    } catch (e) {
      throw new Error(`Cannot write ${relativePath}: ${(e as Error).message}`);
    }
  }

  /**
   * Checkpoint progress (called during execution)
   */
  async checkpoint(interim: Partial<InterimHandoff>): Promise<void> {
    const checkpoint: InterimHandoff = {
      timestamp: interim.timestamp || new Date().toISOString(),
      progress: interim.progress ?? 0.5,
      discovered: interim.discovered ?? [],
      blockers: interim.blockers ?? [],
      currentFile: interim.currentFile ?? this.context.brief.produces[0] ?? '',
    };

    await writeInterimHandoff(
      this.context.repoRoot,
      this.context.brief.position,
      checkpoint
    );
  }

  /**
   * Verify all produces exist and are readable
   */
  private verifyProduces(): string[] {
    const verified: string[] = [];
    for (const produce of this.context.brief.produces) {
      const fullPath = join(this.context.repoRoot, produce);
      if (existsSync(fullPath)) {
        try {
          readFileSync(fullPath, 'utf-8');
          verified.push(produce);
        } catch {
          // File exists but not readable
        }
      }
    }
    return verified;
  }

  /**
   * Create final handoff for next agent
   */
  private createFinalHandoff(verified: string[], blockers: string[] = []): FinalHandoff {
    const brief = this.context.brief;
    const allProducedRatio = verified.length === brief.produces.length;

    return {
      timestamp: new Date().toISOString(),
      progress: allProducedRatio ? 1.0 : verified.length / brief.produces.length,
      discovered: [
        `Completed ${brief.position}`,
        `Produced ${verified.length}/${brief.produces.length} files`,
        ...(blockers.length > 0 ? [`Blockers for next: ${blockers.join(', ')}`] : []),
      ],
      blockers,
      currentFile: brief.produces[verified.length] || '',
      summary: brief.description.slice(0, 100),
      keyDecisions: [
        `Pattern: ${brief.pattern}`,
        `Mode: ${brief.mode}`,
        `Consumed ${brief.consumes.length} files`,
      ],
      gotchas: [],
      nextNodeEntry: {
        consumes: verified,
        ready: allProducedRatio && blockers.length === 0,
        blockers: allProducedRatio ? undefined : [...blockers, 'Missing produced files'],
      },
    };
  }

  /**
   * Execute the assigned work
   * Returns result with completion status + handoff
   */
  async execute(
    work: (executor: AgentExecutor) => Promise<void>
  ): Promise<ExecutionResult> {
    const brief = this.context.brief;
    const nodeId = brief.position;
    const startTime = new Date();

    try {
      // Initial checkpoint
      await this.checkpoint({
        progress: 0.1,
        discovered: [`Started ${nodeId} (${brief.mode} mode)`],
        blockers: [],
      });

      // Execute work
      await work(this);

      // Verify all produces exist
      const verified = this.verifyProduces();

      // Final checkpoint
      const blockers = verified.length === brief.produces.length ? [] : ['Missing produced files'];
      await this.checkpoint({
        progress: 0.95,
        discovered: [`Verified ${verified.length}/${brief.produces.length} produces`],
        blockers,
      });

      // Create final handoff
      const handoff = this.createFinalHandoff(verified, blockers);
      await writeFinalHandoff(this.context.repoRoot, nodeId, handoff);

      const endTime = new Date();
      return {
        nodeId,
        agentId: this.context.agentId,
        success: verified.length === brief.produces.length,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        wallTimeMs: endTime.getTime() - startTime.getTime(),
        producedCount: verified.length,
        handoff,
      };
    } catch (error) {
      const err = error as Error;
      const blockers = [err.message];
      const handoff: FinalHandoff = {
        timestamp: new Date().toISOString(),
        progress: 0.0,
        discovered: [`Failed: ${err.message}`],
        blockers,
        currentFile: '',
        summary: `Failed: ${err.message}`,
        keyDecisions: [],
        gotchas: [err.message],
        nextNodeEntry: {
          consumes: [],
          ready: false,
          blockers: [`Previous failed: ${err.message}`],
        },
      };

      try {
        await writeFinalHandoff(this.context.repoRoot, nodeId, handoff);
      } catch {
        // Handoff write failed, at least the error is captured
      }

      const endTime = new Date();
      return {
        nodeId,
        agentId: this.context.agentId,
        success: false,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        wallTimeMs: endTime.getTime() - startTime.getTime(),
        producedCount: 0,
        handoff,
        error: err.message,
      };
    }
  }
}

/**
 * Standalone function for sealed execution (backwards compatible)
 * Used by orchestrator to execute agents with brief-only contract
 */
export async function executeSealed(input: HandoffInput): Promise<ExecutionResult> {
  const executor = new AgentExecutor(input);

  // Default execution: validate consumes, write produces
  return executor.execute(async (exec) => {
    const brief = exec.getBrief();

    // Read all consumed files
    for (const file of brief.consumes) {
      exec.readConsumed(file);
    }

    // Checkpoint: read complete
    await exec.checkpoint({
      progress: 0.5,
      discovered: [`Read ${brief.consumes.length} consumed files`],
      blockers: [],
    });

    // Write produce stubs (minimal default)
    // In real execution, this would be replaced by agent-specific work
    for (const file of brief.produces) {
      const stub = `// ${brief.position}: ${file}\n// Generated by sealed executor\n`;
      exec.writeProduced(file, stub);
    }

    // Checkpoint: write complete
    await exec.checkpoint({
      progress: 0.9,
      discovered: [`Wrote ${brief.produces.length} produced files`],
      blockers: [],
    });
  });
}
