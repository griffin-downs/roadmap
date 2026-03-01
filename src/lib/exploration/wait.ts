// @module explore-wait
// @exports waitFor, waitForTransition, connectAndFindPage, resetState, waitForNetwork, waitForTextChange, getListItems, findItemBy, getTableData, capturePageState, getConsoleMessages, getNetworkCalls, screenshot
// @entry roadmap/explore

import type { Page, Locator } from '@playwright/test';

/** Wait for element to be attached + visible + enabled (default 5000ms) */
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

/** Wait for CSS transitions/animations to settle (default 300ms) */
export async function waitForTransition(page: Page, ms: number = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Connect via CDP, filter out DevTools pages, return app page */
export async function connectAndFindPage(
  cdpUrl: string,
): Promise<{ page: Page; browser: any }> {
  const { chromium } = await import('@playwright/test');

  const browser = await chromium.connectOverCDP(cdpUrl);

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found via CDP');
  }

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

/** Call window.__DEMO_RESET__() if available for test isolation */
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

/** Wait for network to be idle (no pending requests) */
export async function waitForNetwork(page: Page, timeout: number = 5000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (err: any) {
    throw new Error(`Network did not idle within ${timeout}ms: ${err.message}`);
  }
}

/** Wait for element text to change from initial value */
export async function waitForTextChange(
  page: Page,
  selector: string,
  timeout: number = 5000,
): Promise<string> {
  const element = page.locator(selector);
  const initialText = await element.first().textContent();

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const currentText = await element.first().textContent();
    if (currentText !== initialText) {
      return currentText || '';
    }
    await page.waitForTimeout(100);
  }

  throw new Error(`Text did not change for ${selector} within ${timeout}ms`);
}

/** Get all text content from list items matching selector */
export async function getListItems(
  page: Page,
  itemSelector: string,
): Promise<string[]> {
  const items = page.locator(itemSelector);
  const count = await items.count();

  if (count === 0) {
    return [];
  }

  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text) texts.push(text.trim());
  }

  return texts;
}

/** Find list item by partial text match */
export async function findItemBy(
  page: Page,
  itemSelector: string,
  partialText: string,
): Promise<Locator | null> {
  const items = page.locator(itemSelector);
  const count = await items.count();

  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text && text.includes(partialText)) {
      return items.nth(i);
    }
  }

  return null;
}

/** Extract table data as array of objects */
export async function getTableData(
  page: Page,
  tableSelector: string,
): Promise<Record<string, string>[]> {
  const table = page.locator(tableSelector);
  const count = await table.count();
  if (count === 0) {
    throw new Error(`Table not found: ${tableSelector}`);
  }

  const data = await table.first().evaluate((el) => {
    const headers: string[] = [];
    const rows: Record<string, string>[] = [];

    const headerCells = el.querySelectorAll('thead th, thead td');
    headerCells.forEach((cell) => {
      headers.push((cell.textContent || '').trim());
    });

    const dataCells = el.querySelectorAll('tbody tr');
    dataCells.forEach((row) => {
      const rowObj: Record<string, string> = {};
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, idx) => {
        rowObj[headers[idx] || `col-${idx}`] = (cell.textContent || '').trim();
      });
      rows.push(rowObj);
    });

    return rows;
  });

  return data;
}

/** Capture full page state: URL, title, DOM size, console errors */
export async function capturePageState(page: Page): Promise<{
  url: string;
  title: string;
  domSize: number;
  consoleMessages: string[];
  consoleErrors: string[];
}> {
  const consoleMessages: string[] = [];
  const consoleErrors: string[] = [];

  const messageListener = (msg: any) => {
    consoleMessages.push(msg.text());
  };

  const errorListener = (err: Error) => {
    consoleErrors.push(err.message);
  };

  page.on('console', messageListener);
  page.on('pageerror', errorListener);

  const state = {
    url: page.url(),
    title: await page.title(),
    domSize: await page.evaluate(() => document.documentElement.outerHTML.length),
    consoleMessages: [...consoleMessages],
    consoleErrors: [...consoleErrors],
  };

  page.off('console', messageListener);
  page.off('pageerror', errorListener);

  return state;
}

/** Collect all console messages during a callback */
export async function getConsoleMessages(
  page: Page,
  fn: () => Promise<void>,
): Promise<Array<{ type: string; text: string }>> {
  const messages: Array<{ type: string; text: string }> = [];

  const handler = (msg: any) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
    });
  };

  page.on('console', handler);

  try {
    await fn();
  } finally {
    page.off('console', handler);
  }

  return messages;
}

/** Capture all network requests during a callback */
export async function getNetworkCalls(
  page: Page,
  fn: () => Promise<void>,
): Promise<
  Array<{
    url: string;
    method: string;
    status?: number;
    resourceType: string;
  }>
> {
  const calls: Array<{
    url: string;
    method: string;
    status?: number;
    resourceType: string;
  }> = [];

  const handler = (response: any) => {
    calls.push({
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      resourceType: response.request().resourceType(),
    });
  };

  page.on('response', handler);

  try {
    await fn();
  } finally {
    page.off('response', handler);
  }

  return calls;
}

/** Take screenshot with optional clip region */
export async function screenshot(
  page: Page,
  path: string,
  opts: { clip?: { x: number; y: number; width: number; height: number } } = {},
): Promise<void> {
  try {
    await page.screenshot({ path, ...opts });
  } catch (err: any) {
    throw new Error(`Failed to take screenshot: ${err.message}`);
  }
}
