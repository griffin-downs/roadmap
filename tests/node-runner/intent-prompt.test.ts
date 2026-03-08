import { test } from 'node:test';
import assert from 'node:assert';

// Tests mirror the logic in bin/roadmap.ts advanceNode for intent gate extraction

test('intent gate produces rich structured prompt with shell evidence', () => {
  const validationChecks = [
    { rule: { type: 'intent', statement: 'All subsystems wired into CLI' }, passed: true, evidence: 'unevaluated', intentStatus: 'unevaluated' },
    { rule: { type: 'shell', command: 'npx tsx test/wiring.test.ts' }, passed: true, evidence: 'exit 0' },
    { rule: { type: 'shell', command: 'npx tsc --noEmit' }, passed: true, evidence: 'exit 0' },
  ];

  const node = { id: 'wiring-verified', desc: 'Verify all subsystems wired', produces: ['test/wiring.test.ts'] };

  // Extract intent gates (mirrors bin/roadmap.ts logic)
  const intentGates: any[] = [];
  for (const c of validationChecks) {
    if (c.rule.type === 'intent') {
      const statement = (c.rule as any).statement ?? '';
      const shellEvidence = validationChecks
        .filter(sc => sc.rule.type === 'shell')
        .map(sc => ({ command: (sc.rule as any).command, passed: sc.passed, evidence: sc.evidence }));
      intentGates.push({
        statement,
        nodeDescription: node.desc,
        produces: node.produces,
        shellEvidence,
        assessmentPrompt: [
          `INTENT: "${statement}"`,
          `Node ${node.id}: ${node.desc}`,
          `Shell validators: ${shellEvidence.filter(s => s.passed).length}/${shellEvidence.length} passing`,
        ].join('\n'),
      });
    }
  }

  assert.strictEqual(intentGates.length, 1);
  assert.strictEqual(intentGates[0].statement, 'All subsystems wired into CLI');
  assert.strictEqual(intentGates[0].nodeDescription, 'Verify all subsystems wired');
  assert.deepStrictEqual(intentGates[0].produces, ['test/wiring.test.ts']);
  assert.strictEqual(intentGates[0].shellEvidence.length, 2);
  assert(intentGates[0].assessmentPrompt.includes('2/2 passing'));
  assert(intentGates[0].assessmentPrompt.includes('INTENT:'));
});

test('unevaluated intent evidence replaced with structured context', () => {
  // Mirrors the evidence enrichment in bin/roadmap.ts check mapping
  const check = {
    rule: { type: 'intent', statement: 'System is complete' },
    passed: true,
    evidence: 'unevaluated',
    intentStatus: 'unevaluated',
  };

  const node = { id: 'term', desc: 'Terminal node', produces: ['out.ts'] };
  const shellPassing = ['echo ok'];

  // Replace unevaluated with structured context
  let evidence = check.evidence;
  if (check.rule.type === 'intent' && evidence === 'unevaluated') {
    evidence = [
      `INTENT GATE: "${check.rule.statement}"`,
      `Node: ${node.id} — ${node.desc}`,
      `Shell evidence: ${shellPassing.join('; ')}`,
      `Produces: ${node.produces.join(', ')}`,
      `Agent must evaluate: does the completed work satisfy this intent?`,
    ].join(' | ');
  }

  assert(!evidence.includes('unevaluated'), 'Should not contain unevaluated');
  assert(evidence.includes('INTENT GATE'), 'Should have INTENT GATE prefix');
  assert(evidence.includes('echo ok'), 'Should include shell evidence');
  assert(evidence.includes('out.ts'), 'Should include produces');
  assert(evidence.includes('Agent must evaluate'), 'Should prompt agent to evaluate');
});

test('no intent gates when no intent validators', () => {
  const checks = [
    { rule: { type: 'shell', command: 'echo ok' }, passed: true },
  ];
  const gates = checks.filter(c => c.rule.type === 'intent');
  assert.strictEqual(gates.length, 0);
});
