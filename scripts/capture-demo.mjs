/**
 * NomadTTY demo capture script
 * Produces screenshots and a video suitable for conversion to GIF.
 *
 * Usage:
 *   node scripts/capture-demo.mjs
 *
 * Prerequisites:
 *   - ttyd running on 127.0.0.1:47821
 *   - nginx proxying port 8080 with sub_filter injection
 *   - Playwright installed (npm install playwright)
 *
 * Output files go to docs/assets/
 */

import { chromium, devices } from 'playwright';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'docs', 'assets');
const BASE_URL = 'http://127.0.0.1:8080';
const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG_PATH = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

mkdirSync(ASSETS, { recursive: true });

/** Wait for the ttyd WebSocket to be connected and terminal rendered */
async function waitForTerminal(page, timeout = 15000) {
  // xterm.js renders a canvas; wait for it
  await page.waitForSelector('.xterm-screen', { timeout });
  // Wait for WebSocket to be open (window._S is the captured socket)
  await page.waitForFunction(
    () => typeof window._S !== 'undefined' && window._S.readyState === 1,
    { timeout }
  );
  // Extra settling time for first paint
  await page.waitForTimeout(800);
}

/** Send text to the PTY via the WebSocket hook */
async function sendToTTY(page, text) {
  await page.evaluate((t) => window._S.send('0' + t), text);
  await page.waitForTimeout(300);
}

