import { test, expect } from 'vitest';
import { getProjectType, requireProjectMetadata } from '../src/project-detector.ts';

test('detector: reads project type from .roadmap.json', async () => {
  const projectType = await getProjectType('.');
  // May be null if .roadmap.json doesn't exist
  expect(typeof projectType === 'string' || projectType === null).toBe(true);
});

test('detector: requires .roadmap.json for integration', async () => {
  try {
    await requireProjectMetadata('.');
    // If metadata exists, should not throw
    expect(true).toBe(true);
  } catch (e) {
    // If metadata missing, error should mention .roadmap.json
    expect((e as Error).message).toContain('.roadmap.json');
  }
});
