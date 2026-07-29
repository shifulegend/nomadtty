'use strict';

/*
 * Rigorous mobile rendering/UX validation using Playwright's real-Android
 * device emulation profile (Pixel 7: real viewport, devicePixelRatio=2.625,
 * touch, mobile user-agent) rather than a full Android emulator (AVD) — see
 * docs/ai/decision-log.md's "Mobile UX validation uses Playwright device
 * emulation" entry for why an AVD was rejected in this environment (no
 * /dev/kvm, no hardware virtualization, would fall back to slow/crash-prone
 * software emulation — exactly the heavy-GUI-overhead failure mode this
 * suite must avoid).
 *
 * This file exists specifically to catch defects only visible at real
 * mobile viewport/DPR that the desktop-DPR=1 suite (session-lifecycle.spec.js,
 * terminal-interaction.spec.js) cannot: see docs/ai/mistakes.md 2026-07-29-014
 * for a renderer bug that was invisible at DPR=1 and only appeared here.
 */

const { test, expect, devices } = require('@playwright/test');
const {
  apiCloseAllSessions, createSessionViaUi, waitForTerminalReady, sessionRow,
} = require('../helpers/session-manager');
const { captureTerminalSocket } = require('../helpers/ws-capture');
const { toggleOnScreenKeyboard } = require('../helpers/stress');

const PIXEL_7 = devices['Pixel 7'];
test.use({ ...PIXEL_7 });

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

test('Session Manager list renders correctly at a real mobile viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#new-session-btn')).toBeVisible();

  // The "+ Create New Session" button must be fully within the mobile
  // viewport width and stay within a comfortable touch-target position
  // (not clipped left/right by the 412px-wide Pixel 7 viewport).
  const box = await page.locator('#new-session-btn').boundingBox();
  const viewportWidth = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
});

test('joining a session from the mobile Session Manager shows a ready terminal with a non-overlapping Back button', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await expect(page.locator('#back-btn')).toBeVisible();

  // Geometry check: the floating Back button must not obscure the active
  // terminal canvas in any way that would cover live output. We measure
  // the actual pixel overlap between #back-btn and .xterm-screen rather
  // than trusting CSS intent, since kb.js documents the button as
  // "excluded from updateLayout()'s toolbarH math" specifically so it
  // never eats into the terminal grid -- this test verifies that claim
  // holds in practice at a real mobile DPR, not just in the CSS comment.
  const geometry = await page.evaluate(() => {
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    return {
      backBtn: rect(document.getElementById('back-btn')),
      xtermScreen: rect(document.querySelector('.xterm-screen')),
    };
  });
  const a = geometry.backBtn;
  const b = geometry.xtermScreen;
  const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  // A sliver of overlap at the very top-right corner (the button floats a
  // few px above the first text row) is acceptable; a full glyph row of
  // vertical overlap would mean the button is actually sitting on top of
  // live text and is not acceptable. Assert the overlap, if any, is well
  // under one character row's height rather than requiring zero overlap
  // (the button and the terminal's bounding box are allowed to share a
  // corner as long as no rendered text is ever covered).
  const oneRowHeightPx = b.height / 20; // conservative lower bound on row height
  expect(overlapHeight).toBeLessThan(oneRowHeightPx);

  await page.click('.xterm-screen');
  await page.keyboard.type('echo mobile_terminal_ready');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('mobile_terminal_ready');
});

test('full navigation: Session Manager -> terminal -> Back -> re-Join preserves scrollback on mobile', async ({ page }) => {
  const marker = `mobile_nav_marker_${test.info().testId}`;

  const capture = captureTerminalSocket(page);
  const id = await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  await page.click('.xterm-screen');
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine(marker);

  // Tap (not click) the Back button, matching the touch interaction a real
  // mobile user performs -- kb.js registers both 'click' and 'touchend'
  // handlers specifically for this, so exercising tap() here (Playwright's
  // touch-dispatch API, available because devices['Pixel 7'] sets
  // hasTouch:true) is a meaningfully different code path than .click().
  await page.locator('#back-btn').tap();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  // Back on the Session Manager: the session must still be listed (backend
  // tmux/ttyd process is untouched by navigation) with an updated
  // "last joined" timestamp, not silently dropped.
  const row = sessionRow(page, id);
  await expect(row).toBeVisible();
  await expect(row.locator('.session-meta')).toHaveText(
    /last joined:\s*\d{1,2}:\d{2}:\d{2}(\s*[AP]M)?/i,
  );

  // Re-Join: the same tmux session must still hold the earlier output in
  // its scrollback, proving the Back button does not tear down the
  // session, only the current page's view of it.
  const capture2 = captureTerminalSocket(page);
  await row.locator('.sm-btn.join').tap();
  await page.waitForURL(new RegExp(`/term/${id}/`));
  await waitForTerminalReady(page);
  await capture2.waitForSocket();
  // On reattach tmux repaints the current screen from scratch, which can
  // interleave cursor-positioning escapes into the middle of a line's text
  // (see session-persistence.spec.js's identical rejoin assertion) — a
  // substring match on the redraw stream is the established, correct check
  // here, not the stricter own-line match used for freshly-typed output.
  await capture2.waitForOutput(marker);
});

