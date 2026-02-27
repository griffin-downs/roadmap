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
import { checkVisible, checkCount, checkContrast } from '../src/lib/explore-helpers.ts';
import type { ObservationResult, ExploreResult } from '../src/protocol.ts';

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
  const raw = readFileSync(path, 'utf-8');
  const contract = JSON.parse(raw) as ClarifiedContract;
  if (!Array.isArray(contract.features) || contract.features.length === 0) {
    throw new Error(`Contract has no features: ${path}`);
  }
  return contract;
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

  const start = Date.now();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No browser contexts found');

  const page = contexts[0].pages().find(p => !p.url().startsWith('devtools://'));
  if (!page) throw new Error('No application page found (only devtools pages)');

  const observations: ObservationResult[] = [];
  for (const feature of contract.features) {
    observations.push(await observeFeature(page, feature));
  }

  await browser.close();

  const result: ExploreResult = {
    observations,
    duration: Date.now() - start,
  };

  console.log(JSON.stringify(result));

  const failed = observations.filter(o => !o.pass);
  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
