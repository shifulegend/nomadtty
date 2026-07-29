'use strict';

/*
 * Session persistence: leaving a terminal (without closing it) and
 * rejoining must reattach to the same tmux session with its scrollback
 * intact — the entire point of server/session-manager.js keeping ttyd
 * processes alive in the background. On reconnect, ttyd/tmux repaint the
 * current screen over the fresh WebSocket, so the same output-capture
 * strategy from ws-capture.js applies to the redraw stream too.
 */

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../helpers/env');
const {
  apiCloseAllSessions,
  createSessionViaUi,
  waitForTerminalReady,
  sessionRow,
} = require('../helpers/session-manager');
const { captureTerminalSocket } = require('../helpers/ws-capture');

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

test('leaving and rejoining a session preserves its scrollback', async ({ page }) => {
  const marker = `persist_${test.info().testId}`;

  const firstCapture = captureTerminalSocket(page);
  const id = await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await firstCapture.waitForSocket();

  await page.click('.xterm-screen');
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press('Enter');
  // Wait for the real stdout line (not just the PTY's echo of what was
  // typed — see helpers/ws-capture.js) so the command has genuinely run
  // before we navigate away and rejoin.
  await firstCapture.waitForOutputLine(marker);

  // Leave via the manager UI's "Join" flow in reverse: navigate back to
  // "/", which does not close the session (only the explicit Close button
  // does — see server/session-manager.js closeSession()).
  await page.goto(BASE_URL + '/');
  await expect(sessionRow(page, id)).toBeVisible();

  // Rejoin through the real "Join" button and capture the fresh socket's
  // redraw from scratch.
  const secondCapture = captureTerminalSocket(page);
  await sessionRow(page, id).locator('.sm-btn.join').click();
  await page.waitForURL(new RegExp(`/term/${id}/`));
  await waitForTerminalReady(page);
  await secondCapture.waitForSocket();

  await secondCapture.waitForOutput(marker);
});

test('joining updates the session\'s last-joined timestamp in the list', async ({ page, request }) => {
  // Creating a session through the UI immediately navigates to /term/<id>/,
  // which the server already counts as a join (server/session-manager.js
  // sets lastJoinedAt on any request under /term/<id>/, not only explicit
  // "Join" clicks) — so a UI-created session is never observably "never
  // joined". Create via the API instead to get a true pre-join session,
  // then exercise the real "Join" button for the state transition itself.
  const createRes = await request.post(`${BASE_URL}/api/sessions`, { data: { label: 'join-timestamp-test' } });
  const { id } = await createRes.json();

  await page.goto(BASE_URL + '/');
  const row = sessionRow(page, id);
  await expect(row.locator('.session-meta')).toContainText('never joined');

  await row.locator('.sm-btn.join').click();
  await page.waitForURL(new RegExp(`/term/${id}/`));
  await waitForTerminalReady(page);

  await page.goto(BASE_URL + '/');
  await expect(sessionRow(page, id).locator('.session-meta')).not.toContainText('never joined', { timeout: 8000 });
});
