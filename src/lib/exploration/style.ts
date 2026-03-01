// @module explore-style
// @exports checkStyle, checkComputedStyle, checkContrast, checkAttribute, checkClass
// @entry roadmap/explore

import type { Page } from '@playwright/test';
import type { ObservationResult } from '../../protocol.ts';

// ── Luminance & Contrast Ratio (WCAG) ───────────────────────────────────────

/** Relative luminance per WCAG 2.1 — RGB to perceptual brightness */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two luminance values per WCAG 2.1 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse rgb(r, g, b) or rgba(r, g, b, a) or #hex to [r, g, b] */
function parseColor(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const [a, b, c] = hex;
      return [
        parseInt(a + a, 16),
        parseInt(b + b, 16),
        parseInt(c + c, 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }

  return [0, 0, 0];
}

// ── Style Observation Helpers ─────────────────────────────────────────────────

/** Read computed CSS property value from element matching selector */
export async function checkStyle(
  page: Page,
  selector: string,
  property: string,
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

    const value = await locator.first().evaluate((el: any, prop: string) => {
      return getComputedStyle(el).getPropertyValue(prop);
    }, property);

    return {
      id,
      pass: value !== '' && value !== null,
      evidence: value !== '' ? `${property}: ${value}` : `Property "${property}" not set`,
      value: value || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check element's computed CSS property value */
export async function checkComputedStyle(
  page: Page,
  selector: string,
  property: string,
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

    const value = await locator.first().evaluate(
      (el: any, prop: string) => window.getComputedStyle(el).getPropertyValue(prop),
      property,
    );

    const pass = value.trim() === expectedValue.trim();

    return {
      id,
      pass,
      evidence: pass
        ? `${property}: ${value}`
        : `${property}: "${value}" (expected "${expectedValue}")`,
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

/** Measure text contrast ratio between text and background elements per WCAG 2.1 */
export async function checkContrast(
  page: Page,
  textSel: string,
  bgSel: string,
  minRatio: number,
  label: string,
): Promise<ObservationResult> {
  const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    const textLoc = page.locator(textSel);
    const bgLoc = page.locator(bgSel);

    if (await textLoc.count() === 0) {
      return {
        id,
        pass: false,
        evidence: `Text selector "${textSel}" matched no elements`,
      };
    }

    if (await bgLoc.count() === 0) {
      return {
        id,
        pass: false,
        evidence: `Background selector "${bgSel}" matched no elements`,
      };
    }

    const textColor = await textLoc.first().evaluate((el: any) => {
      return getComputedStyle(el).color;
    });

    const bgColor = await bgLoc.first().evaluate((el: any) => {
      return getComputedStyle(el).backgroundColor;
    });

    const [tr, tg, tb] = parseColor(textColor);
    const [br, bg, bb] = parseColor(bgColor);

    const tLum = getLuminance(tr, tg, tb);
    const bLum = getLuminance(br, bg, bb);
    const ratio = contrastRatio(tLum, bLum);

    const pass = ratio >= minRatio;
    return {
      id,
      pass,
      evidence: `Contrast ratio: ${ratio.toFixed(2)}:1 (min: ${minRatio}:1) — text: ${textColor}, bg: ${bgColor}`,
      value: parseFloat(ratio.toFixed(2)),
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element's attribute matches expected value */
export async function checkAttribute(
  page: Page,
  selector: string,
  attr: string,
  expected: string,
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

    const value = await locator.first().getAttribute(attr);
    const pass = value === expected;

    return {
      id,
      pass,
      evidence: `${attr}="${value || '(not set)'}" (expected: "${expected}")`,
      value: value || undefined,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}

/** Check if element has a specific CSS class */
export async function checkClass(
  page: Page,
  selector: string,
  className: string,
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

    const pass = await locator.first().evaluate((el: any, cls: string) => {
      return el.classList.contains(cls);
    }, className);

    return {
      id,
      pass,
      evidence: pass ? `Class "${className}" present` : `Class "${className}" not found`,
      value: pass,
    };
  } catch (err: any) {
    return {
      id,
      pass: false,
      evidence: `error: ${err.message?.slice(0, 100) || String(err).slice(0, 100)}`,
    };
  }
}
