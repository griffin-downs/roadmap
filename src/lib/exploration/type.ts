// @module explore-type
// @exports typeAndSubmit, fillForm, selectFromDropdown, toggleCheckbox
// @entry roadmap/explore

import type { Page } from '@playwright/test';

/** Type into field, then press key (default: Enter) */
export async function typeAndSubmit(
  page: Page,
  selector: string,
  text: string,
  key: string = 'Enter',
): Promise<void> {
  const element = page.locator(selector);

  const count = await element.count();
  if (count === 0) {
    throw new Error(`Selector not found in DOM: ${selector}`);
  }

  await element.first().fill(text);
  await element.first().press(key);
}

/** Fill multiple form fields at once */
export async function fillForm(
  page: Page,
  fields: Record<string, string>,
): Promise<void> {
  for (const [selector, value] of Object.entries(fields)) {
    const element = page.locator(selector);
    const count = await element.count();
    if (count === 0) {
      throw new Error(`Form field not found: ${selector}`);
    }
    await element.first().fill(value);
  }
}

/** Select option from dropdown/select element */
export async function selectFromDropdown(
  page: Page,
  selectSelector: string,
  optionText: string,
): Promise<void> {
  const select = page.locator(selectSelector);
  const count = await select.count();
  if (count === 0) {
    throw new Error(`Select element not found: ${selectSelector}`);
  }

  const tagName = await select.first().evaluate((el) => el.tagName.toLowerCase());

  if (tagName === 'select') {
    await select.first().selectOption(optionText);
  } else {
    await select.first().click();
    const option = page.locator(`text="${optionText}"`).first();
    const optionCount = await option.count();
    if (optionCount === 0) {
      throw new Error(`Option not found in dropdown: ${optionText}`);
    }
    await option.click();
  }
}

/** Check or uncheck a checkbox */
export async function toggleCheckbox(
  page: Page,
  selector: string,
  shouldBeChecked: boolean,
): Promise<void> {
  const checkbox = page.locator(selector);
  const count = await checkbox.count();
  if (count === 0) {
    throw new Error(`Checkbox not found: ${selector}`);
  }

  const isChecked = await checkbox.first().isChecked();
  if (isChecked !== shouldBeChecked) {
    await checkbox.first().click();
  }
}
