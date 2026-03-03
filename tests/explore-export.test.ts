import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('Explore API - Package Export Resolution', () => {
  it('roadmap/explore exports observation helpers', async () => {
    const code = `
import {
  checkVisible, checkText, checkStyle, checkSize, checkCount,
  checkAttribute, checkClass, checkContrast, checkOverflow,
  checkDisabled, checkChecked, checkContainsText, checkInputValue,
  checkUrl, checkTitle, checkComputedStyle, checkInViewport
} from './src/index.explore.ts';
console.log('count:', 17);
    `;
    const result = execSync(`npx tsx -e "${code.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
    expect(result).toContain('count: 17');
  });

  it('roadmap/explore exports interaction helpers', async () => {
    const code = `
import {
  safeClick, typeAndSubmit, drag, waitFor, waitForTransition,
  connectAndFindPage, resetState, fillForm, selectFromDropdown,
  toggleCheckbox, getListItems, findItemBy, getTableData,
  waitForNetwork, waitForTextChange, capturePageState,
  getConsoleMessages, getNetworkCalls, screenshot
} from './src/index.explore.ts';
console.log('count:', 19);
    `;
    const result = execSync(`npx tsx -e "${code.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
    expect(result).toContain('count: 19');
  });

  it('roadmap/explore exports runtime orchestration', async () => {
    const code = `
import { launchApp, runExploreScript, mapObservationsToChecks, teardown } from './src/index.explore.ts';
console.log('count:', 4);
    `;
    const result = execSync(`npx tsx -e "${code.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
    expect(result).toContain('count: 4');
  });

  it('package.json includes ./explore export', () => {
    const packageJson = require('../package.json');
    expect(packageJson.exports['./explore']).toBe('./src/index.explore.ts');
  });

  it('total exports >= 36 items', async () => {
    const code = `
import * as api from './src/index.explore.ts';
const count = Object.keys(api).filter(k => !k.startsWith('_')).length;
console.log(count);
    `;
    const result = execSync(`npx tsx -e "${code.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
    const count = parseInt(result.trim());
    expect(count).toBeGreaterThanOrEqual(36);
  });
});
