import { test, expect } from 'vitest';
import { planIntegration } from '../src/auto-integrate.ts';

test('auto-integrate: plans integration', async () => {
  const plan = await planIntegration('.');
  expect(plan.metadata).toBeDefined();
  expect(plan.buildProcess).toBeTruthy();
  expect(typeof plan.timeEstimate).toBe('number');
});
