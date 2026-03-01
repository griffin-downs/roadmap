// @module explore-drag
// @exports drag
// @entry roadmap/explore

import type { Page } from '@playwright/test';

/** Mouse drag from source to target. Smooth motion with configurable steps. */
export async function drag(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  opts: { steps?: number } = {},
): Promise<void> {
  const { steps = 10 } = opts;

  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  const sourceCount = await source.count();
  if (sourceCount === 0) {
    throw new Error(`Source selector not found in DOM: ${sourceSelector}`);
  }

  const targetCount = await target.count();
  if (targetCount === 0) {
    throw new Error(`Target selector not found in DOM: ${targetSelector}`);
  }

  const sourceBbox = await source.first().boundingBox();
  const targetBbox = await target.first().boundingBox();

  if (!sourceBbox) {
    throw new Error(`Source element has no bounding box (not in viewport?): ${sourceSelector}`);
  }

  if (!targetBbox) {
    throw new Error(`Target element has no bounding box (not in viewport?): ${targetSelector}`);
  }

  const srcX = sourceBbox.x + sourceBbox.width / 2;
  const srcY = sourceBbox.y + sourceBbox.height / 2;
  const tgtX = targetBbox.x + targetBbox.width / 2;
  const tgtY = targetBbox.y + targetBbox.height / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = srcX + (tgtX - srcX) * progress;
    const y = srcY + (tgtY - srcY) * progress;
    await page.mouse.move(x, y);
  }

  await page.mouse.up();
}
