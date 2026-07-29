/**
 * NomadTTY — Android mobile UX documentation screenshots.
 *
 * Captures the screenshots referenced in README.md's "Rigorous mobile UX
 * validation" section, all taken on Playwright's devices['Pixel 7'] profile
 * (real Android viewport, devicePixelRatio=2.625, touch) -- see
 * docs/ai/decision-log.md for why this profile stands in for a full Android
 * emulator/AVD in this environment.
 *
 * Usage:
 *   SESSION_MANAGER_PORT=4000 node scripts/capture-android-mobile-screenshots.mjs
 *
 * Prerequisites:
 *   - server/session-manager.js (or server/main.js) already running --
 *     this script does not start it, matching
 *     scripts/capture-session-manager-screenshots.mjs's convention.
 *
 * Output files go to docs/assets/. Does not regenerate
 * docs/assets/toolbar-overlap-bug-before-fix.png -- that's a historical
 * capture of the bug fixed in src/kb.js's `.kr` padding-right rule (see
 * docs/ai/mistakes.md 2026-07-29-017); the bug it shows can no longer be
 * reproduced against current source.
 */

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'docs', 'assets');
const SESSION_MANAGER_PORT = process.env.SESSION_MANAGER_PORT || '4000';
const BASE_URL = `http://127.0.0.1:${SESSION_MANAGER_PORT}`;
const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

mkdirSync(ASSETS, { recursive: true });

async function waitForTerminalReady(page) {
  await page.waitForSelector('.xterm-screen', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window._S && window._S.readyState === 1, null, { timeout: 15000 });
}

async function createSession(label) {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const { id } = await res.json();
  return id;
}

async function closeSession(id) {
  await fetch(`${BASE_URL}/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const createdIds = [];

  try {
    console.log('Creating sample session for Android mobile screenshots...');
    const id = await createSession('android mobile ux demo');
    createdIds.push(id);

    console.log('Capturing terminal + Back button, live output (Pixel 7)...');
    {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await page.click('.xterm-screen');
      await page.keyboard.type('echo nomadtty android mobile ux test');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#back-btn', { state: 'visible' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-terminal-back-button.png') });
      await ctx.close();
      console.log('  -> screenshot-android-terminal-back-button.png');
    }

    console.log('Capturing toolbar scrolled to end (Pixel 7) -- A+ clear of Back button...');
    {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await page.evaluate(() => {
        const kr = document.querySelector('#kb .kr');
        kr.scrollLeft = kr.scrollWidth;
      });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(ASSETS, 'screenshot-android-toolbar-scrolled.png'),
        clip: { x: 0, y: 0, width: devices['Pixel 7'].viewport.width, height: 70 },
      });
      await ctx.close();
      console.log('  -> screenshot-android-toolbar-scrolled.png');
    }

    console.log('Capturing Fn row expanded (Pixel 7)...');
    {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await page.locator('#kb-fn').tap();
      await page.waitForSelector('#fn-row', { state: 'visible' });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(ASSETS, 'screenshot-android-toolbar-fn-expanded.png'),
        clip: { x: 0, y: 0, width: devices['Pixel 7'].viewport.width, height: 100 },
      });
      await ctx.close();
      console.log('  -> screenshot-android-toolbar-fn-expanded.png');
    }
  } finally {
    for (const sessionId of createdIds) await closeSession(sessionId);
    await browser.close();
  }

  console.log('\nScreenshots captured in docs/assets/');
}

main().catch((err) => { console.error(err); process.exit(1); });
