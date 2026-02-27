// @module explore-interactions
// @exports safeClick, typeAndSubmit, drag, waitFor, waitForTransition, connectAndFindPage, resetState
// @types Page, Locator (from @playwright/test)
// @entry roadmap

import type { Page, Locator } from '@playwright/test';

// ── safeClick ───────────────────────────────────────────────────────────────
// Click with visibility guard. Checks visible before clicking. Throws if not visible.

export async function safeClick(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);

  // Check element exists in DOM
  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  // Check visibility (isVisible is false if detached, hidden, or display:none)
  const isVisible = await element.first().isVisible();
  if (!isVisible) {
    throw new Error(`Element not visible (cannot click): ${selector}`);
  }

  // Check enabled state if it's a button/input
  const isEnabled = await element.first().isEnabled();
  if (!isEnabled) {
    throw new Error(`Element disabled (cannot interact): ${selector}`);
  }

  // Perform the click
  await element.first().click();
}

// ── typeAndSubmit ───────────────────────────────────────────────────────────
// Type into field, then press key (default: Enter)

export async function typeAndSubmit(
  page: Page,
  selector: string,
  text: string,
  key: string = 'Enter',
): Promise<void> {
  const element = page.locator(selector);

  // Check element exists
  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  // Clear existing value and type
  await element.first().fill(text);

  // Press the key (Enter by default)
  await element.first().press(key);
}

// ── drag ────────────────────────────────────────────────────────────────────
// Mouse drag from source to target. Smooth motion with configurable steps.

export async function drag(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  opts: { steps?: number } = {},
): Promise<void> {
  const { steps = 10 } = opts;

  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  // Check both elements exist
  const sourceCount = await source.count();
  if (sourceCount === 0) {
    throw new Error(`Source selector not found in DOM: ${sourceSelector}`);
  }

  const targetCount = await target.count();
  if (targetCount === 0) {
    throw new Error(`Target selector not found in DOM: ${targetSelector}`);
  }

  // Get bounding boxes
  const sourceBbox = await source.first().boundingBox();
  const targetBbox = await target.first().boundingBox();

  if (!sourceBbox) {
    throw new Error(`Source element has no bounding box (not in viewport?): ${sourceSelector}`);
  }

  if (!targetBbox) {
    throw new Error(`Target element has no bounding box (not in viewport?): ${targetSelector}`);
  }

  // Calculate center points
  const srcX = sourceBbox.x + sourceBbox.width / 2;
  const srcY = sourceBbox.y + sourceBbox.height / 2;
  const tgtX = targetBbox.x + targetBbox.width / 2;
  const tgtY = targetBbox.y + targetBbox.height / 2;

  // Perform smooth drag with steps
  await page.mouse.move(srcX, srcY);
  await page.mouse.down();

  // Move in steps for smooth motion
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = srcX + (tgtX - srcX) * progress;
    const y = srcY + (tgtY - srcY) * progress;
    await page.mouse.move(x, y);
  }

  await page.mouse.up();
}

// ── waitFor ─────────────────────────────────────────────────────────────────
// Wait for element to be attached + visible + enabled (default 5000ms)

export async function waitFor(
  page: Page,
  selector: string,
  timeout: number = 5000,
): Promise<Locator> {
  const element = page.locator(selector);

  try {
    await element.first().waitFor({ state: 'visible', timeout });
  } catch (err: any) {
    if (err.message?.includes('Timeout')) {
      throw new Error(`Element not visible after ${timeout}ms: ${selector}`);
    }
    throw new Error(`Wait failed for selector ${selector}: ${err.message}`);
  }

  return element;
}

// ── waitForTransition ───────────────────────────────────────────────────────
// Wait for CSS transitions/animations to settle (default 300ms)

export async function waitForTransition(page: Page, ms: number = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

// ── connectAndFindPage ──────────────────────────────────────────────────────
// Connect via CDP, filter out DevTools pages, return app page

export async function connectAndFindPage(
  cdpUrl: string,
): Promise<{ page: Page; browser: any }> {
  // chromium is imported dynamically to avoid issues in non-browser contexts
  const { chromium } = await import('@playwright/test');

  const browser = await chromium.connectOverCDP(cdpUrl);

  // Get all contexts (usually just one)
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found via CDP');
  }

  // Find the first non-DevTools page
  let appPage: Page | null = null;
  for (const context of contexts) {
    for (const page of context.pages()) {
      const url = page.url();
      if (!url.startsWith('devtools://') && !url.startsWith('chrome://')) {
        appPage = page;
        break;
      }
    }
    if (appPage) break;
  }

  if (!appPage) {
    throw new Error('No application page found (only devtools/chrome pages detected)');
  }

  return { page: appPage, browser };
}

// ── resetState ──────────────────────────────────────────────────────────────
// Call window.__DEMO_RESET__() if available for test isolation

export async function resetState(page: Page): Promise<void> {
  try {
    const exists = await page.evaluate(() => {
      return typeof (window as any).__DEMO_RESET__ === 'function';
    });

    if (exists) {
      await page.evaluate(() => {
        (window as any).__DEMO_RESET__();
      });
    }
  } catch (err: any) {
    throw new Error(`Failed to reset state: ${err.message}`);
  }
}
