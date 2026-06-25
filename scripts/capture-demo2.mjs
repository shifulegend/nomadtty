/**
 * Stage 2: desktop GIF + improved mobile screenshots with cleaner content
 */
import { chromium, devices } from 'playwright';
import { execFileSync } from 'child_process';
import { mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'docs', 'assets');
const BASE_URL = 'http://127.0.0.1:8080';
const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function waitForTerminal(page, timeout = 15000) {
  await page.waitForSelector('.xterm-screen', { timeout });
  await page.waitForFunction(
    () => typeof window._S !== 'undefined' && window._S.readyState === 1,
    { timeout }
  );
  // Let fitAddon resize the terminal
  await page.waitForTimeout(1200);
}

async function send(page, text) {
  await page.evaluate((t) => window._S.send('0' + t), text);
  await page.waitForTimeout(350);
}

async function clickBtn(page, label) {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('#kb button')].find(b => b.textContent.trim() === l);
    if (btn) { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  }, label);
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  // ── Desktop: improved screenshot with colourful output ──────────────────
  console.log('Desktop screenshot (improved)...');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);
    await send(page, 'printf "\\e[1;32mNomadTTY\\e[0m — web terminal from anywhere\\r\\n"\r');
    await send(page, 'printf "Sessions survive disconnect via tmux\\r\\n"\r');
    await send(page, 'uname -srm\r');
    await send(page, 'uptime\r');
    await send(page, 'ls --color=always /usr/bin/tmux /usr/sbin/nginx /usr/bin/ttyd\r');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ASSETS, 'screenshot-desktop.png') });
    console.log('  ✓ screenshot-desktop.png');
    await ctx.close();
  }

  // ── iPhone 14: cleaner content ───────────────────────────────────────────
  console.log('iPhone 14 screenshot (improved)...');
  {
    const ctx = await browser.newContext({ ...devices['iPhone 14'] });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);
    await send(page, 'printf "\\e[1;36mNomadTTY\\e[0m\\r\\n"\r');
    await send(page, 'echo "Mobile-first web terminal"\r');
    await send(page, 'uptime\r');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ASSETS, 'screenshot-iphone14.png') });
    console.log('  ✓ screenshot-iphone14.png');
    await ctx.close();
  }

  // ── Pixel 7: cleaner content ────────────────────────────────────────────
  console.log('Pixel 7 screenshot (improved)...');
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);
    await send(page, 'printf "\\e[1;33mNomadTTY on Android\\e[0m\\r\\n"\r');
    await send(page, 'echo "Persistent shell via tmux"\r');
    await send(page, 'tmux ls\r');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ASSETS, 'screenshot-pixel7.png') });
    console.log('  ✓ screenshot-pixel7.png');
    await ctx.close();
  }

  // ── Toolbar CTRL+Fn (both active) ────────────────────────────────────────
  console.log('Toolbar screenshot (CTRL active + Fn open)...');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 200 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);
    await clickBtn(page, 'CTRL');   // CTRL turns blue
    await clickBtn(page, 'Fn');     // Fn opens F1-F12 row
    const toolbar = await page.$('#kb');
    await toolbar.screenshot({ path: join(ASSETS, 'screenshot-toolbar-fn.png') });
    console.log('  ✓ screenshot-toolbar-fn.png');
    await ctx.close();
  }

  // ── Desktop: demo video ──────────────────────────────────────────────────
  console.log('Recording desktop demo video...');
  const DESKDIR = join(ASSETS, '_videos_desktop');
  mkdirSync(DESKDIR, { recursive: true });
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: DESKDIR, size: { width: 1280, height: 720 } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);

    // Show the toolbar and basic usage
    await send(page, 'printf "\\e[1;32m=== NomadTTY demo ===\\e[0m\\r\\n"\r');
    await page.waitForTimeout(400);
    await send(page, 'uname -a\r');
    await page.waitForTimeout(500);
    await send(page, 'tmux ls\r');
    await page.waitForTimeout(500);
    await send(page, 'echo "Tap CTRL → type a letter → sends control byte"\r');
    await page.waitForTimeout(400);

    // Show sticky modifier activating
    await clickBtn(page, 'CTRL');
    await page.waitForTimeout(800);
    // Send Ctrl+L (clear screen) while CTRL is active
    await page.evaluate(() => window._S.send('0' + String.fromCharCode(12)));
    await page.waitForTimeout(600);

    await send(page, 'ls --color=always\r');
    await page.waitForTimeout(700);
    await send(page, 'echo "Session persists — close tab and reopen!"\r');
    await page.waitForTimeout(800);

    // Show Fn row
    await clickBtn(page, 'Fn');
    await page.waitForTimeout(700);

    await ctx.close();
    console.log('  ✓ desktop video saved');
  }

  // Convert desktop video to GIF
  const deskVideos = readdirSync(DESKDIR).filter(f => f.endsWith('.webm'));
  if (deskVideos.length > 0) {
    const vpath = join(DESKDIR, deskVideos[0]);
    const palette = join(ASSETS, '_palette_desk.png');
    const gif = join(ASSETS, 'demo-desktop.gif');

    execFileSync('ffmpeg', [
      '-y', '-i', vpath,
      '-vf', 'fps=10,scale=1280:-1:flags=lanczos,palettegen',
      palette,
    ]);
    execFileSync('ffmpeg', [
      '-y', '-i', vpath, '-i', palette,
      '-filter_complex', 'fps=10,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse',
      '-loop', '0', gif,
    ]);
    console.log('  ✓ demo-desktop.gif');
  }

  // ── Mobile: re-record with better content ────────────────────────────────
  console.log('Re-recording mobile demo video...');
  const MOBDIR = join(ASSETS, '_videos_mobile2');
  mkdirSync(MOBDIR, { recursive: true });
  {
    const ctx = await browser.newContext({
      ...devices['iPhone 14'],
      recordVideo: { dir: MOBDIR, size: { width: 390, height: 844 } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForTerminal(page);

    await send(page, 'printf "\\e[1;32mNomadTTY\\e[0m\\r\\n"\r');
    await page.waitForTimeout(400);
    await send(page, 'echo "Mobile web terminal"\r');
    await page.waitForTimeout(400);
    await send(page, 'uptime\r');
    await page.waitForTimeout(500);
    await send(page, 'echo "Tap CTRL for sticky modifier:"\r');
    await page.waitForTimeout(400);

    // Show CTRL modifier
    await clickBtn(page, 'CTRL');
    await page.waitForTimeout(700);
    // Send Ctrl+L (clear)
    await page.evaluate(() => window._S.send('0' + String.fromCharCode(12)));
    await page.waitForTimeout(500);

    await send(page, 'echo "Screen cleared with Ctrl+L"\r');
    await page.waitForTimeout(500);

    // Open Fn row
    await clickBtn(page, 'Fn');
    await page.waitForTimeout(700);
    await clickBtn(page, 'Fn');
    await page.waitForTimeout(400);

    await send(page, 'tmux ls\r');
    await page.waitForTimeout(600);

    await ctx.close();
    console.log('  ✓ mobile video saved');
  }

  // Convert improved mobile video to GIF
  const mobVideos = readdirSync(MOBDIR).filter(f => f.endsWith('.webm'));
  if (mobVideos.length > 0) {
    const vpath = join(MOBDIR, mobVideos[0]);
    const palette = join(ASSETS, '_palette_mob2.png');
    const gif = join(ASSETS, 'demo-mobile.gif');

    execFileSync('ffmpeg', [
      '-y', '-i', vpath,
      '-vf', 'fps=10,scale=390:-1:flags=lanczos,palettegen',
      palette,
    ]);
    execFileSync('ffmpeg', [
      '-y', '-i', vpath, '-i', palette,
      '-filter_complex', 'fps=10,scale=390:-1:flags=lanczos[x];[x][1:v]paletteuse',
      '-loop', '0', gif,
    ]);
    console.log('  ✓ demo-mobile.gif (replaced)');
  }

} finally {
  await browser.close();
}

console.log('\nAll assets in docs/assets/');
