'use strict';

/* Central place for the ports this test run uses, so the Playwright config
 * (which spawns the server) and the specs (which build URLs) never drift.
 * Deliberately distinct from the app's own defaults (4000 / 47900 / 4200)
 * so a test run never collides with a real NomadTTY instance on the same
 * host. */
const SESSION_MANAGER_PORT = process.env.SESSION_MANAGER_PORT || '4171';
const TTYD_BASE_PORT = process.env.TTYD_BASE_PORT || '48910';
const BASE_URL = `http://127.0.0.1:${SESSION_MANAGER_PORT}`;

/* MCP_HOST is pinned to loopback for the test run regardless of the app's
 * own LAN-facing default (0.0.0.0) -- these tests only need to reach the
 * server from the same machine, and loopback avoids the boot-time refusal
 * server/mcp/auth.js applies to a non-loopback bind with no token. The
 * token itself is still a real fixed value so auth enforcement (not just
 * "auth disabled") is exercised end-to-end by the tests. */
const MCP_PORT = process.env.MCP_PORT || '4172';
const MCP_HOST = '127.0.0.1';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'test-suite-fixed-token-do-not-use-in-production';
const MCP_URL = `http://${MCP_HOST}:${MCP_PORT}/mcp`;
/* read_terminal_contents' follow mode runs for this long regardless of
 * activity (see server/mcp/tools.js) -- shortened for the test run so the
 * follow-mode spec doesn't take the app's 30s production default. */
const MCP_FOLLOW_MAX_SECONDS = process.env.MCP_FOLLOW_MAX_SECONDS || '3';

module.exports = {
  SESSION_MANAGER_PORT, TTYD_BASE_PORT, BASE_URL,
  MCP_PORT, MCP_HOST, MCP_AUTH_TOKEN, MCP_URL, MCP_FOLLOW_MAX_SECONDS,
};
