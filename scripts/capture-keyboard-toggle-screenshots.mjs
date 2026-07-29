/**
 * NomadTTY — screenshots for the 6 dedicated on-screen-keyboard-toggle-
 * during-active-generation test scenarios (tests/specs/android-mobile-stress.spec.js).
 *
 * Usage:
 *   SESSION_MANAGER_PORT=4000 node scripts/capture-keyboard-toggle-screenshots.mjs
 *
 * Prerequisites: server/session-manager.js (or server/main.js) already running.
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
const KEYBOARD_HEIGHT = Math.round(PIXEL_7.viewport.height * 0.58);

mkdirSync(ASSETS, { recursive: true });

async function waitForTerminalReady(page) {
  await page.waitForSelector('.xterm-screen', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window._S && window._S.readyState === 1, null, { timeout: 15000 });
}

async function createSession(label) {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
  });
  return (await res.json()).id;
}

async function closeSession(id) {
  await fetch(`${BASE_URL}/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
}

async function startStream(page, { words = 400, delayMs = 12 } = {}) {
  await page.click('.xterm-screen');
  await page.keyboard.type(`node ${STREAM_SCRIPT} ${words} ${delayMs}`);
  await page.keyboard.press('Enter');
}

async function openKeyboard(page) {
  await page.setViewportSize({ width: PIXEL_7.viewport.width, height: KEYBOARD_HEIGHT });
  await page.waitForTimeout(250);
}

async function closeKeyboard(page) {
  await page.setViewportSize({ width: PIXEL_7.viewport.width, height: PIXEL_7.viewport.height });
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const createdIds = [];

  try {
    console.log('1/6: rapid repeated open/close cycles...');
    {
      const id = await createSession('kbd-1-rapid-cycles');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 500, delayMs: 12 });
      for (let i = 0; i < 4; i++) { await openKeyboard(page); await closeKeyboard(page); }
      await openKeyboard(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-1-rapid-cycles.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-1-rapid-cycles.png');
    }

    console.log('2/6: typing lands correctly as the keyboard opens mid-stream...');
    {
      const id = await createSession('kbd-2-typing-mid-transition');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 300, delayMs: 15 });
      await page.waitForTimeout(300);
      await openKeyboard(page);
      await page.click('.xterm-screen');
      await page.keyboard.type('echo typed_during_keyboard_open_transition');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-2-typing-mid-transition.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-2-typing-mid-transition.png');
    }

    console.log('3/6: keyboard open + Fn row expanded simultaneously...');
    {
      const id = await createSession('kbd-3-keyboard-plus-fn');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 400, delayMs: 12 });
      await page.waitForTimeout(300);
      await page.locator('#kb-fn').tap();
      await openKeyboard(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-3-keyboard-plus-fn.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-3-keyboard-plus-fn.png');
    }

    console.log('4/6: keyboard open + zoomed in simultaneously...');
    {
      const id = await createSession('kbd-4-keyboard-plus-zoom');
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
      await openKeyboard(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-4-keyboard-plus-zoom.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-4-keyboard-plus-zoom.png');
    }

    console.log('5/6: keyboard open + an aggressive scroll gesture...');
    {
      const id = await createSession('kbd-5-keyboard-plus-scroll');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 500, delayMs: 12 });
      await page.waitForTimeout(300);
      await openKeyboard(page);
      await page.evaluate(() => {
        const xterm = document.querySelector('.xterm');
        const rect = xterm.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const mkTouch = (x, y) => new Touch({ identifier: 1, target: xterm, clientX: x, clientY: y });
        xterm.dispatchEvent(new TouchEvent('touchstart', { touches: [mkTouch(cx, cy)], changedTouches: [mkTouch(cx, cy)], bubbles: true, cancelable: true }));
        for (let i = 1; i <= 10; i++) {
          const y = cy + i * 150;
          xterm.dispatchEvent(new TouchEvent('touchmove', { touches: [mkTouch(cx, y)], changedTouches: [mkTouch(cx, y)], bubbles: true, cancelable: true }));
        }
        xterm.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mkTouch(cx, cy + 1500)], bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-5-keyboard-plus-scroll.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-5-keyboard-plus-scroll.png');
    }

    console.log('6/6: tapping Back while the keyboard is open, then re-Joining...');
    {
      const id = await createSession('kbd-6-back-during-keyboard-open');
      createdIds.push(id);
      const ctx = await browser.newContext({ ...PIXEL_7 });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${id}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      await startStream(page, { words: 300, delayMs: 12 });
      await page.waitForTimeout(300);
      await openKeyboard(page);
      await page.locator('#back-btn').tap();
      await page.waitForURL(/\/$/, { timeout: 10000 });
      await page.waitForSelector('.session-row', { state: 'visible' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-keyboard-toggle-6-back-during-keyboard-open.png') });
      await ctx.close();
      console.log('  -> screenshot-keyboard-toggle-6-back-during-keyboard-open.png');
    }
  } finally {
    for (const id of createdIds) await closeSession(id);
    await browser.close();
  }

  console.log('\nScreenshots captured in docs/assets/');
}

main().catch((err) => { console.error(err); process.exit(1); });
