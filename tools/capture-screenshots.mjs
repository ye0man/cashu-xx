import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hold a key for a few frames so Phaser's per-frame JustDown check sees it. */
async function tap(page, key) {
  await page.keyboard.down(key);
  await sleep(120);
  await page.keyboard.up(key);
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
  await tap(page, 'Enter');
  await sleep(700);
  await page.screenshot({ path: `${outDir}/2-payment.png` });
}

if (mode === 'all' || mode === 'world-dialog') {
  await page.evaluate(() => {
    localStorage.setItem(
      'cashu-xx.save.v1',
      JSON.stringify({
        mapId: 'nutsterdam',
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
  await tap(page, 'KeyC');
  await sleep(3000);
  await page.screenshot({ path: `${outDir}/3-overworld.png` });
  await tap(page, 'Enter');
  await sleep(1000);
  await page.screenshot({ path: `${outDir}/4-dialog.png` });
}

async function spawnAt(save) {
  await page.evaluate((data) => {
    localStorage.setItem(
      'cashu-xx.save.v1',
      JSON.stringify({ readSigns: [], flags: [], savedAt: Date.now(), ...data }),
    );
  }, save);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);
  await tap(page, 'KeyC');
  await sleep(2500);
}

if (mode === 'all' || mode === 'extras') {
  await spawnAt({ mapId: 'lab', tileX: 7, tileY: 7, facing: 'up' });
  await page.screenshot({ path: `${outDir}/5-lab.png` });
  await spawnAt({ mapId: 'nutsterdam', tileX: 31, tileY: 12, facing: 'up' });
  await tap(page, 'KeyN');
  await sleep(800);
  await page.screenshot({ path: `${outDir}/6-night.png` });
}

await browser.close();
process.stdout.write(`captured (${mode}) to ${outDir}\n`);
