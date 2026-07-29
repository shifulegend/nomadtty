'use strict';

const { expect } = require('@playwright/test');
const { BASE_URL } = require('./env');

/** GET /api/sessions — used for setup/teardown assertions, not as UI replacement. */
async function apiListSessions(request) {
  const res = await request.get(`${BASE_URL}/api/sessions`);
  const body = await res.json();
  return body.sessions;
}

/** DELETE every currently-registered session. Best-effort test isolation. */
async function apiCloseAllSessions(request) {
  const sessions = await apiListSessions(request);
  await Promise.all(sessions.map((s) => request.delete(`${BASE_URL}/api/sessions/${s.id}`)));
}

/**
 * Creates a session directly via the API, with no browser involved. MCP
 * tools act on the tmux session directly (server/mcp/tmux.js), so unlike
 * createSessionViaUi() above -- which exists specifically to exercise the
 * UI click path -- MCP tests should create sessions the same way a real
 * agent would: an API call with no browser tab ever opened.
 */
async function apiCreateSession(request, label) {
  const res = await request.post(`${BASE_URL}/api/sessions`, { data: { label } });
  const { id } = await res.json();
  return id;
}

/**
 * Drive session creation through the real UI (click, not a raw API POST),
 * since this suite is exercising user-facing behaviour. Returns the new
 * session's id (parsed from the resulting /term/<id>/ URL) and the row
 * locator back on the manager page for callers that navigate back to it.
 */
async function createSessionViaUi(page) {
  await page.goto(BASE_URL + '/');
  await expect(page.locator('#new-session-btn')).toBeVisible();
  await page.click('#new-session-btn');
  await page.waitForURL(/\/term\/[a-f0-9]+\//, { timeout: 10000 });
  const id = new URL(page.url()).pathname.match(/\/term\/([a-f0-9]+)\//)[1];
  return id;
}

/**
 * The terminal canvas mounts asynchronously (ttyd's JS bundle loads, opens
 * the WebSocket, then xterm.js attaches its canvas). Wait for the actual
 * rendering artifact rather than a fixed delay: the canvas element itself,
 * plus the WS hook (`window._S`, injected by the app's existing sub_filter
 * equivalent) reaching OPEN state.
 */
async function waitForTerminalReady(page) {
  await page.waitForSelector('.xterm-screen canvas', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window._S && window._S.readyState === 1, null, { timeout: 15000 });
}

/** Session-row locator on the manager page, scoped by session id. */
function sessionRow(page, id) {
  return page.locator('.session-row', { has: page.locator(`[data-id="${id}"]`) });
}

module.exports = {
  apiListSessions, apiCloseAllSessions, apiCreateSession, createSessionViaUi, waitForTerminalReady, sessionRow,
};
