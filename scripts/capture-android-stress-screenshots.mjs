/**
 * NomadTTY — Android mobile stress-test documentation screenshots.
 *
 * Captures the screenshots referenced in README.md's stress-testing
 * subsection, all on Playwright's devices['Pixel 7'] profile, showing the
 * terminal mid-stream (see scripts/simulate-model-stream.mjs) under
 * various concurrent-interaction conditions: scrolling into history,
 * device rotation with the on-screen keyboard "open", the Fn row expanded,
 * and zoom -- each while output is actively still arriving.
 *
 * Usage:
 *   SESSION_MANAGER_PORT=4000 node scripts/capture-android-stress-screenshots.mjs
 *
 * Prerequisites: server/session-manager.js (or server/main.js) already
 * running -- this script does not start it.
 *
 * Output files go to docs/assets/.
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
const STREAM_SCRIPT = join(__dirname, 'simulate-model-stream.mjs');
const PIXEL_7 = devices['Pixel 7'];

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

async function startStream(page, { words = 900, delayMs = 12 } = {}) {
  await page.click('.xterm-screen');
  await page.keyboard.type(`node ${STREAM_SCRIPT} ${words} ${delayMs}`);
  await page.keyboard.press('Enter');
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const createdIds = [];

  try {
    console.log('Capturing: scrolled into history while stream is still appending...');
    {
      const id = await createSession('stress-scroll-while-streaming');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 900, delayMs: 12 });
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const xterm = document.querySelector('.xterm');
        const rect = xterm.getBoundingClientRect();
        const mkTouch = (x, y) => new Touch({ identifier: 1, target: xterm, clientX: x, clientY: y });
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        xterm.dispatchEvent(new TouchEvent('touchstart', { touches: [mkTouch(cx, cy)], changedTouches: [mkTouch(cx, cy)], bubbles: true, cancelable: true }));
        xterm.dispatchEvent(new TouchEvent('touchmove', { touches: [mkTouch(cx, cy + 400)], changedTouches: [mkTouch(cx, cy + 400)], bubbles: true, cancelable: true }));
        xterm.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mkTouch(cx, cy + 400)], bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-stress-scroll-while-streaming.png') });
      await ctx.close();
      console.log('  -> screenshot-android-stress-scroll-while-streaming.png');
    }

    console.log('Capturing: landscape rotation with keyboard "open" mid-stream...');
    {
      const id = await createSession('stress-rotation-landscape');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 300, delayMs: 15 });
      await page.waitForTimeout(300);
      // Simulate keyboard open (shrink height) then rotate to landscape.
      await page.setViewportSize({ width: PIXEL_7.viewport.width, height: Math.round(PIXEL_7.viewport.height * 0.58) });
      await page.waitForTimeout(250);
      await page.setViewportSize({ width: PIXEL_7.viewport.height, height: Math.round(PIXEL_7.viewport.width * 0.58) });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-stress-rotation-landscape.png') });
      await ctx.close();
      console.log('  -> screenshot-android-stress-rotation-landscape.png');
    }

    console.log('Capturing: Fn row expanded mid-stream...');
    {
      const id = await createSession('stress-fn-mid-stream');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 400, delayMs: 12 });
      await page.waitForTimeout(400);
      await page.locator('#kb-fn').tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-stress-fn-toggle-mid-stream.png') });
      await ctx.close();
      console.log('  -> screenshot-android-stress-fn-toggle-mid-stream.png');
    }

    console.log('Capturing: zoomed in mid-stream...');
    {
      const id = await createSession('stress-zoom-mid-stream');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 400, delayMs: 12 });
      await page.waitForTimeout(300);
      const zoomIn = page.locator('#kb button', { hasText: 'A+' }).first();
      await zoomIn.tap();
      await zoomIn.tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-stress-zoom-mid-stream.png') });
      await ctx.close();
      console.log('  -> screenshot-android-stress-zoom-mid-stream.png');
    }

    console.log('Capturing: on-screen-keyboard-open reflow (portrait)...');
    {
      const id = await createSession('stress-keyboard-reflow');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await page.click('.xterm-screen');
      await page.keyboard.type('echo before_keyboard_open');
      await page.keyboard.press('Enter');
      await page.setViewportSize({ width: PIXEL_7.viewport.width, height: Math.round(PIXEL_7.viewport.height * 0.58) });
      await page.waitForTimeout(300);
      await page.keyboard.type('echo typed_with_keyboard_open');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-android-stress-keyboard-open-reflow.png') });
      await ctx.close();
      console.log('  -> screenshot-android-stress-keyboard-open-reflow.png');
    }
  } finally {
    for (const id of createdIds) await closeSession(id);
    await browser.close();
  }

  console.log('\nScreenshots captured in docs/assets/');
}

main().catch((err) => { console.error(err); process.exit(1); });
