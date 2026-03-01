// @module explore-click
// @exports safeClick
// @entry roadmap/explore

import type { Page } from '@playwright/test';

/** Click with visibility guard. Checks visible before clicking. Throws if not visible. */
export async function safeClick(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector);

  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  const isVisible = await element.first().isVisible();
  if (!isVisible) {
    throw new Error(`Element not visible (cannot click): ${selector}`);
  }

  const isEnabled = await element.first().isEnabled();
  if (!isEnabled) {
    throw new Error(`Element disabled (cannot interact): ${selector}`);
  }

  await element.first().click();
}
