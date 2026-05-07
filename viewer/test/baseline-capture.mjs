// Pre-fix viewer GPU baseline · capture two screenshots while document.hidden=true.
// Differing sha256 proves pearl/halo/SVG animations run during background tabs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const puppeteerPath = process.env.PUPPETEER_PATH
  || '/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const { default: puppeteer } = await import(puppeteerPath);

const candidatePorts = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
const envBase = process.env.BASE_URL;
const receiptPath = resolve(process.env.RECEIPT || '.roadmap/round-r5/b-baseline-capture.json');

async function pickBase() {
  if (envBase) return envBase;
  for (const p of candidatePorts) {
    try {
      const r = await fetch(`http://localhost:${p}/`, { method: 'GET' });
      if (r.ok || r.status < 500) return `http://localhost:${p}`;
    } catch {}
  }
  throw new Error('no viewer dev server reachable on 5173-5180');
}

const baseUrl = await pickBase();

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let receipt;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const shot = async () => {
    const buf = await page.screenshot({ fullPage: false });
    return {
      ts: Date.now(),
      sha256: createHash('sha256').update(buf).digest('hex'),
      bytes: buf.length,
    };
  };

  const s1 = await shot();
  await new Promise(r => setTimeout(r, 2000));
  const s2 = await shot();

  const viewerCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const verdict = s1.sha256 !== s2.sha256 ? 'GREEN' : 'BLOCKED';
  const notes = verdict === 'GREEN'
    ? 'pre-fix baseline · screenshots differ → animations active'
    : 'screenshots byte-equal · animations may not be running pre-fix · STOP';

  receipt = {
    node: 'b-baseline-capture',
    verdict,
    baseUrl,
    screenshots: [s1, s2],
    viewerCommit,
    notes,
  };
} finally {
  await browser.close();
}

mkdirSync(dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath, verdict: receipt.verdict, shaA: receipt.screenshots[0].sha256.slice(0, 8), shaB: receipt.screenshots[1].sha256.slice(0, 8) }));
if (receipt.verdict !== 'GREEN') process.exit(1);
