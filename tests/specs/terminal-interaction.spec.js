'use strict';

/*
 * Interactive terminal behaviour: typing into the terminal and asserting
 * on the PTY's stdout. See helpers/ws-capture.js for why these assertions
 * read the ttyd WebSocket stream instead of querying rendered DOM/canvas
 * output directly — that stays correct regardless of which xterm.js
 * renderer is active (webgl/canvas/dom, a server-side flag, not something
 * a test-only change can flip). waitForTerminalReady() still uses
 * waitForSelector to confirm `.xterm-screen` has actually mounted before
 * any interaction.
 */

const { test, expect } = require('@playwright/test');
const { apiCloseAllSessions, createSessionViaUi, waitForTerminalReady } = require('../helpers/session-manager');
const { captureTerminalSocket } = require('../helpers/ws-capture');

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

test('typing "echo" into the terminal produces the expected stdout', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  const marker = `nomadtty_echo_${test.info().testId}`;
  await page.click('.xterm-screen');
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press('Enter');

  // The PTY runs in canonical mode, so it echoes typed keystrokes back
  // over the wire as they're typed — "marker\r\n" is already present the
  // instant Enter itself is echoed, before bash has executed anything.
  // waitForOutputLine specifically matches the marker appearing alone on
  // its own line (the real stdout), not "echo <marker>" as typed input.
  await capture.waitForOutputLine(marker);
});

test('a computed shell command returns the correct result on stdout', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await page.click('.xterm-screen');
  await page.keyboard.type('echo $((6*7))');
  await page.keyboard.press('Enter');

  await capture.waitForOutput('\r\n42\r\n');
});

test('terminal input keeps working after the browser viewport is resized', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  const initialResize = await capture.waitForResize(1);
  expect(initialResize.columns).toBeGreaterThan(0);
  expect(initialResize.rows).toBeGreaterThan(0);

  await page.setViewportSize({ width: 500, height: 400 });
  const resized = await capture.waitForResize(2);
  expect(resized).not.toEqual(initialResize);

  // Confirm the PTY is still writable post-resize, not just that a resize
  // frame was sent — a stale-but-reachable connection would pass the frame
  // check while silently dropping keystrokes. Note: a resize can itself
  // trigger a terminal redraw that interleaves escape sequences into the
  // middle of the *echoed input* text right as it's being typed, splitting
  // it into two writes — waitForOutputLine still matches correctly because
  // it targets the real (unsplit) stdout write, not raw substring counting.
  await page.click('.xterm-screen');
  await page.keyboard.type('echo still_alive_after_resize');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('still_alive_after_resize');
});

test('control characters (Ctrl+C) reach the PTY and interrupt a running command', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await page.click('.xterm-screen');
  await page.keyboard.type('sleep 30');
  await page.keyboard.press('Enter');
  // Give the shell a moment to actually start the foreground job before
  // interrupting it — confirmed by waiting for the command's own echo,
  // not a fixed delay.
  await capture.waitForOutput('sleep 30\r\n');

  await page.keyboard.press('Control+c');
  // The kernel TTY line discipline echoes keystrokes regardless of whether
  // the blocked `sleep` ever reads them, so the mere presence of
  // "interrupted_ok" from typing is not proof of anything. If Ctrl+C
  // failed to interrupt, bash never regains the foreground to actually
  // run this second `echo`, so its real stdout line would never arrive
  // and this wait would time out instead of passing.
  await page.keyboard.type('echo interrupted_ok');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('interrupted_ok');
});
