// @module receipt-first/chain-enforcer
// @exports enforceChain, ChainResult, ChainContext
// @types ChainResult, ChainContext
// @entry roadmap

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CmdReceipt } from './cmd-receipt.ts';
import { loadScenarios, findScenario } from './scenario-registry.ts';
import { activeBreakglass } from './breakglass.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChainContext {
  repoRoot: string;
  cmd: string;
  headSha: string;
  scenarioId?: string;
  runId?: string;
}

export interface ChainResult {
  go: boolean;
  reason?: string;
  breakglassActive?: boolean;
  breakglassId?: string;
  missingReceipts?: Array<{
    type: string;
    cmd?: string;
    fix: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadLatestCmdReceipt(repoRoot: string, cmd: string): CmdReceipt | null {
  const dir = join(repoRoot, '.roadmap', 'receipts', 'cmd', cmd);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;

  // Sort descending by filename (runId includes timestamp) to get most recent
  files.sort().reverse();

  const raw = readFileSync(join(dir, files[0]), 'utf-8');
  return JSON.parse(raw) as CmdReceipt;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Single enforcement entry point. Call before running any gated command.
 * Returns { go: true } if allowed, { go: false, reason, missingReceipts } if blocked.
 */
export function enforceChain(ctx: ChainContext): ChainResult {
  const registry = loadScenarios(ctx.repoRoot);

  // If scenarioId specified, find it
  if (ctx.scenarioId) {
    const scenario = findScenario(registry, ctx.scenarioId);
    if (!scenario) return { go: false, reason: `Unknown scenario: ${ctx.scenarioId}` };
    return evaluateScenario(ctx, scenario);
  }

  // No scenario specified — ungated
  return { go: true };
}

function evaluateScenario(
  ctx: ChainContext,
  scenario: { requiredReceipts: Array<{ type: string; cmd?: string; batchId?: string; matchHeadSha?: boolean }>; allowBreakglass: boolean },
): ChainResult {
  // Check breakglass bypass
  if (scenario.allowBreakglass) {
    const bgs = activeBreakglass(ctx.repoRoot);
    const matching = bgs.find(bg => bg.scope.commands.includes(ctx.cmd));
    if (matching) {
      return { go: true, breakglassActive: true, breakglassId: matching.id };
    }
  }

  // Check each required receipt
  const missing: ChainResult['missingReceipts'] = [];

  for (const req of scenario.requiredReceipts) {
    if (req.type === 'cmd') {
      const receipt = req.cmd ? loadLatestCmdReceipt(ctx.repoRoot, req.cmd) : null;
      if (!receipt) {
        missing!.push({ type: 'cmd', cmd: req.cmd, fix: `Run 'roadmap ${req.cmd}' first` });
        continue;
      }
      if (req.matchHeadSha && receipt.headSha !== ctx.headSha) {
        missing!.push({ type: 'cmd', cmd: req.cmd, fix: `Receipt headSha ${receipt.headSha} does not match current ${ctx.headSha} — re-run 'roadmap ${req.cmd}'` });
      }
    } else if (req.type === 'dispatch') {
      // Dispatch receipts: check .roadmap/receipts/cmd/dispatch/<batchId>
      const receipt = req.batchId ? loadLatestCmdReceipt(ctx.repoRoot, `dispatch`) : null;
      if (!receipt) {
        missing!.push({ type: 'dispatch', cmd: req.batchId, fix: `Dispatch receipt for batch '${req.batchId}' not found` });
      }
    } else if (req.type === 'breakglass') {
      // Breakglass-type requirement: must have active breakglass for this cmd
      const bgs = activeBreakglass(ctx.repoRoot);
      const matching = bgs.find(bg => bg.scope.commands.includes(ctx.cmd));
      if (!matching) {
        missing!.push({ type: 'breakglass', fix: `Active breakglass receipt required for '${ctx.cmd}'` });
      }
    }
  }

  if (missing!.length > 0) {
    return { go: false, reason: 'Missing required receipts', missingReceipts: missing };
  }

  return { go: true };
}
