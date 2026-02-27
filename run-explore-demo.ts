import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function main() {
  // Read contract
  const contractRaw = readFileSync('./spec-clarified.json', 'utf-8');
  const contract = JSON.parse(contractRaw);
  
  console.log('\n🔍 Launching browser with explore observations...\n');
  console.log('📋 Contract: ' + contract.features.length + ' features\n');
  console.log('🔬 Running observations:\n');
  
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  await page.goto('file:///tmp/test-app.html');
  
  // Run observations for each feature
  for (const feature of contract.features) {
    let pass = false;
    let evidence = '';
    
    if (feature.observation === 'visible') {
      const loc = page.locator(feature.selector);
      const count = await loc.count();
      pass = count > 0 && await loc.first().isVisible();
      evidence = pass ? `✅ ${feature.selector} found & visible` : `❌ Not found or hidden`;
    } else if (feature.observation === 'interactive') {
      const loc = page.locator(feature.selector);
      const count = await loc.count();
      if (count > 0) {
        const enabled = await loc.first().isEnabled();
        pass = enabled;
        evidence = pass ? `✅ ${count} checkboxes, all enabled` : `❌ Found but disabled`;
      } else {
        evidence = `❌ No elements found`;
      }
    } else if (feature.observation === 'count') {
      const loc = page.locator(feature.selector + ' li');
      const count = await loc.count();
      const min = feature.minCount || 1;
      pass = count >= min;
      evidence = `${pass ? '✅' : '❌'} Found ${count}, expected >= ${min}`;
    } else if (feature.observation === 'contrast') {
      const loc = page.locator(feature.selector);
      pass = await loc.count() > 0;
      evidence = pass ? `✅ ${feature.selector} visible` : `❌ Not found`;
    }
    
    console.log(`${pass ? '✅' : '❌'} ${feature.id.padEnd(16)} | ${evidence}`);
  }
  
  console.log('\n✨ Exploration complete!\n');
  await browser.close();
}

main().catch(console.error);
