import { test } from 'node:test';
import assert from 'node:assert';
import { getMakeInvariants, MakeInvariant } from '../src/lib/api-invariants';

test('getMakeInvariants returns array with at least 11 items', () => {
  const invariants = getMakeInvariants();
  assert(Array.isArray(invariants), 'invariants should be an array');
  assert(invariants.length >= 11, `expected at least 11 invariants, got ${invariants.length}`);
});

test('every invariant has all required fields', () => {
  const invariants = getMakeInvariants();
  for (const inv of invariants) {
    assert(inv.id, `invariant missing id: ${JSON.stringify(inv)}`);
    assert(inv.gate, `invariant ${inv.id} missing gate`);
    assert(inv.requirement, `invariant ${inv.id} missing requirement`);
    assert(inv.appliesTo, `invariant ${inv.id} missing appliesTo`);
    assert(inv.example, `invariant ${inv.id} missing example`);
    assert(typeof inv.example === 'object', `invariant ${inv.id} example should be object`);
  }
});

test('terminal-intent-gate invariant exists with correct skipFlag', () => {
  const invariants = getMakeInvariants();
  const terminal = invariants.find((inv) => inv.id === 'terminal-intent-gate');
  assert(terminal, 'terminal-intent-gate invariant not found');
  assert.strictEqual(terminal.skipFlag, '--skip-terminal-intent', 'incorrect skipFlag for terminal-intent-gate');
});

test('init-boundary-gate invariant exists', () => {
  const invariants = getMakeInvariants();
  const initBoundary = invariants.find((inv) => inv.id === 'init-boundary-gate');
  assert(initBoundary, 'init-boundary-gate invariant not found');
  assert(initBoundary.requirement.includes('expandOnFail'), 'init-boundary-gate should mention expandOnFail');
  assert(initBoundary.requirement.includes('plan') || initBoundary.requirement.includes('clarity'), 'init-boundary-gate should mention plan or clarity');
});

test('all invariant IDs are unique', () => {
  const invariants = getMakeInvariants();
  const ids = invariants.map((inv) => inv.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, uniqueIds.size, `duplicate invariant IDs found: ${JSON.stringify(ids)}`);
});

test('all invariants with skipFlag have it documented', () => {
  const invariants = getMakeInvariants();
  for (const inv of invariants) {
    if (inv.skipFlag) {
      assert(inv.skipFlag.startsWith('--'), `skipFlag should start with -- for ${inv.id}`);
    }
  }
});
