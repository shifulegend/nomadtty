'use strict';

const { BASE_URL } = require('./helpers/env');

/*
 * Runs once after all tests, while the webServer (spawned by
 * playwright.config.js) is still alive. Closing sessions through the real
 * DELETE endpoint gives each one time to run its full graceful shutdown
 * (tmux kill-session, then SIGTERM/SIGKILL the ttyd process) before the
 * webServer itself is torn down — cheaper insurance against leaked ttyd/
 * tmux processes than relying on the server's own SIGTERM handler, which
 * exits immediately without waiting for children.
 */
module.exports = async function globalTeardown() {
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`);
    const { sessions } = await res.json();
    await Promise.all(sessions.map((s) =>
      fetch(`${BASE_URL}/api/sessions/${s.id}`, { method: 'DELETE' })
    ));
  } catch (_e) {
    /* Server may already be gone; nothing left to clean up. */
  }
};
