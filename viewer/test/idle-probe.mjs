// Post-fix viewer state-machine probe · 3 phases (active · idle · calm).
// P1 ACTIVE: screenshots over 1s should differ (animations running).
// P2 IDLE: hide tab → screenshots over 2s should be byte-equal (data-idle pauses).
// P3 CALM: click toolbar 'calm' → pearl::before display:none + screenshots equal.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const puppeteerPath = process.env.PUPPETEER_PATH
  || '/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const { default: puppeteer } = await import(puppeteerPath);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const receiptPath = resolve(process.env.RECEIPT || '.roadmap/round-r5/v-idle-probe.json');

async function shot(page) {
  const buf = await page.screenshot({ fullPage: false });
  return { ts: Date.now(), sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const phases = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // P1 ACTIVE
  {
    const a = await shot(page);
    await new Promise(r => setTimeout(r, 1000));
    const b = await shot(page);
    phases.push({ id: 'active', a, b, pass: a.sha256 !== b.sha256 });
  }

  // P2 IDLE
  {
    await setHidden(page, true);
    await new Promise(r => setTimeout(r, 250));
    const a = await shot(page);
    await new Promise(r => setTimeout(r, 2000));
    const b = await shot(page);
    phases.push({ id: 'idle', a, b, pass: a.sha256 === b.sha256 });
    await setHidden(page, false);
  }

  // P3 CALM
  {
    await new Promise(r => setTimeout(r, 500));
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const calm = btns.find(b => b.textContent?.trim().toLowerCase() === 'calm');
      if (!calm) return false;
      calm.click();
      return true;
    });
    await new Promise(r => setTimeout(r, 300));
    const display = await page.evaluate(() => {
      const shell = document.querySelector('.viewer-shell');
      return shell ? getComputedStyle(shell, '::before').display : null;
    });
    const a = await shot(page);
    await new Promise(r => setTimeout(r, 2000));
    const b = await shot(page);
    phases.push({
      id: 'calm', a, b,
      pass: clicked && a.sha256 === b.sha256 && display === 'none',
      clicked, displayBefore: display,
    });
  }
} finally {
  await browser.close();
}

const allPass = phases.every(p => p.pass);
const receipt = {
  node: 'v-idle-probe',
  verdict: allPass ? 'GREEN' : 'BLOCKED',
  baseUrl: BASE_URL,
  phases,
  allPass,
};
mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ allPass, perPhase: phases.map(p => ({ id: p.id, pass: p.pass })) }));
process.exit(allPass ? 0 : 1);