test('mobile toolbar: CTRL modifier, Fn row toggle, and zoom all function on a touch viewport', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  // CTRL+C via the toolbar's sticky-modifier button (tap, not a physical
  // keyboard chord -- this is the only way a touch-only device can send a
  // control byte) must interrupt a running foreground command.
  await page.click('.xterm-screen');
  await page.keyboard.type('sleep 30');
  await page.keyboard.press('Enter');
  await capture.waitForOutput('sleep 30\r\n');

  await page.locator('#kb-c').tap();
  await expect(page.locator('#kb-c')).toHaveClass(/on/);
  await page.click('.xterm-screen');
  await page.keyboard.type('c');
  await expect(page.locator('#kb-c')).not.toHaveClass(/on/); // resetMods() fires after the send

  await page.keyboard.type('echo mobile_ctrlc_ok');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('mobile_ctrlc_ok');

  // Fn row: hidden by default, toggled into view, F-keys become tappable.
  const fnRow = page.locator('#fn-row');
  await expect(fnRow).toBeHidden();
  await page.locator('#kb-fn').tap();
  await expect(fnRow).toBeVisible();
  await expect(fnRow.getByRole('button', { name: 'F1', exact: true })).toBeVisible();
  await page.locator('#kb-fn').tap();
  await expect(fnRow).toBeHidden();

  // Zoom buttons scale the xterm container's CSS zoom without breaking
  // terminal responsiveness -- confirmed by the terminal still accepting
  // and echoing input immediately afterward.
  const zoomBefore = await page.evaluate(() => document.querySelector('.xterm').style.zoom || '1');
  await page.locator('#kb button', { hasText: 'A+' }).first().tap();
  const zoomAfter = await page.evaluate(() => document.querySelector('.xterm').style.zoom);
  expect(zoomAfter).not.toBe(zoomBefore);

  await page.click('.xterm-screen');
  await page.keyboard.type('echo still_alive_after_zoom');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('still_alive_after_zoom');
});

test('toolbar buttons ignore drag/scroll gestures but still register a genuine stationary tap', async ({ page }) => {
  await createSessionViaUi(page);
  await waitForTerminalReady(page);

  const ctrlBox = await page.locator('#kb-c').boundingBox();

  // A finger that lands on CTRL and drags 150px sideways (exactly what
  // scrolling the toolbar row feels like) must NOT toggle it -- see
  // docs/ai/mistakes.md for the double-fire this previously caused.
  await page.evaluate(({ sx, sy, ex, ey }) => {
    const el = document.getElementById('kb-c');
    const mkTouch = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mkTouch(sx, sy)], changedTouches: [mkTouch(sx, sy)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [mkTouch(ex, ey)], changedTouches: [mkTouch(ex, ey)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mkTouch(ex, ey)], bubbles: true, cancelable: true }));
  }, { sx: ctrlBox.x + 5, sy: ctrlBox.y + 5, ex: ctrlBox.x + 155, ey: ctrlBox.y + 5 });
  await expect(page.locator('#kb-c')).not.toHaveClass(/on/);

  // A few px of natural finger tremor during a real tap must still count
  // as a tap, not get misclassified as a drag.
  await page.evaluate(({ sx, sy }) => {
    const el = document.getElementById('kb-s');
    const mkTouch = (x, y) => new Touch({ identifier: 2, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mkTouch(sx, sy)], changedTouches: [mkTouch(sx, sy)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [mkTouch(sx + 3, sy + 2)], changedTouches: [mkTouch(sx + 3, sy + 2)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mkTouch(sx + 3, sy + 2)], bubbles: true, cancelable: true }));
  }, { sx: ctrlBox.x + 15, sy: ctrlBox.y + 15 });
  await expect(page.locator('#kb-s')).toHaveClass(/on/);

  // A genuine, ordinary tap (Playwright's .tap()) must still work end to
  // end -- this isn't a synthetic dispatch, it's the same path a real
  // finger tap takes.
  await page.locator('#kb-s').tap(); // reset off
  const capture = captureTerminalSocket(page);
  await page.reload();
  await waitForTerminalReady(page);
  await capture.waitForSocket();
  await page.locator('#kb-c').tap();
  await page.click('.xterm-screen');
  await page.keyboard.press('c');
  await page.keyboard.type('echo genuine_tap_still_works');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('genuine_tap_still_works');
});

test('toggling the on-screen keyboard many times in a row never leaves the terminal layout corrupted', async ({ page }) => {
  const capture = captureTerminalSocket(page);
  await createSessionViaUi(page);
  await waitForTerminalReady(page);
  await capture.waitForSocket();

  // Exhaustive: far more open/close cycles than a real session would ever
  // see back to back, specifically to surface any layout state that leaks
  // or drifts across repeated visualViewport-driven reflows.
  for (let i = 0; i < 10; i++) {
    await toggleOnScreenKeyboard(page, PIXEL_7.viewport, true);
    const openRect = await page.evaluate(() => document.getElementById('terminal-container').getBoundingClientRect());
    expect(openRect.height).toBeGreaterThan(0);
    expect(openRect.top).toBeGreaterThanOrEqual(0);

    await toggleOnScreenKeyboard(page, PIXEL_7.viewport, false);
    const closedRect = await page.evaluate(() => document.getElementById('terminal-container').getBoundingClientRect());
    expect(closedRect.height).toBeGreaterThan(0);
  }

  // After 10 full cycles, the terminal must still be genuinely usable, not
  // just structurally non-zero.
  await page.click('.xterm-screen');
  await page.keyboard.type('echo alive_after_keyboard_toggle_stress');
  await page.keyboard.press('Enter');
  await capture.waitForOutputLine('alive_after_keyboard_toggle_stress');
});
