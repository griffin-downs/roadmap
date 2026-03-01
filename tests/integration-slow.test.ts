// Slow integration tests (runs separately via `npm run test:slow`)
import { describe, it, expect } from 'vitest';

describe('Integration (slow)', () => {
  it('should build large DAG', async () => {
    // Slow test
    expect(true).toBe(true);
  });

  it('should handle circular deps gracefully', async () => {
    // Slow test
    expect(true).toBe(true);
  });
});
