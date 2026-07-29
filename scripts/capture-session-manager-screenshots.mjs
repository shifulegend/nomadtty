/**
 * NomadTTY — Session Manager & Back button screenshot capture (mobile).
 *
 * Captures the two screenshots referenced in README.md's Session Manager
 * section: the Session Manager list UI, and the terminal view showing the
 * Back button, both in an iPhone 14 mobile viewport.
 *
 * Usage:
 *   SESSION_MANAGER_PORT=4000 node scripts/capture-session-manager-screenshots.mjs
 *
 * Prerequisites:
 *   - server/session-manager.js running (this script does not start it,
 *     matching scripts/capture-demo.mjs's convention of assuming a
 *     already-running target).
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

mkdirSync(ASSETS, { recursive: true });

async function waitForTerminalReady(page) {
  await page.waitForSelector('.xterm-screen canvas', { state: 'visible', timeout: 15000 });
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
    // Two sessions so the list screenshot shows real, populated state
    // rather than the empty-state placeholder.
    console.log('Creating sample sessions for the Session Manager screenshot...');
    createdIds.push(await createSession('claude — dotfiles repo'));
    createdIds.push(await createSession('build watcher'));

    console.log('Capturing Session Manager list (iPhone 14)...');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 14'] });
      const page = await ctx.newPage();
      await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.session-row', { state: 'visible' });
      // Let the (currently) "never joined" meta line settle rather than
      // capturing mid-render.
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(ASSETS, 'screenshot-session-manager-mobile.png') });
      await ctx.close();
      console.log('  -> screenshot-session-manager-mobile.png');
    }

    console.log('Capturing terminal view + Back button (iPhone 14)...');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 14'] });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/term/${createdIds[0]}/`, { waitUntil: 'domcontentloaded' });
      await waitForTerminalReady(page);
      // Type something so the screenshot shows a live, in-use terminal
      // rather than a bare prompt, with the Back button visible over it.
      await page.click('.xterm-screen');
      // Plain ASCII, no quotes/punctuation: page.keyboard.type() mis-sent an
      // em dash in an earlier attempt, which the shell then tried to parse
      // as a separate command ("command not found").
      await page.keyboard.type('echo nomadtty mcp overhaul demo');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#back-btn', { state: 'visible' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(ASSETS, 'screenshot-back-button-mobile.png') });
      await ctx.close();
      console.log('  -> screenshot-back-button-mobile.png');
    }
  } finally {
    for (const id of createdIds) await closeSession(id);
    await browser.close();
  }

  console.log('\nScreenshots captured in docs/assets/');
}

main().catch((err) => { console.error(err); process.exit(1); });
