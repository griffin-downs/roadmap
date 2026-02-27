import { readFileSync } from 'node:fs';
import { verifyObservationsAgainstContract } from './src/lib/spec-verifier.ts';
import type { SpecClarifiedJson, ObservationResult } from './src/protocol.ts';

// Load contract
const contractRaw = readFileSync('./spec-clarified.json', 'utf-8');
const contract = JSON.parse(contractRaw) as SpecClarifiedJson;

console.log('📋 Contract loaded:', contract.features.length, 'features\n');
contract.features.forEach(f => {
  console.log(`  • ${f.id} [${f.observation}] on "${f.selector}"`);
});
console.log();

// Simulate observations as if they came from a browser explore run
const mockObservations: ObservationResult[] = [
  {
    id: 'crud-add',
    pass: true,
    evidence: 'Input[placeholder*=Add] found and visible',
  },
  {
    id: 'crud-toggle',
    pass: true,
    evidence: 'Checkbox found, visible and enabled',
  },
  {
    id: 'crud-list',
    pass: true,
    evidence: 'Found 3 items in [data-testid=item-list]',
    value: 3,
  },
  {
    id: 'text-contrast',
    pass: false,
    evidence: 'Body contrast ratio 3.2:1, expected >= 4.5:1 (WCAG AA)',
    value: 3.2,
  },
  {
    id: 'auth-form',
    pass: false,
    evidence: 'form[data-testid=auth] not found',
  },
];

console.log('🔍 Mock observations (as if from live browser):');
mockObservations.forEach(obs => {
  console.log(`  [${obs.pass ? '✅' : '❌'}] ${obs.id}: ${obs.evidence}`);
});
console.log();

// Verify
const result = verifyObservationsAgainstContract(contract, mockObservations);

console.log('📊 Verification result:');
console.log(`  Overall: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Passed: ${mockObservations.filter(o => o.pass).length}/${mockObservations.length}`);

if (result.failures.length > 0) {
  console.log('\n⚠️  Failures:');
  result.failures.forEach(f => {
    console.log(`  • ${f.featureId}: ${f.reason}`);
  });
}

console.log('\n📝 Contract metadata:');
console.log(`  Generated: ${contract.generated}`);
console.log(`  Confidence: ${contract.confidence * 100}%`);
console.log(`  From ${contract.source.planNodes} plan nodes, resolved ${contract.source.resolvedGaps} gaps`);
