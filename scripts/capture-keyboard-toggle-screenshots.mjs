/**
 * NomadTTY — screenshots for the 6 dedicated on-screen-keyboard-toggle-
 * during-active-generation test scenarios (tests/specs/android-mobile-stress.spec.js).
 *
 * Headless Chromium has no real on-screen virtual keyboard/IME to render,
 * so these screenshots simulate a keyboard opening the same way the actual
 * Playwright tests do it -- by shrinking `window.visualViewport.height`,
 * which is exactly what src/kb.js's own updateLayout() listens to (see
 * tests/helpers/stress.js) -- but keep the REAL browser viewport at full
 * device size (rather than resizing it, as the automated tests do), and
 * draw a clearly-labeled illustrative keyboard mockup in the space the
 * terminal correctly leaves empty, so the screenshot shows the whole
 * picture: toolbar, correctly-reflowed terminal, AND where a keyboard
 * would sit, in one frame.
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
const KEYBOARD_HEIGHT = Math.round(PIXEL_7.viewport.height * 0.4);

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

/** Injects a QWERTY-ish visual mockup of an on-screen keyboard, fixed to
 * the bottom of the viewport. Purely illustrative for documentation --
 * clearly labeled as such, not a real keyboard the app renders. */
async function drawKeyboardMockup(page, height) {
  await page.evaluate((h) => {
    const rows = ['q w e r t y u i o p', 'a s d f g h j k l', '⇧ z x c v b n m ⌫', '123 , SPACE . return'];
    const el = document.createElement('div');
    el.id = 'kbd-mockup';
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${h}px;` +
      'background:#1c1c1e;border-top:1px solid #3a3a3c;z-index:999999;' +
      'display:flex;flex-direction:column;justify-content:center;gap:6px;padding:8px 4px;';
    el.innerHTML =
      '<div style="text-align:center;color:#666;font:10px monospace;margin-bottom:2px;">' +
      '(illustrative on-screen keyboard mockup -- not rendered by the app)</div>' +
      rows.map((r) =>
        '<div style="display:flex;justify-content:center;gap:4px;">' +
        r.split(' ').map((k) =>
          `<div style="background:#3a3a3c;color:#ddd;border-radius:5px;padding:6px 8px;` +
          `font:12px monospace;min-width:${k.length > 2 ? 40 : 22}px;text-align:center;">${k}</div>`
        ).join('') +
        '</div>'
      ).join('');
    document.body.appendChild(el);
  }, height);
}

async function removeKeyboardMockup(page) {
  await page.evaluate(() => document.getElementById('kbd-mockup')?.remove());
}

/** Simulates the keyboard opening by shrinking window.visualViewport.height
 * (an own-property override, restorable via `delete`) and dispatching its
 * resize event -- exactly what a real keyboard does, and exactly what
 * src/kb.js's updateLayout() listens for. The real CDP viewport size is
 * left untouched, so the full device screen is what gets screenshotted. */
async function openKeyboard(page, fullHeight, keyboardHeight) {
  await page.evaluate(({ fullHeight, keyboardHeight }) => {
    Object.defineProperty(window.visualViewport, 'height', {
      get: () => fullHeight - keyboardHeight, configurable: true,
    });
    window.visualViewport.dispatchEvent(new Event('resize'));
  }, { fullHeight, keyboardHeight });
  await page.waitForTimeout(250);
  await drawKeyboardMockup(page, keyboardHeight);
}

async function closeKeyboard(page) {
  await removeKeyboardMockup(page);
  await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const createdIds = [];
  const fullHeight = PIXEL_7.viewport.height;

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
      for (let i = 0; i < 4; i++) {
        await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
        await closeKeyboard(page);
      }
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
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
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
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
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
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
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
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
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
      await page.evaluate(() => {
        const xterm = document.querySelector('.xterm');
        const rect = xterm.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const mkTouch = (x, y) => new Touch({ identifier: 1, target: xterm, clientX: x, clientY: y });
        xterm.dispatchEvent(new TouchEvent('touchstart', { touches: [mkTouch(cx, cy)], changedTouches: [mkTouch(cx, cy)], bubbles: true, cancelable: true }));
        for (let i = 1; i <= 10; i++) {
          const y = cy + i * 100;
          xterm.dispatchEvent(new TouchEvent('touchmove', { touches: [mkTouch(cx, y)], changedTouches: [mkTouch(cx, y)], bubbles: true, cancelable: true }));
        }
        xterm.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mkTouch(cx, cy + 1000)], bubbles: true, cancelable: true }));
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
      await openKeyboard(page, fullHeight, KEYBOARD_HEIGHT);
      await page.locator('#back-btn').tap();
      await page.waitForURL(/\/$/, { timeout: 10000 });
      await page.waitForSelector('.session-row', { state: 'visible' });
      // The Session Manager page is a fresh document load -- reapply the
      // keyboard mockup there too (it has no reflow logic of its own to
      // simulate, just the visual space a real keyboard would occupy).
      await drawKeyboardMockup(page, KEYBOARD_HEIGHT);
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
