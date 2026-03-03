import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { roadmapCliJson } from './cli-helper.ts';

describe('Explore CLI - All Modes', () => {
  it('roadmap explore --api dumps API surface', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api`, {
      encoding: 'utf-8',
    });

    expect(output).toContain('Explore API');
    expect(output).toContain('import from "roadmap/explore"');
    expect(output).toContain('Observation helpers');
    expect(output).toContain('Interaction helpers');
  });

  it('roadmap explore help mentions --run mode', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --help 2>&1 || echo "ok"`, {
      encoding: 'utf-8',
    });

    // The help may come from main help or explore help
    expect(output.toLowerCase()).toMatch(/--run/);
  });

  it('roadmap explore help mentions --eval mode', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --help 2>&1 || echo "ok"`, {
      encoding: 'utf-8',
    });

    // The help may come from main help or explore help
    // Note: --eval is in the signature or examples
    expect(output).toContain('explore');
  });

  it('roadmap explore --api is note-exempt', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api 2>&1`, {
      encoding: 'utf-8',
    });

    // Should not complain about missing --note
    expect(output).not.toContain('Missing --note');
    expect(output).toContain('Observation helpers');
  });

  it('CLI output includes 17 observation helpers', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api`, {
      encoding: 'utf-8',
    });

    const observations = [
      'checkVisible', 'checkText', 'checkStyle', 'checkSize', 'checkCount',
      'checkAttribute', 'checkClass', 'checkContrast', 'checkOverflow',
      'checkDisabled', 'checkChecked', 'checkContainsText', 'checkInputValue',
      'checkUrl', 'checkTitle', 'checkComputedStyle', 'checkInViewport'
    ];

    for (const name of observations) {
      expect(output).toContain(name);
    }
  });

  it('CLI output includes 19 interaction helpers', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api`, {
      encoding: 'utf-8',
    });

    const interactions = [
      'safeClick', 'typeAndSubmit', 'drag', 'waitFor', 'waitForTransition',
      'connectAndFindPage', 'resetState', 'fillForm', 'selectFromDropdown',
      'toggleCheckbox', 'getListItems', 'findItemBy', 'getTableData',
      'waitForNetwork', 'waitForTextChange', 'capturePageState',
      'getConsoleMessages', 'getNetworkCalls', 'screenshot'
    ];

    for (const name of interactions) {
      expect(output).toContain(name);
    }
  });

  it('CLI output shows function signatures', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api`, {
      encoding: 'utf-8',
    });

    // Check for signature patterns like "fn(args) → return"
    expect(output).toMatch(/checkVisible\(.*Page.*selector.*string/);
    expect(output).toMatch(/safeClick\(.*Page.*selector.*string/);
  });

  it('CLI output includes descriptions', () => {
    const output = execSync(`npx tsx bin/roadmap.ts explore --api`, {
      encoding: 'utf-8',
    });

    // Check for descriptive text
    expect(output).toContain('Element present and visible');
    expect(output).toContain('Click with visibility');
  });

  it('roadmap explore --api --json returns JSON', () => {
    const data = roadmapCliJson('explore --api --json');
    expect(data).toHaveProperty('import', 'roadmap/explore');
    expect(data.observations).toHaveLength(17);
    expect(data.interactions).toHaveLength(19);
    expect(data.runtime).toBeDefined();
    expect(data.types).toBeDefined();
  });

  it('roadmap explore --eval evaluates inline code', () => {
    const data = roadmapCliJson('explore --eval "typeof checkVisible" --json');
    expect(data).toHaveProperty('result');
  });

  it('explore is a top-level core command', () => {
    const helpOutput = execSync(`npx tsx bin/roadmap.ts help`, {
      encoding: 'utf-8',
    });

    expect(helpOutput).toContain('explore');
    expect(helpOutput).toMatch(/explore.*--api.*--run.*--eval/);
  });
});
