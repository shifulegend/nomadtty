'use strict';

const fs = require('fs');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const {
  SESSION_MANAGER_PORT, TTYD_BASE_PORT, BASE_URL, MCP_PORT, MCP_HOST, MCP_AUTH_TOKEN, MCP_FOLLOW_MAX_SECONDS,
} = require('./helpers/env');

/* This sandbox pre-installs Chromium at a fixed path for a specific
 * Playwright build; `npm install` here can float @playwright/test to a
 * newer version that expects a different browser revision than what's on
 * disk. Point at the pre-installed binary when present so `npx playwright
 * test` doesn't need a network fetch; elsewhere (a normal dev machine or
 * CI without this path) fall back to Playwright's own resolution, which
 * expects `npx playwright install chromium` to have been run. */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

module.exports = defineConfig({
  testDir: './specs',
  globalTeardown: require.resolve('./global-teardown.js'),
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  /* The Session Manager keeps its session registry in a single in-memory
   * Map (server/session-manager.js) shared by every browser context that
   * talks to it. Running specs in parallel workers would make one test's
   * sessions show up in another's "session list" assertions, so this
   * suite trades parallel speed for a deterministic shared-state server. */
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
  ],
  webServer: {
    /* main.js (not session-manager.js directly) so the MCP listener boots
     * too -- server/session-manager.js itself stays independently runnable
     * unchanged (see its own require.main guard); this only changes which
     * entry point the test run uses. */
    command: `node ${path.join(__dirname, '..', 'server', 'main.js')}`,
    url: `${BASE_URL}/api/sessions`,
    reuseExistingServer: false,
    timeout: 15000,
    env: {
      SESSION_MANAGER_PORT,
      TTYD_BASE_PORT,
      MCP_PORT,
      MCP_HOST,
      MCP_AUTH_TOKEN,
      MCP_FOLLOW_MAX_SECONDS,
    },
  },
});
