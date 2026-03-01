// @module explore-size
// @exports checkSize, checkCount, checkOverflow
// @entry roadmap/explore

import type { Page } from '@playwright/test';
import type { ObservationResult } from '../../protocol.ts';

/** Check bounding box width and height exceed minimums */
export async function checkSize(
  page: Page,
  selector: string,
  minW: number,
  minH: number,
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

    const box = await locator.first().boundingBox();

    if (!box) {
      return {
        id,
        pass: false,
        evidence: 'Element has no bounding box (display:none or removed from layout)',
      };
    }

    const pass = box.width >= minW && box.height >= minH;
    return {
      id,
      pass,
      evidence: `${box.width.toFixed(0)}x${box.height.toFixed(0)}px (min: ${minW}x${minH}px)`,
      value: `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Count elements matching selector and verify against expected count */
export async function checkCount(
  page: Page,
  selector: string,
  expected: number,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const count = await page.locator(selector).count();
    const pass = count === expected;

    return {
      id,
      pass,
      evidence: `Found ${count} element(s), expected ${expected}`,
      value: count,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element has scrollable overflow (scroll height/width > client height/width) */
export async function checkOverflow(
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

    const overflow = await locator.first().evaluate((el: any) => {
      return {
        overflowY: el.scrollHeight > el.clientHeight,
        overflowX: el.scrollWidth > el.clientWidth,
      };
    });

    const hasOverflow = overflow.overflowX || overflow.overflowY;
    return {
      id,
      pass: hasOverflow,
      evidence: `Overflow: ${overflow.overflowY ? 'vertical' : ''}${overflow.overflowX && overflow.overflowY ? ' + ' : ''}${overflow.overflowX ? 'horizontal' : 'none'}`,
      value: hasOverflow,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
