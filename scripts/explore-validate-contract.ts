#!/usr/bin/env npx tsx
// Contract validation explore script — driven by spec-clarified.json
//
// Usage:
//   CDP_URL=http://localhost:9222 npx tsx scripts/explore-validate-contract.ts [contract-path]
//
// Reads spec-clarified.json (or path from argv), maps each feature to an observation
// helper, runs all observations against a live app via CDP, emits ExploreResult JSON.

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkVisible, checkCount, checkContrast } from '../src/lib/exploration/index.ts';
import type { ObservationResult, ExploreResult } from '../src/protocol.ts';

// ─────────────────────────────────────────────────────────────────────────────

function printAPIReference() {
  console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║                      EXPLORE FACILITIES API REFERENCE                      ║
╚════════════════════════════════════════════════════════════════════════════╝

📋 OBSERVATION PATTERNS (9 available):

  • checkVisible(page, selector, label)
    → Test if element is visible in viewport
    → Returns: { id, pass, evidence }

  • checkInteractive(page, selector, label)
    → Test if element is visible AND enabled (keyboard-accessible)
    → Returns: { id, pass, evidence, value: boolean }

  • checkCount(page, selector, minCount, label)
    → Test DOM match count against threshold
    → Returns: { id, pass, evidence, value: count }

  • checkContrast(page, selector, minRatio, label)
    → Test WCAG AA contrast ratio (4.5:1 or custom)
    → Returns: { id, pass, evidence, value: ratio }

  • checkText(page, selector, expectedPattern, label)
    → Extract & validate text content
    → Returns: { id, pass, evidence, value: text }

  • checkStyle(page, selector, cssProperty, expectedValue, label)
    → Validate computed CSS properties
    → Returns: { id, pass, evidence, value: cssValue }

  • checkSize(page, selector, minWidth, minHeight, label)
    → Test element dimensions (touch targets ≥56px, etc)
    → Returns: { id, pass, evidence, value: { width, height } }

  • checkAttribute(page, selector, attrName, expectedValue, label)
    → Validate HTML attributes (data-*, aria-*, etc)
    → Returns: { id, pass, evidence, value: attrValue }

  • checkClass(page, selector, className, label)
    → Test CSS class presence (state, accessibility markers)
    → Returns: { id, pass, evidence, value: boolean }

═══════════════════════════════════════════════════════════════════════════════

🔗 SETUP REQUIREMENTS:

  1. Start your app with CDP debugging enabled:
     → Electron:      --remote-debugging-port=9222
     → Chrome/Chromium: chrome --remote-debugging-port=9222
     → Web (vite):    vite (then use playwright test)

  2. Set CDP connection URL (default: http://localhost:9222):
     → export CDP_URL=http://localhost:9222
     → OR: export CDP_PORT=9222

  3. Provide contract file (spec-clarified.json):
     → npx tsx scripts/explore-validate-contract.ts ./spec-clarified.json
     → Default path: ./spec-clarified.json

═══════════════════════════════════════════════════════════════════════════════

📊 CONTRACT FORMAT (spec-clarified.json):

  {
    "features": [
      {
        "id": "crud-add",
        "selector": "input[placeholder*=Add]",
        "observation": "visible",
        "evidence": "...",
        "minCount": 1,      // optional: for count observations
        "minRatio": 4.5     // optional: for contrast observations
      },
      ...
    ],
    "gaps": [],
    "confidence": 0.95,
    "generated": "2026-02-27T...",
    "source": { ... }
  }

═══════════════════════════════════════════════════════════════════════════════

🎯 OUTPUT FORMAT (ExploreResult JSON):

  {
    "observations": [
      {
        "id": "crud-add",
        "pass": true,
        "evidence": "Input[placeholder*=Add] found and visible",
        "value": true  // observation-specific value
      },
      ...
    ],
    "duration": 1234
  }

═══════════════════════════════════════════════════════════════════════════════

🧠 INTEGRATION FLOW:

  init-gate (vague plan)
    ↓ produces PlanClarityGap[]
    ↓
  spec-generator (clarify-to-contract)
    ↓ produces spec-clarified.json
    ↓
  explore-validate-contract (THIS SCRIPT)
    ↓ runs observations via CDP/Playwright
    ↓
  spec-verifier (verify-against-contract)
    ↓ validates observations match contract
    ↓
  terminal-gate (validate-terminal-gate-spec)
    ↓
  ✅ E2E spec-threading closure

═══════════════════════════════════════════════════════════════════════════════

❓ QUICK START:

  # 1. See the full explore API:
  roadmap explore --api

  # 2. Start your app with CDP:
  npm run electron:dev
  (or: chrome --remote-debugging-port=9222)

  # 3. Run validation:
  roadmap explore ./spec-clarified.json

  # 4. Or write your own script using the roadmap/explore library:
  import { checkVisible, checkCount } from 'roadmap/explore';
  // No need to import Playwright or set up CDP — roadmap handles it!

❓ EXAMPLES:

  # Validate contract:
  roadmap explore ./spec-clarified.json

  # With custom CDP port:
  CDP_PORT=9333 roadmap explore

  # See all available API functions:
  roadmap explore --api

  # Get help:
  roadmap explore --help

═══════════════════════════════════════════════════════════════════════════════
`);
}

const API_SURFACE = {
  observations: [
    { name: 'checkVisible', params: ['page: Page', 'selector: string', 'label: string'], returns: 'ObservationResult', desc: 'Element is visible in viewport' },
    { name: 'checkInteractive', params: ['page: Page', 'selector: string', 'label: string'], returns: 'ObservationResult', desc: 'Element visible AND enabled' },
    { name: 'checkCount', params: ['page: Page', 'selector: string', 'minCount: number', 'label: string'], returns: 'ObservationResult', desc: 'DOM match count >= threshold' },
    { name: 'checkContrast', params: ['page: Page', 'textSelector: string', 'bgSelector: string', 'minRatio: number', 'label: string'], returns: 'ObservationResult', desc: 'WCAG AA contrast ratio' },
    { name: 'checkText', params: ['page: Page', 'selector: string', 'label: string'], returns: 'ObservationResult', desc: 'Extract & validate text' },
    { name: 'checkStyle', params: ['page: Page', 'selector: string', 'property: string', 'label: string'], returns: 'ObservationResult', desc: 'CSS property value' },
    { name: 'checkSize', params: ['page: Page', 'selector: string', 'minWidth: number', 'minHeight: number', 'label: string'], returns: 'ObservationResult', desc: 'Element dimensions' },
    { name: 'checkAttribute', params: ['page: Page', 'selector: string', 'attrName: string', 'expectedValue: string', 'label: string'], returns: 'ObservationResult', desc: 'HTML attribute value' },
    { name: 'checkClass', params: ['page: Page', 'selector: string', 'className: string', 'label: string'], returns: 'ObservationResult', desc: 'CSS class presence' },
    { name: 'checkOverflow', params: ['page: Page', 'selector: string', 'label: string'], returns: 'ObservationResult', desc: 'Scrollable overflow state' }
  ],
  types: {
    ObservationResult: { id: 'string', pass: 'boolean', evidence: 'string', value: 'string | number | boolean | undefined' },
    ExploreResult: { observations: 'ObservationResult[]', duration: 'number' },
    SpecClarifiedJson: { features: 'SpecFeature[]', gaps: 'unknown[]', confidence: 'number', generated: 'string', source: 'object' },
    SpecFeature: { id: 'string', selector: 'string', observation: 'string', evidence: 'string', minCount: 'number?', minRatio: 'number?', expectedValue: 'string?', cssProperty: 'string?', minWidth: 'number?', minHeight: 'number?', attrName: 'string?', className: 'string?' }
  },
  cdpSetup: {
    electron: 'npm run electron:dev',
    chrome: 'chrome --remote-debugging-port=9222 http://localhost:5173',
    chromium: 'chromium --remote-debugging-port=9222 http://localhost:5173',
    env: { CDP_URL: 'http://localhost:9222', CDP_PORT: '9222' }
  }
};

function printError(title: string, message: string, actionItems?: string[]) {
  console.error(`\n❌ ${title}`);
  console.error(`   ${message}\n`);

  if (actionItems && actionItems.length > 0) {
    console.error('🔧 REQUIRED ACTIONS (in order):');
    actionItems.forEach((item, i) => {
      console.error(`   ${i + 1}. ${item}`);
    });
    console.error();
  }

  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('⚠️  DO NOT READ SOURCE CODE OR INVESTIGATE FURTHER');
  console.error('    All required information is in the messages above.');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  printAPIReference();

  // Also output API as JSON for machine consumption
  console.error('\n📋 API Surface (JSON):');
  console.error(JSON.stringify(API_SURFACE, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────

const CDP_URL = process.env.CDP_URL ?? `http://localhost:${process.env.CDP_PORT ?? '9222'}`;

interface ContractFeature {
  id: string;
  selector: string;
  observation: 'visible' | 'interactive' | 'count' | 'contrast';
  evidence: string;
  minCount?: number;
  minRatio?: number;
}

interface ClarifiedContract {
  features: ContractFeature[];
  gaps: unknown[];
  confidence: number;
}

function loadContract(path: string): ClarifiedContract {
  try {
    const raw = readFileSync(path, 'utf-8');
    const contract = JSON.parse(raw) as ClarifiedContract;
    if (!Array.isArray(contract.features) || contract.features.length === 0) {
      throw new Error(`Contract has no features: ${path}`);
    }
    return contract;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      printError(
        'Contract file not found',
        `Could not read: ${path}`,
        [
          `Check that file exists: ls -la ${path}`,
          `If missing, run init gate to generate: clarify-to-contract node`,
          `Or pass explicit path: npx tsx scripts/explore-validate-contract.ts ./path/to/spec-clarified.json`,
          `Expected location: ${resolve('./spec-clarified.json')}`
        ]
      );
    } else if (err instanceof SyntaxError) {
      printError(
        'Invalid JSON in contract file',
        `${path} contains malformed JSON: ${err.message}`,
        [
          `Validate JSON syntax: jq . ${path}`,
          `Regenerate contract if corrupted: run clarify-to-contract node`,
          `Expected format: { features: [...], gaps: [...], confidence: number }`
        ]
      );
    } else {
      printError(
        'Failed to load contract',
        `${err.message}`,
        [
          `Verify file is readable: cat ${path} | head -5`,
          `Check permissions: chmod 644 ${path}`,
          `Regenerate if damaged: run clarify-to-contract node`
        ]
      );
    }
    process.exit(1);
  }
}

async function observeFeature(
  page: import('@playwright/test').Page,
  feature: ContractFeature,
): Promise<ObservationResult> {
  switch (feature.observation) {
    case 'visible':
      return checkVisible(page, feature.selector, feature.id);

    case 'interactive': {
      // Interactive = visible + enabled (keyboard-accessible)
      const locator = page.locator(feature.selector);
      const count = await locator.count();
      if (count === 0) {
        return {
          id: feature.id,
          pass: false,
          evidence: `Selector "${feature.selector}" matched no elements`,
        };
      }
      const visible = await locator.first().isVisible();
      if (!visible) {
        return {
          id: feature.id,
          pass: false,
          evidence: `Element not visible at "${feature.selector}"`,
        };
      }
      const enabled = await locator.first().isEnabled();
      return {
        id: feature.id,
        pass: enabled,
        evidence: enabled
          ? `Element visible and enabled at ${feature.selector}`
          : `Element visible but disabled at ${feature.selector}`,
        value: enabled,
      };
    }

    case 'count': {
      const minCount = feature.minCount ?? 1;
      const locator = page.locator(feature.selector);
      const count = await locator.count();
      const pass = count >= minCount;
      return {
        id: feature.id,
        pass,
        evidence: `Found ${count} element(s), expected >= ${minCount}`,
        value: count,
      };
    }

    case 'contrast':
      return checkContrast(
        page,
        feature.selector,
        feature.selector,
        feature.minRatio ?? 4.5,
        feature.id,
      );

    default:
      return {
        id: feature.id,
        pass: false,
        evidence: `Unknown observation type: ${(feature as any).observation}`,
      };
  }
}

async function run() {
  const contractPath = resolve(process.argv[2] ?? 'spec-clarified.json');
  const contract = loadContract(contractPath);

  let browser;
  try {
    const start = Date.now();

    // Connect to CDP with helpful error messaging
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
    } catch (err: any) {
      if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
        const platform = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
        printError(
          'Cannot connect to browser via CDP',
          `Failed to connect to ${CDP_URL}\n\nNo process is listening on that port or the browser isn't running with debugging enabled.`,
          [
            `1. Check if something is listening on port 9222:\n      lsof -i :9222 (macOS/Linux) or netstat -ano | findstr :9222 (Windows)`,
            `2. If nothing is listening, start your app with CDP enabled:\n\n      OPTION A - Electron app:\n      npm run electron:dev\n\n      OPTION B - Chrome/Chromium:\n      google-chrome --remote-debugging-port=9222 http://localhost:5173\n\n      OPTION C - Web app (Vite):\n      npm run dev\n      (then run: npm run test:e2e to use Playwright)`,
            `3. If listening on different port, set CDP_PORT:\n      export CDP_PORT=9333\n      npx tsx scripts/explore-validate-contract.ts`,
            `4. If app is on different host, set CDP_URL:\n      export CDP_URL=http://192.168.1.100:9222\n      npx tsx scripts/explore-validate-contract.ts`,
            `5. Verify connection works:\n      curl http://localhost:9222/json/version`
          ]
        );
      }
      throw err;
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
      printError(
        'No browser contexts found',
        `The browser is running but has no windows/tabs open.`,
        [
          `1. Make sure your app window is visible and not minimized`,
          `2. Reload the app window: Ctrl+R (or Cmd+R on macOS)`,
          `3. Verify app loaded successfully by checking DevTools`,
          `4. For Electron: electron:dev should auto-open the window`,
          `5. For Chrome: ensure you passed a valid URL to chrome command`
        ]
      );
      throw new Error('No browser contexts found');
    }

    const page = contexts[0].pages().find(p => !p.url().startsWith('devtools://'));
    if (!page) {
      const urls = contexts[0].pages().map(p => p.url()).join(', ');
      printError(
        'No application page found',
        `Connected to browser but only found DevTools pages. Current pages: ${urls}`,
        [
          `1. Click on the app window to make sure it's visible`,
          `2. Check app console for errors: DevTools → Console tab`,
          `3. Reload page: Ctrl+R (or Cmd+R on macOS)`,
          `4. Verify app started successfully in terminal output`,
          `5. For Electron: check if window closed or loading failed`
        ]
      );
      throw new Error('No application page found (only devtools pages)');
    }

    console.log(`\n📊 Validating contract against: ${page.url()}\n`);

    const observations: ObservationResult[] = [];
    for (const feature of contract.features) {
      observations.push(await observeFeature(page, feature));
    }

    await browser.close();

    const result: ExploreResult = {
      observations,
      duration: Date.now() - start,
    };

    console.log(JSON.stringify(result, null, 2));

    const failed = observations.filter(o => !o.pass);
    if (failed.length > 0) {
      console.error(`\n⚠️  ${failed.length}/${observations.length} observations failed\n`);
      process.exit(1);
    } else {
      console.log(`\n✅ All ${observations.length} observations passed!\n`);
    }
  } catch (err: any) {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    throw err;
  }
}

run().catch((err) => {
  // Always print error + API reference for any failure
  console.error('\n' + '═'.repeat(80));
  console.error('❌ EXPLORE VALIDATION FAILED');
  console.error('═'.repeat(80));
  console.error(`\nError: ${err.message || String(err)}\n`);
  console.error('⚠️  DO NOT READ SOURCE CODE OR INVESTIGATE FURTHER');
  console.error('    All required information is in the messages above.\n');
  printAPIReference();

  // Output API as JSON for machine consumption
  console.error('\n📋 API Surface (JSON):');
  console.error(JSON.stringify(API_SURFACE, null, 2));

  process.exit(1);
});
