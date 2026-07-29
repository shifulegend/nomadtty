'use strict';

/* Central place for the ports this test run uses, so the Playwright config
 * (which spawns the server) and the specs (which build URLs) never drift.
 * Deliberately distinct from the app's own defaults (4000 / 47900) so a
 * test run never collides with a real NomadTTY instance on the same host. */
const SESSION_MANAGER_PORT = process.env.SESSION_MANAGER_PORT || '4171';
const TTYD_BASE_PORT = process.env.TTYD_BASE_PORT || '48910';
const BASE_URL = `http://127.0.0.1:${SESSION_MANAGER_PORT}`;

module.exports = { SESSION_MANAGER_PORT, TTYD_BASE_PORT, BASE_URL };
