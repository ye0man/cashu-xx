import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const base = process.argv[2] || 'http://localhost:5173';
const outDir = process.argv[3] || 'docs/screenshots';
const mode = process.argv[4] || 'all';

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=980,720', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 980, height: 720 });
await page.goto(base, { waitUntil: 'networkidle2' });
await sleep(2500);

if (mode === 'all' || mode === 'title-pay') {
  await page.screenshot({ path: `${outDir}/1-title.png` });
  await page.keyboard.press('Enter');
  await sleep(700);
  await page.screenshot({ path: `${outDir}/2-payment.png` });
}

if (mode === 'all' || mode === 'world-dialog') {
  await page.evaluate(() => {
    localStorage.setItem(
      'cashu-xx.save.v1',
      JSON.stringify({
        mapId: 'nussstadt',
        tileX: 21,
        tileY: 25,
        facing: 'left',
        readSigns: [],
        flags: [],
        savedAt: Date.now(),
      }),
    );
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.keyboard.press('KeyC');
  await sleep(3000);
  await page.screenshot({ path: `${outDir}/3-overworld.png` });
  await page.keyboard.press('Enter');
  await sleep(1000);
  await page.screenshot({ path: `${outDir}/4-dialog.png` });
}

await browser.close();
process.stdout.write(`captured (${mode}) to ${outDir}\n`);
