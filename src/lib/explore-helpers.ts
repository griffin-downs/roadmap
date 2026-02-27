// @module explore-helpers
// @exports checkVisible, checkText, checkStyle, checkSize, checkCount, checkAttribute, checkClass, checkContrast, checkOverflow
// @types Page (structural)
// @entry roadmap

import type { ObservationResult } from '../protocol.ts';

// Structural Page type — matches Playwright's Page without importing it
interface Page {
  $(selector: string): Promise<ElementHandle | null>;
  $$(selector: string): Promise<ElementHandle[]>;
  evaluate<R>(fn: (...args: any[]) => R, ...args: any[]): Promise<R>;
}

interface ElementHandle {
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  evaluate<R>(fn: (el: Element, ...args: any[]) => R, ...args: any[]): Promise<R>;
  isVisible(): Promise<boolean>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function fail(label: string, evidence: string): ObservationResult {
  return { id: makeId(label), pass: false, evidence };
}

// ── Visibility ──────────────────────────────────────────────────────────────

export async function checkVisible(page: Page, selector: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const visible = await el.isVisible();
    return { id: makeId(label), pass: visible, evidence: visible ? 'element visible' : 'element hidden' };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── Text Content ────────────────────────────────────────────────────────────

export async function checkText(page: Page, selector: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const text = await el.evaluate((e) => (e as HTMLElement).innerText ?? e.textContent ?? '');
    return { id: makeId(label), pass: text.trim().length > 0, evidence: `text: "${text.trim().slice(0, 200)}"`, value: text.trim() };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── Computed Style ──────────────────────────────────────────────────────────

export async function checkStyle(page: Page, selector: string, property: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const value = await el.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), property);
    return { id: makeId(label), pass: value !== '', evidence: `${property}: ${value}`, value };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── Bounding Box / Touch Target ─────────────────────────────────────────────

export async function checkSize(page: Page, selector: string, minW: number, minH: number, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const box = await el.boundingBox();
    if (!box) return fail(label, 'element has no bounding box (not rendered)');
    const pass = box.width >= minW && box.height >= minH;
    return { id: makeId(label), pass, evidence: `${box.width}x${box.height} (min ${minW}x${minH})`, value: `${box.width}x${box.height}` };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── Element Count ───────────────────────────────────────────────────────────

export async function checkCount(page: Page, selector: string, expected: number, label: string): Promise<ObservationResult> {
  try {
    const els = await page.$$(selector);
    const pass = els.length === expected;
    return { id: makeId(label), pass, evidence: `count: ${els.length} (expected ${expected})`, value: els.length };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── HTML Attribute ──────────────────────────────────────────────────────────

export async function checkAttribute(page: Page, selector: string, attr: string, expected: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const value = await el.evaluate((e, a) => e.getAttribute(a), attr);
    const pass = value === expected;
    return { id: makeId(label), pass, evidence: `${attr}="${value}" (expected "${expected}")`, value: value ?? undefined };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── CSS Class ───────────────────────────────────────────────────────────────

export async function checkClass(page: Page, selector: string, className: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const has = await el.evaluate((e, cls) => e.classList.contains(cls), className);
    return { id: makeId(label), pass: has, evidence: has ? `has class "${className}"` : `missing class "${className}"` };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── WCAG Contrast Ratio ─────────────────────────────────────────────────────

export async function checkContrast(page: Page, textSel: string, bgSel: string, minRatio: number, label: string): Promise<ObservationResult> {
  try {
    const ratio = await page.evaluate((ts: string, bs: string) => {
      function parseColor(raw: string): [number, number, number] {
        const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return [0, 0, 0];
        return [+m[1], +m[2], +m[3]];
      }
      function luminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }
      const tEl = document.querySelector(ts);
      const bEl = document.querySelector(bs);
      if (!tEl || !bEl) return -1;
      const fg = parseColor(getComputedStyle(tEl).color);
      const bg = parseColor(getComputedStyle(bEl).backgroundColor);
      const l1 = luminance(...fg);
      const l2 = luminance(...bg);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }, textSel, bgSel);

    if (ratio === -1) return fail(label, `selector not found: ${textSel} or ${bgSel}`);
    const rounded = Math.round(ratio * 100) / 100;
    const pass = rounded >= minRatio;
    return { id: makeId(label), pass, evidence: `contrast ${rounded}:1 (min ${minRatio}:1)`, value: rounded };
  } catch (e: any) {
    return fail(label, e.message);
  }
}

// ── Overflow Detection ──────────────────────────────────────────────────────

export async function checkOverflow(page: Page, selector: string, label: string): Promise<ObservationResult> {
  try {
    const el = await page.$(selector);
    if (!el) return fail(label, `selector not found: ${selector}`);
    const overflow = await el.evaluate((e) => {
      const h = e as HTMLElement;
      return {
        scrollW: h.scrollWidth,
        clientW: h.clientWidth,
        scrollH: h.scrollHeight,
        clientH: h.clientHeight,
      };
    });
    const overflowX = overflow.scrollW > overflow.clientW;
    const overflowY = overflow.scrollH > overflow.clientH;
    const pass = !overflowX && !overflowY;
    const dims = `scroll ${overflow.scrollW}x${overflow.scrollH}, client ${overflow.clientW}x${overflow.clientH}`;
    const dir = overflowX && overflowY ? 'x+y' : overflowX ? 'x' : overflowY ? 'y' : 'none';
    return { id: makeId(label), pass, evidence: `overflow: ${dir} (${dims})`, value: dir };
  } catch (e: any) {
    return fail(label, e.message);
  }
}