/** Highlight a toolbar button visually for the demo */
async function flashButton(page, buttonText) {
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('#kb button')]
      .find(b => b.textContent.trim() === label);
    if (btn) btn.click();
  }, buttonText);
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // ── 1. Desktop screenshot ──────────────────────────────────────────────
    console.log('Capturing desktop screenshot...');
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);
      await sendToTTY(page, 'echo "NomadTTY — web terminal from anywhere"\r');
      await page.waitForTimeout(600);
      await sendToTTY(page, 'ls -lh /\r');
      await page.waitForTimeout(600);
      await page.screenshot({
        path: join(ASSETS, 'screenshot-desktop.png'),
        fullPage: false,
      });
      console.log('  -> screenshot-desktop.png');
      await ctx.close();
    }

    // ── 2. iPhone 14 screenshot ────────────────────────────────────────────
    console.log('Capturing iPhone 14 screenshot...');
    {
      const ctx = await browser.newContext({
        ...devices['iPhone 14'],
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);
      await sendToTTY(page, 'echo "Mobile terminal — NomadTTY"\r');
      await page.waitForTimeout(600);
      await page.screenshot({
        path: join(ASSETS, 'screenshot-iphone14.png'),
        fullPage: false,
      });
      console.log('  -> screenshot-iphone14.png');
      await ctx.close();
    }

    // ── 3. Pixel 7 screenshot ──────────────────────────────────────────────
    console.log('Capturing Pixel 7 screenshot...');
    {
      const ctx = await browser.newContext({
        ...devices['Pixel 7'],
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);
      await sendToTTY(page, 'echo "NomadTTY on Android"\r');
      await page.waitForTimeout(600);
      await page.screenshot({
        path: join(ASSETS, 'screenshot-pixel7.png'),
        fullPage: false,
      });
      console.log('  -> screenshot-pixel7.png');
      await ctx.close();
    }

    // ── 4. Toolbar close-up (iPhone 14) ───────────────────────────────────
    console.log('Capturing toolbar close-up...');
    {
      const ctx = await browser.newContext({
        ...devices['iPhone 14'],
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);
      // Activate CTRL modifier so it shows blue in the screenshot
      await flashButton(page, 'CTRL');
      const toolbar = await page.$('#kb');
      await toolbar.screenshot({
        path: join(ASSETS, 'screenshot-toolbar-ctrl.png'),
      });
      console.log('  -> screenshot-toolbar-ctrl.png');
      await ctx.close();
    }

    // ── 5. Demo video (iPhone 14) — sticky modifier + command ─────────────
    console.log('Recording demo video (iPhone 14)...');
    {
      const VIDEOS_DIR = join(ASSETS, '_videos');
      mkdirSync(VIDEOS_DIR, { recursive: true });

      const ctx = await browser.newContext({
        ...devices['iPhone 14'],
        recordVideo: {
          dir: VIDEOS_DIR,
          size: { width: 390, height: 844 },
        },
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);

      // Show a realistic workflow
      await sendToTTY(page, 'echo "  NomadTTY demo"\r');
      await page.waitForTimeout(500);
      await sendToTTY(page, 'uptime\r');
      await page.waitForTimeout(700);
      await sendToTTY(page, 'echo "Tap CTRL for sticky modifier:"\r');
      await page.waitForTimeout(500);

      // Activate CTRL (turns blue), then send Ctrl+C
      await flashButton(page, 'CTRL');
      await page.waitForTimeout(600);
      // Send Ctrl+C via keyboard after modifier is active
      await page.evaluate(() => {
        if (window._S) window._S.send('\x000' + String.fromCharCode(3));
      });
      await page.waitForTimeout(500);

      // Show F-key row
      await flashButton(page, 'Fn');
      await page.waitForTimeout(700);
      await flashButton(page, 'Fn'); // close it again
      await page.waitForTimeout(400);

      await sendToTTY(page, 'ls\r');
      await page.waitForTimeout(800);

      await ctx.close(); // closes page, flushes video
      console.log('  -> video saved to docs/assets/_videos/');
    }

    // ── 6. Convert video to GIF ────────────────────────────────────────────
    console.log('Converting video to GIF...');
    {
      const { readdirSync } = await import('fs');
      const videoFiles = readdirSync(join(ASSETS, '_videos'))
        .filter(f => f.endsWith('.webm'));
      if (videoFiles.length === 0) {
        console.log('  No video file found — skipping GIF conversion');
      } else {
        const videoPath = join(ASSETS, '_videos', videoFiles[0]);
        const palettePath = join(ASSETS, '_palette.png');
        const gifPath = join(ASSETS, 'demo-mobile.gif');

        // Generate colour palette (improves GIF quality)
        execFileSync(FFMPEG_PATH, [
          '-y', '-i', videoPath,
          '-vf', 'fps=10,scale=390:-1:flags=lanczos',
          '-vframes', '1', palettePath,
        ]);

        // Build GIF with palette
        execFileSync(FFMPEG_PATH, [
          '-y',
          '-i', videoPath,
          '-vf', 'fps=10,scale=390:-1:flags=lanczos',
          gifPath,
        ]);
        console.log(`  -> demo-mobile.gif (from ${videoFiles[0]})`);
      }
    }

    // ── 7. Desktop demo video ──────────────────────────────────────────────
    console.log('Recording desktop demo video...');
    {
      const VIDEOS_DIR2 = join(ASSETS, '_videos_desktop');
      mkdirSync(VIDEOS_DIR2, { recursive: true });

      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: {
          dir: VIDEOS_DIR2,
          size: { width: 1280, height: 720 },
        },
      });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await waitForTerminal(page);

      await sendToTTY(page, 'echo "NomadTTY — persistent web terminal"\r');
      await page.waitForTimeout(500);
      await sendToTTY(page, 'uname -a\r');
      await page.waitForTimeout(600);
      await sendToTTY(page, 'echo "Sessions survive disconnect via tmux"\r');
      await page.waitForTimeout(500);
      await sendToTTY(page, 'tmux ls\r');
      await page.waitForTimeout(700);

      await ctx.close();
      console.log('  -> desktop video saved');
    }

    // Convert desktop video to GIF
    {
      const { readdirSync } = await import('fs');
      const videoFiles = readdirSync(join(ASSETS, '_videos_desktop'))
        .filter(f => f.endsWith('.webm'));
      if (videoFiles.length > 0) {
        const videoPath = join(ASSETS, '_videos_desktop', videoFiles[0]);
        const gifPath = join(ASSETS, 'demo-desktop.gif');
        execFileSync(FFMPEG_PATH, [
          '-y', '-i', videoPath,
          '-vf', 'fps=10,scale=1280:-1:flags=lanczos',
          gifPath,
        ]);
        console.log('  -> demo-desktop.gif');
      }
    }

  } finally {
    await browser.close();
  }

  console.log('\nAll assets captured in docs/assets/');
}

main().catch(err => { console.error(err); process.exit(1); });
