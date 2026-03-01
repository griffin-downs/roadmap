// Approval gates for destructive repairs

import { RepairOperation } from '../disconnect-detector/types.ts';

export interface ApprovalContext {
  operation: RepairOperation;
  requester: string;
  timestamp: number;
  reason: string;
}

export interface ApprovalDecision {
  operationId: string;
  approved: boolean;
  approver: string;
  timestamp: number;
  comment?: string;
}

export class ApprovalGate {
  private decisions: Map<string, ApprovalDecision>;

  constructor() {
    this.decisions = new Map();
  }

  requiresApproval(op: RepairOperation): boolean {
    if (op.approvalRequired) return true;

    // Destructive operations always require approval
    if (op.destructive) return true;

    // High-risk patterns
    if (op.type === 'delete') return true;
    if (op.type === 'migrate' && op.action.includes('.roadmap')) return true;

    return false;
  }

  async requestApproval(context: ApprovalContext): Promise<ApprovalDecision> {
    // In real system: prompt user or send to approval service
    // For now: auto-approve non-destructive, require explicit approval for destructive

    const requiresApproval = this.requiresApproval(context.operation);

    if (!requiresApproval) {
      // Auto-approve safe operations
      return {
        operationId: context.operation.id,
        approved: true,
        approver: 'auto-approval',
        timestamp: Date.now(),
        comment: 'Non-destructive operation auto-approved',
      };
    }

    // For destructive: would need explicit user approval
    return {
      operationId: context.operation.id,
      approved: false, // Await user input in real system
      approver: '',
      timestamp: Date.now(),
      comment: 'Destructive operation pending user approval',
    };
  }

  recordDecision(decision: ApprovalDecision): void {
    this.decisions.set(decision.operationId, decision);
  }

  getDecision(operationId: string): ApprovalDecision | undefined {
    return this.decisions.get(operationId);
  }

  isApproved(operationId: string): boolean {
    const decision = this.decisions.get(operationId);
    return decision?.approved ?? false;
  }
}

export async function requestRepairApproval(
  op: RepairOperation,
  requester: string,
  reason: string
): Promise<ApprovalDecision> {
  const gate = new ApprovalGate();
  const context: ApprovalContext = {
    operation: op,
    requester,
    timestamp: Date.now(),
    reason,
  };
  const decision = await gate.requestApproval(context);
  gate.recordDecision(decision);
  return decision;
}
