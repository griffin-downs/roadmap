// @module cli/inventory
// @exports CommandEntry, buildInventory, validateInventory, writeInventory

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMAND_REGISTRY } from '../metaflow/command-registry.ts';

export interface CommandEntry {
  id: string;
  tokens: string[];
  description: string;
  flags: string[];
  mustHaveDisplayReceipt: boolean;
  exempt?: {
    exemptClass: 'plumbing' | 'internal' | 'deprecated';
    exemptReason: string;
    removalPlanNode?: string;
  };
  requiredSignals: string[];
  examples: string[];
}

// Known commands extracted from bin/roadmap.ts switch statement
const KNOWN_COMMANDS: CommandEntry[] = [
  { id: 'orient', tokens: ['orient'], description: 'Batch position + produces/consumes + preGate', flags: ['--note', '--check', '--assign', '--ready', '--next'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap orient --note "session start"'] },
  { id: 'advance', tokens: ['advance'], description: 'Advance to next batch', flags: ['--note'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap advance --note "batch done"'] },
  { id: 'chart', tokens: ['chart'], description: 'Pretty-print progress chart', flags: ['--deps'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap chart'] },
  { id: 'complete', tokens: ['complete'], description: 'Submit work for a node', flags: ['--note', '--owner', '--skip-validate', '--evaluate', '--explore', '--no-advance', '--no-commit'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap complete node-a --note "done"'] },
  { id: 'validate', tokens: ['validate'], description: 'Run validation rules', flags: ['--note'], mustHaveDisplayReceipt: false, requiredSignals: [], examples: ['roadmap validate --note "check"'] },
  { id: 'trail', tokens: ['trail'], description: 'Read invocation trail', flags: ['--global', '--repo', '--last', '--archive'], mustHaveDisplayReceipt: false, exempt: { exemptClass: 'plumbing', exemptReason: 'diagnostic output only' }, requiredSignals: [], examples: ['roadmap trail --last 5'] },
  { id: 'help', tokens: ['help'], description: 'Usage', flags: [], mustHaveDisplayReceipt: false, exempt: { exemptClass: 'plumbing', exemptReason: 'help text only' }, requiredSignals: [], examples: ['roadmap help'] },
  { id: 'claim', tokens: ['claim'], description: 'Claim a node for execution', flags: ['--owner', '--ttl'], mustHaveDisplayReceipt: false, exempt: { exemptClass: 'plumbing', exemptReason: 'coordination only' }, requiredSignals: [], examples: ['roadmap claim node-a --owner w1'] },
  { id: 'import', tokens: ['import'], description: 'Import spec into roadmap', flags: ['--note', '--from', '--id', '--skip-audit-tail'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap import --from speckit tasks.md --id my-dag --note "import"'] },
  { id: 'show', tokens: ['show'], description: 'Show node spec', flags: ['--note'], mustHaveDisplayReceipt: false, exempt: { exemptClass: 'plumbing', exemptReason: 'read-only node display' }, requiredSignals: [], examples: ['roadmap show node-a --note "reading"'] },
  { id: 'expand', tokens: ['expand'], description: 'Run expansion script', flags: ['--note'], mustHaveDisplayReceipt: false, requiredSignals: [], examples: ['roadmap expand scripts/expand-node.ts --note "expanding"'] },
  { id: 'mf-init', tokens: ['mf', 'init'], description: 'Initialize MetaFlow run', flags: ['--run', '--note'], mustHaveDisplayReceipt: false, requiredSignals: [], examples: ['roadmap mf init --note "start run"'] },
  { id: 'mf-audit', tokens: ['mf', 'audit'], description: 'Run audit detectors', flags: ['--required', '--run', '--note'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['roadmap mf audit --run run-1 --note "audit"'] },
  { id: 'mf-audit-tail', tokens: ['mf', 'audit-tail'], description: 'Emit audit tail IR fragment', flags: ['--note'], mustHaveDisplayReceipt: false, requiredSignals: [], examples: ['roadmap mf audit-tail emit --note "emit"'] },
];

export interface InventoryValidationResult {
  passed: boolean;
  failures: Array<{ id: string; code: string; message: string }>;
}

export function buildInventory(_argv?: string[][]): CommandEntry[] {
  // Build from known commands + propagate receiptRequired from COMMAND_REGISTRY
  return KNOWN_COMMANDS.map(entry => {
    const regKey = entry.tokens.join(' ');
    const regEntry = COMMAND_REGISTRY[regKey];
    const signals = [...entry.requiredSignals];
    if (regEntry?.receiptRequired) {
      signals.push('receipt-required');
    }
    return { ...entry, requiredSignals: signals };
  });
}

export function validateInventory(entries: CommandEntry[]): InventoryValidationResult {
  const failures: Array<{ id: string; code: string; message: string }> = [];

  for (const entry of entries) {
    if (!entry.exempt && entry.examples.length === 0) {
      failures.push({
        id: entry.id,
        code: 'MISSING_EXAMPLE_VECTOR',
        message: `Command "${entry.id}" has no examples and is not exempt`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

export function writeInventory(entries: CommandEntry[], base = process.cwd()): string {
  const dir = join(base, '.roadmap', 'cli');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'commands.json');
  writeFileSync(p, JSON.stringify(entries, null, 2));
  return p;
}

export function renderInventoryTable(entries: CommandEntry[]): string {
  const lines: string[] = [];
  lines.push('Command                | Receipt | Exempt     | Examples');
  lines.push('---------------------- | ------- | ---------- | --------');
  for (const e of entries) {
    const cmd = e.tokens.join(' ').padEnd(22);
    const receipt = e.mustHaveDisplayReceipt ? 'yes' : 'no ';
    const exempt = e.exempt ? e.exempt.exemptClass.padEnd(10) : '-'.padEnd(10);
    const examples = String(e.examples.length);
    lines.push(`${cmd} | ${receipt.padEnd(7)} | ${exempt} | ${examples}`);
  }
  return lines.join('\n');
}
