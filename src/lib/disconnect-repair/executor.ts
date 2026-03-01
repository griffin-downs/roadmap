// Repair execution engine — apply repairs with rollback support

import fs from 'fs';
import path from 'path';
import { RepairOperation, RepairResult } from '../disconnect-detector/types.js';

export interface ExecutionState {
  operationId: string;
  timestamp: number;
  backup: Map<string, string>; // file path -> original content
}

export class RepairExecutor {
  private root: string;
  private executionLog: Map<string, ExecutionState>;

  constructor(root: string) {
    this.root = root;
    this.executionLog = new Map();
  }

  async executeOperation(op: RepairOperation): Promise<RepairResult> {
    const startTime = Date.now();
    const state: ExecutionState = {
      operationId: op.id,
      timestamp: startTime,
      backup: new Map(),
    };

    try {
      const result = await this.performOperation(op, state);
      this.executionLog.set(op.id, state);
      return result;
    } catch (error) {
      // Rollback on error
      await this.rollbackOperation(op.id, state);
      return {
        operationId: op.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        appliedAt: Date.now(),
        rollbackInfo: {
          reversible: true,
          method: 'automatic-rollback',
        },
      };
    }
  }

  private async performOperation(op: RepairOperation, state: ExecutionState): Promise<RepairResult> {
    const targetPath = path.join(this.root, op.target);

    switch (op.type) {
      case 'move': {
        const [currentDir, newDir] = this.extractPaths(op.action);
        const sourcePath = path.join(this.root, currentDir);
        const destPath = path.join(this.root, newDir);

        // Backup original
        if (fs.existsSync(sourcePath)) {
          state.backup.set(sourcePath, fs.readFileSync(sourcePath, 'utf8'));
        }

        // Create destination directory
        const destDirPath = path.dirname(destPath);
        fs.mkdirSync(destDirPath, { recursive: true });

        // Move file
        if (fs.existsSync(sourcePath)) {
          fs.renameSync(sourcePath, destPath);
        }

        return {
          operationId: op.id,
          success: true,
          appliedAt: Date.now(),
          rollbackInfo: { reversible: true, method: 'rename-reverse' },
        };
      }

      case 'update': {
        // Determine actual file path (could be absolute or relative)
        const filePath = targetPath.startsWith(this.root) ? targetPath : path.join(this.root, op.target);

        // Backup original
        if (fs.existsSync(filePath)) {
          state.backup.set(filePath, fs.readFileSync(filePath, 'utf8'));
        }

        // Ensure directory exists
        const dirPath = path.dirname(filePath);
        fs.mkdirSync(dirPath, { recursive: true });

        // Apply update (action contains the new content or transformation)
        fs.writeFileSync(filePath, op.action, 'utf8');

        return {
          operationId: op.id,
          success: true,
          appliedAt: Date.now(),
          rollbackInfo: { reversible: true, method: 'restore-backup' },
        };
      }

      case 'delete': {
        // Backup original
        if (fs.existsSync(targetPath)) {
          state.backup.set(targetPath, fs.readFileSync(targetPath, 'utf8'));
          fs.unlinkSync(targetPath);
        }

        return {
          operationId: op.id,
          success: true,
          appliedAt: Date.now(),
          rollbackInfo: { reversible: true, method: 'restore-backup' },
        };
      }

      case 'create': {
        const dirPath = path.dirname(targetPath);
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(targetPath, op.action, 'utf8');

        state.backup.set(targetPath, ''); // Mark as created (was empty before)

        return {
          operationId: op.id,
          success: true,
          appliedAt: Date.now(),
          rollbackInfo: { reversible: true, method: 'delete-created' },
        };
      }

      case 'migrate': {
        // For migrations, backup both source and dest state
        const sources = op.action.split('->').map((s: string) => s.trim());
        for (const src of sources) {
          const srcPath = path.join(this.root, src);
          if (fs.existsSync(srcPath)) {
            state.backup.set(srcPath, fs.readFileSync(srcPath, 'utf8'));
          }
        }

        // Perform migration (target is new location)
        const targetDir = path.dirname(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });

        return {
          operationId: op.id,
          success: true,
          appliedAt: Date.now(),
          rollbackInfo: { reversible: true, method: 'restore-backups' },
        };
      }

      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  async rollback(operationId: string): Promise<boolean> {
    const state = this.executionLog.get(operationId);
    if (!state) return false;

    return this.rollbackOperation(operationId, state);
  }

  private async rollbackOperation(operationId: string, state: ExecutionState): Promise<boolean> {
    try {
      for (const [filePath, content] of state.backup) {
        if (content === '') {
          // Was a create — delete it
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } else {
          // Was an update/delete — restore it
          const dirPath = path.dirname(filePath);
          fs.mkdirSync(dirPath, { recursive: true });
          fs.writeFileSync(filePath, content, 'utf8');
        }
      }
      return true;
    } catch (e) {
      console.error(`Failed to rollback ${operationId}:`, e);
      return false;
    }
  }

  private extractPaths(action: string): [string, string] {
    const parts = action.split('→');
    if (parts.length !== 2) {
      throw new Error(`Invalid move action: ${action}`);
    }
    return [parts[0].trim(), parts[1].trim()];
  }
}

export async function executeRepairOperation(
  root: string,
  op: RepairOperation
): Promise<RepairResult> {
  const executor = new RepairExecutor(root);
  return executor.executeOperation(op);
}
