// @module explore-text
// @exports checkText, checkContainsText, checkInputValue, checkUrl, checkTitle
// @entry roadmap/explore

import type { Page } from '@playwright/test';
import type { ObservationResult } from '../../protocol.ts';

/** Extract and trim rendered text content from element matching selector */
export async function checkText(
  page: Page,
  selector: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const text = await locator.first().textContent();
    const trimmed = (text || '').trim();

    return {
      id,
      pass: trimmed.length > 0,
      evidence: trimmed.length > 0
        ? `Text content: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}"`
        : 'No text content (empty or whitespace-only)',
      value: trimmed,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Get element's inner text and verify it contains expected substring */
export async function checkContainsText(
  page: Page,
  selector: string,
  expectedText: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const text = await locator.first().textContent();
    const pass = text?.includes(expectedText) ?? false;

    return {
      id,
      pass,
      evidence: pass
        ? `Text contains "${expectedText}"`
        : `Text "${text?.slice(0, 50) || '(empty)'}" does not contain "${expectedText}"`,
      value: text || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check form field value */
export async function checkInputValue(
  page: Page,
  selector: string,
  expectedValue: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const locator = page.locator(selector);
    const count = await locator.count();

    if (count === 0) {
      return {
        id,
        pass: false,
        evidence: `Selector "${selector}" matched no elements`,
      };
    }

    const value = await locator.first().inputValue();
    const pass = value === expectedValue;

    return {
      id,
      pass,
      evidence: pass
        ? `Input value matches "${expectedValue}"`
        : `Input value "${value}" does not match "${expectedValue}"`,
      value,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if URL matches pattern */
export async function checkUrl(
  page: Page,
  pattern: string | RegExp,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const url = page.url();
    const pass = typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url);

    return {
      id,
      pass,
      evidence: pass ? `URL matches pattern` : `URL "${url}" does not match pattern`,
      value: url,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check page title */
export async function checkTitle(
  page: Page,
  expectedTitle: string,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const title = await page.title();
    const pass = title.includes(expectedTitle);

    return {
      id,
      pass,
      evidence: pass
        ? `Title contains "${expectedTitle}"`
        : `Title "${title}" does not contain "${expectedTitle}"`,
      value: title,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
