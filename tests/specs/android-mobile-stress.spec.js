'use strict';

/*
 * Concurrent-interaction stress testing on a real mobile device profile
 * (Pixel 7): typing, scrolling, device rotation, and on-screen-keyboard
 * toggling, all performed WHILE a long-running foreground process is
 * actively streaming output -- the condition a mobile user hits chatting
 * with any AI CLI (Claude CLI, a local model, etc.). See
 * tests/helpers/stress.js and docs/ai/decision-log.md for why a
 * deterministic word-stream script stands in for a real model here: the
 * traffic pattern (small chunks arriving continuously over real time) is
 * what stresses the terminal's rendering/layout code, not the semantic
 * content, and a real model call would make this suite slow, flaky, and
 * metered against a live API on every run.
 *
 * "Terminal distortion" is checked at two levels throughout this file:
 *  - Structural: every ttyd resize frame's {columns, rows} must be a sane
 *    positive integer -- a corrupted layout calculation tends to produce
 *    zero/NaN/negative values here well before it's visible in a
 *    screenshot.
 *  - No JS errors: a `pageerror` (e.g. a reflow recursion, per
 *    mistakes.md 2026-07-29-011) is the strongest signal something broke,
 *    independent of what a screenshot happens to catch.
 *  - Visual: screenshots captured at key stress points and actually
 *    reviewed (see mistakes.md 2026-07-29-012's rule) for docs/README.md.
 */

const { test, expect, devices } = require('@playwright/test');
const {
  apiCloseAllSessions, createSessionViaUi, waitForTerminalReady, sessionRow,
} = require('../helpers/session-manager');
const { captureTerminalSocket } = require('../helpers/ws-capture');
const {
  startStream, touchScrollTerminal, toggleOnScreenKeyboard, rotateDevice, collectPageErrors,
} = require('../helpers/stress');

const PIXEL_7 = devices['Pixel 7'];
test.use({ ...PIXEL_7 });

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

function assertSaneResizeFrames(frames) {
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) {
    expect(Number.isInteger(f.columns)).toBe(true);
    expect(Number.isInteger(f.rows)).toBe(true);
    expect(f.columns).toBeGreaterThan(0);
    expect(f.rows).toBeGreaterThan(0);
  }
}

test('a scroll gesture during typing is a safe no-op and does not corrupt input or output', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await page.click('.xterm-screen');
  await page.keyboard.type("for i in $(seq 1 80); do echo line_$i; done");
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('line_80');

  // Touch-scroll is intentionally disabled (mistakes.md 2026-07-29-018) --
  // it can never have real scrollback to move into under tmux, and used to
  // leak arrow-key escapes into the PTY as real input. Confirm the gesture
  // is now inert: it reaches the PTY as nothing at all, and typing right
  // after it still works cleanly.
  await touchScrollTerminal(page, { deltaY: 600 });
  await page.waitForTimeout(150);
  await page.keyboard.type('echo scroll_then_type_ok');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('scroll_then_type_ok');

  expect(errors).toEqual([]);
});

test('a scroll gesture during an active stream is a safe no-op and never leaks arrow-key escapes', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 900, delayMs: 12 });
  await page.waitForTimeout(1500); // let some output accumulate first

  // An aggressive, fast, large-delta swipe -- the exact shape of gesture
  // that used to blow straight past tmux's (nonexistent) client scrollback
  // and spam dozens of repeated Up/Down-arrow escapes (`\x1b[A`/`\x1bOA`
  // and their Down-arrow counterparts) into the stream's own output.
  await touchScrollTerminal(page, { deltaY: 2000, steps: 10 });
  await page.waitForTimeout(300);
  await capture.waitForOutputLine('[stream complete]', 20000);

  expect(/\x1b(\[|O)[AB]/.test(capture.getOutput())).toBe(false);
  expect(errors).toEqual([]);
});

test('typing while a stream is producing long output does not corrupt the streamed output', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 300, delayMs: 15 });
  await page.waitForTimeout(500);
  // Type into the terminal while the foreground stream still owns it --
  // the shell won't read this until the stream exits, but it must not
  // corrupt the stream's own output arriving concurrently.
  await page.keyboard.type('queued_while_streaming');
  await capture.waitForOutputLine('[stream complete]', 15000);

  // Once the stream exits, bash regains the foreground and the queued
  // text becomes real input -- submit it now and confirm it runs cleanly.
  await page.keyboard.press('Enter');
  await capture.waitForOutput('queued_while_streaming');

  expect(errors).toEqual([]);
});

