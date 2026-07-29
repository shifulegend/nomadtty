'use strict';

/*
 * Non-interactive Session Manager states: the list populating, a closed
 * session disappearing, the empty state, and multiple sessions coexisting.
 * None of these touch the terminal canvas — they only need the manager
 * page's DOM, so plain waitForSelector/expect assertions are sufficient
 * and there is no canvas-rendering timing concern here.
 */

const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('../helpers/env');
const { apiCloseAllSessions, sessionRow } = require('../helpers/session-manager');

test.beforeEach(async ({ request }) => {
  // Each test asserts on the full list state, so start from a known-empty registry.
  await apiCloseAllSessions(request);
});

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

test('shows the empty state when no sessions are open', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#empty-state')).toHaveText(/no open sessions/i);
  await expect(page.locator('.session-row')).toHaveCount(0);
});

test('creating a session populates the list with its label and status', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await page.click('#new-session-btn');

  // Creating a session navigates the page to /term/<id>/; go back to the
  // manager to observe the list rather than asserting mid-navigation.
  await page.waitForURL(/\/term\/[a-f0-9]+\//);
  const id = new URL(page.url()).pathname.match(/\/term\/([a-f0-9]+)\//)[1];
  await page.goto(BASE_URL + '/');

  const row = sessionRow(page, id);
  await expect(row).toBeVisible();
  await expect(row.locator('.session-label')).toHaveText(/Session [0-9a-f]{4}/);
  await expect(row.locator('.session-meta')).toContainText('running');
  await expect(page.locator('#empty-state')).toBeHidden();
});

test('closing a session removes it from the list', async ({ page, request }) => {
  await page.goto(BASE_URL + '/');
  await page.click('#new-session-btn');
  await page.waitForURL(/\/term\/[a-f0-9]+\//);
  const id = new URL(page.url()).pathname.match(/\/term\/([a-f0-9]+)\//)[1];
  await page.goto(BASE_URL + '/');

  const row = sessionRow(page, id);
  await expect(row).toBeVisible();

  await row.locator('.sm-btn.close').click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();

  // Cross-check against the source of truth: the backend registry, not
  // just the client-rendered list, no longer knows about this session.
  const res = await request.get(`${BASE_URL}/api/sessions`);
  const { sessions } = await res.json();
  expect(sessions.find((s) => s.id === id)).toBeUndefined();
});

test('multiple sessions coexist independently in the list', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await page.click('#new-session-btn');
  await page.waitForURL(/\/term\/[a-f0-9]+\//);
  const idA = new URL(page.url()).pathname.match(/\/term\/([a-f0-9]+)\//)[1];

  await page.goto(BASE_URL + '/');
  await page.click('#new-session-btn');
  await page.waitForURL(/\/term\/[a-f0-9]+\//);
  const idB = new URL(page.url()).pathname.match(/\/term\/([a-f0-9]+)\//)[1];

  await page.goto(BASE_URL + '/');
  await expect(sessionRow(page, idA)).toBeVisible();
  await expect(sessionRow(page, idB)).toBeVisible();
  await expect(page.locator('.session-row')).toHaveCount(2);

  // Closing one must not disturb the other.
  await sessionRow(page, idA).locator('.sm-btn.close').click();
  await expect(sessionRow(page, idA)).toHaveCount(0);
  await expect(sessionRow(page, idB)).toBeVisible();
});

test('the list refreshes on its own polling interval without a manual reload', async ({ page, request }) => {
  await page.goto(BASE_URL + '/');
  await expect(page.locator('.session-row')).toHaveCount(0);

  // Create the session out-of-band (API), simulating another tab/device
  // opening one, and confirm this page's own 5s poll (public/session-manager.js)
  // picks it up without a page reload.
  const createRes = await request.post(`${BASE_URL}/api/sessions`, { data: { label: 'poll-test' } });
  const { id } = await createRes.json();

  await expect(sessionRow(page, id)).toBeVisible({ timeout: 8000 });
  await expect(sessionRow(page, id).locator('.session-label')).toHaveText('poll-test');
});
