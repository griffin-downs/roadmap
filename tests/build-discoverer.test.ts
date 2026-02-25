import { test, expect } from 'vitest';
import { discoverBuildProcess, discoverAllPhases } from '../src/build-discoverer.ts';

test('discoverer: finds build command', async () => {
  const result = await discoverBuildProcess('.');
  if (result) {
    expect(result.command).toBeTruthy();
    expect(result.produces).toBeInstanceOf(Array);
    expect(result.timeoutMs).toBeGreaterThan(0);
  }
});

test('discoverer: discovers all phases', async () => {
  const phases = await discoverAllPhases('.');
  expect(phases).toBeInstanceOf(Object);
});
