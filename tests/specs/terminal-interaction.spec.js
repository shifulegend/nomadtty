'use strict';

/*
 * Interactive terminal behaviour: typing into the terminal and asserting
 * on the PTY's stdout. See helpers/ws-capture.js for why these assertions
 * read the ttyd WebSocket stream instead of the canvas DOM — xterm.js
 * renders via WebGL/canvas here, so there is no text node to query, and
 * ttyd's renderer mode is a server-side flag, not something a test-only
 * change can flip. waitForTerminalReady() still uses waitForSelector to
 * confirm the canvas has actually mounted before any interaction.
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
  // Requiring a *second* occurrence is what actually proves the shell ran
  // `echo` and produced real stdout, not just that the input was accepted.
  await capture.waitForOutputCount(marker, 2);
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
  // check while silently dropping keystrokes.
  await page.click('.xterm-screen');
  await page.keyboard.type('echo still_alive_after_resize');
  await page.keyboard.press('Enter');
  // Second occurrence = the real stdout line, not just the echoed keystrokes.
  await capture.waitForOutputCount('still_alive_after_resize', 2);
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
  // run this second `echo`, so its second (real stdout) occurrence would
  // never arrive and this wait would time out instead of passing.
  await page.keyboard.type('echo interrupted_ok');
  await page.keyboard.press('Enter');
  await capture.waitForOutputCount('interrupted_ok', 2);
});
