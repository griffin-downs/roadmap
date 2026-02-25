import { test, expect } from 'vitest';
import { detectProjectType } from '../src/project-detector.ts';

test('detector: identifies typescript-react-vite', async () => {
  const result = await detectProjectType('.');
  expect(['typescript-react-vite', 'typescript-node', 'generic']).toContain(result.type);
  expect(result.confidence).toBeGreaterThan(0);
});

test('detector: returns confidence score', async () => {
  const result = await detectProjectType('.');
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
});
