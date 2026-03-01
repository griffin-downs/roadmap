// @module explore-visibility
// @exports checkVisible, checkInViewport, checkDisabled, checkChecked
// @entry roadmap/explore

import type { Page } from '@playwright/test';
import type { ObservationResult } from '../../protocol.ts';

/** Check if element matching selector is visible in the viewport */
export async function checkVisible(
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

    const visible = await locator.first().isVisible();
    return {
      id,
      pass: visible,
      evidence: visible ? `Element visible at ${selector}` : `Element not visible (display:none or outside viewport)`,
      value: visible,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element is in viewport */
export async function checkInViewport(
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

    const inViewport = await locator.first().evaluate((el: any) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
    });

    return {
      id,
      pass: inViewport,
      evidence: inViewport ? 'Element is in viewport' : 'Element is outside viewport',
      value: inViewport,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element is disabled */
export async function checkDisabled(
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

    const disabled = await locator.first().isDisabled();
    return {
      id,
      pass: disabled,
      evidence: disabled ? 'Element is disabled' : 'Element is enabled',
      value: disabled,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if checkbox or radio is checked */
export async function checkChecked(
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

    const checked = await locator.first().isChecked();
    return {
      id,
      pass: checked,
      evidence: checked ? 'Element is checked' : 'Element is unchecked',
      value: checked,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