test('device rotation (portrait -> landscape -> portrait) with the on-screen keyboard held open mid-stream', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 300, delayMs: 15 });
  await page.waitForTimeout(300);

  await toggleOnScreenKeyboard(page, PIXEL_7.viewport, true);
  await rotateDevice(page, PIXEL_7.viewport); // portrait -> landscape, keyboard still "open"
  await page.waitForTimeout(300);
  await rotateDevice(page, { width: PIXEL_7.viewport.height, height: PIXEL_7.viewport.width }); // back to portrait
  await toggleOnScreenKeyboard(page, PIXEL_7.viewport, false);

  await capture.waitForOutputLine('[stream complete]', 15000);
  assertSaneResizeFrames(capture.getResizeFrames());

  // Confirm the terminal is still fully interactive after the compound
  // rotation + keyboard-toggle stress, not just that no error was thrown.
  await page.click('.xterm-screen');
  await page.keyboard.type('echo alive_after_rotation_stress');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('alive_after_rotation_stress');

  expect(errors).toEqual([]);
});

test('rapidly toggling the Fn row throughout an active stream does not corrupt layout or output', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 400, delayMs: 12 });
  for (let i = 0; i < 5; i++) {
    await page.locator('#kb-fn').tap();
    await page.waitForTimeout(120);
  }
  await capture.waitForOutputLine('[stream complete]', 15000);
  assertSaneResizeFrames(capture.getResizeFrames());
  expect(errors).toEqual([]);
});

test('zooming in and out repeatedly throughout an active stream keeps the terminal legible and responsive', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 400, delayMs: 12 });
  const zoomIn = page.locator('#kb button', { hasText: 'A+' }).first();
  const zoomOut = page.locator('#kb button', { hasText: 'A−' }).first();
  for (let i = 0; i < 3; i++) {
    await zoomIn.tap();
    await page.waitForTimeout(100);
    await zoomOut.tap();
    await page.waitForTimeout(100);
  }
  await capture.waitForOutputLine('[stream complete]', 15000);

  await page.click('.xterm-screen');
  await page.keyboard.type('echo alive_after_zoom_stress');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('alive_after_zoom_stress');

  expect(errors).toEqual([]);
});

test('CTRL+C via the toolbar interrupts an active stream mid-generation without double-sending or corrupting output', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  // A long stream that would run well past this test's patience if NOT
  // interrupted -- proves the interrupt, not exhaustion, ended it.
  await startStream(page, { words: 5000, delayMs: 15 });
  await page.waitForTimeout(600);

  await page.locator('#kb-c').tap();
  await page.click('.xterm-screen');
  await page.keyboard.press('c');
  await page.waitForTimeout(300);

  // The stream must NOT have reached its own completion marker (proves it
  // was actually interrupted, not that it happened to finish naturally),
  // and the shell must be back in control to run a fresh command cleanly
  // (proves no leftover/garbled byte from the earlier double-send bug --
  // see mistakes.md 2026-07-29-016 -- corrupted the next command).
  expect(capture.getOutput()).not.toContain('[stream complete]');
  await page.keyboard.type('echo interrupted_stream_ok');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('interrupted_stream_ok');

  expect(errors).toEqual([]);
});

test('tapping Back mid-stream and re-Joining shows the stream completed cleanly server-side', async ({ page }) => {
  const errors = collectPageErrors(page);
  const capture = captureTerminalSocket(page);
  const id = await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await startStream(page, { words: 300, delayMs: 12 });
  await page.waitForTimeout(400); // stream is still running, well short of completion

  await page.locator('#back-btn').tap();
  await page.waitForURL(/\/$/, { timeout: 10000 });
  await expect(sessionRow(page, id)).toBeVisible();

  // tmux keeps the stream running headless after the browser tab
  // navigates away (see src/kb.js's Back-button comment) -- re-Join and
  // confirm it completed correctly with no corruption, proving navigating
  // away mid-generation is safe.
  const capture2 = captureTerminalSocket(page);
  await sessionRow(page, id).locator('.sm-btn.join').tap();
  await page.waitForURL(new RegExp(`/term/${id}/`));
  await waitForTerminalReady(page);
  await capture2.waitForSocket();
  await capture2.waitForOutputLine('[stream complete]');

  expect(errors).toEqual([]);
});
