'use strict';

/*
 * Helpers for tests/specs/android-mobile-stress.spec.js. These simulate the
 * concurrent-interaction conditions a real mobile user hits while an AI CLI
 * (or any long-running foreground command) is streaming output: typing,
 * scrolling, rotating the device, and toggling the on-screen keyboard, all
 * while text keeps arriving. See docs/ai/decision-log.md for why a
 * deterministic word-stream script (scripts/simulate-model-stream.mjs)
 * stands in for a real local/remote model here.
 */

const path = require('path');
const SIMULATE_STREAM_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'simulate-model-stream.mjs');

/** Types the command that starts the deterministic streaming generator and
 * presses Enter. Fire-and-forget -- callers interact concurrently, then
 * assert on `[stream complete]` (via waitForOutputLine) if they need to
 * know the process actually finished. */
async function startStream(page, { words = 300, delayMs = 15 } = {}) {
  await page.click('.xterm-screen');
  await page.keyboard.type(`node ${SIMULATE_STREAM_SCRIPT} ${words} ${delayMs}`);
  await page.keyboard.press('Enter');
}

/** Simulates a vertical finger swipe on the terminal. kb.js's touch-scroll
 * wheel-dispatch was DISABLED after stress-testing found it always leaked
 * arrow-key escape sequences into the PTY as real input (tmux never
 * populates xterm.js's own client-side scrollback, so every dispatched
 * wheel event hit xterm.js's "nothing left to scroll" fallback -- see
 * docs/ai/mistakes.md 2026-07-29-018). This helper now exists to prove the
 * gesture is a safe no-op: touchmove still preventDefault()s (iOS bounce
 * suppression) but must never reach the PTY or disturb concurrent output. */
async function touchScrollTerminal(page, { deltaY = 400, steps = 6 } = {}) {
  await page.evaluate(({ deltaY, steps }) => {
    const xterm = document.querySelector('.xterm');
    const rect = xterm.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const mkTouch = (x, y) => new Touch({ identifier: 99, target: xterm, clientX: x, clientY: y });
    xterm.dispatchEvent(new TouchEvent('touchstart', {
      touches: [mkTouch(startX, startY)], changedTouches: [mkTouch(startX, startY)],
      bubbles: true, cancelable: true,
    }));
    for (let i = 1; i <= steps; i++) {
      const y = startY - (deltaY * i) / steps;
      xterm.dispatchEvent(new TouchEvent('touchmove', {
        touches: [mkTouch(startX, y)], changedTouches: [mkTouch(startX, y)],
        bubbles: true, cancelable: true,
      }));
    }
    const endY = startY - deltaY;
    xterm.dispatchEvent(new TouchEvent('touchend', {
      touches: [], changedTouches: [mkTouch(startX, endY)],
      bubbles: true, cancelable: true,
    }));
  }, { deltaY, steps });
}

/** Simulates a mobile on-screen keyboard opening/closing by resizing the
 * real Playwright viewport (not a fake shim) -- this genuinely changes
 * window.visualViewport.height, so kb.js's own visualViewport 'resize'
 * listener (onVVChange -> debounced updateLayout) fires exactly as it
 * would for a real keyboard. `open: true` shrinks height to ~60% (a
 * typical mobile keyboard's footprint); `open: false` restores it. */
async function toggleOnScreenKeyboard(page, fullSize, open) {
  const height = open ? Math.round(fullSize.height * 0.58) : fullSize.height;
  await page.setViewportSize({ width: fullSize.width, height });
  // updateLayout()'s visualViewport debounce is 150ms (src/kb.js) -- wait
  // past it so the layout pass has actually run before the caller asserts.
  await page.waitForTimeout(250);
}

/** Simulates portrait<->landscape rotation via a real viewport swap. */
async function rotateDevice(page, size) {
  await page.setViewportSize({ width: size.height, height: size.width });
  await page.waitForTimeout(250);
}

/** Collects window 'pageerror' events for the test's lifetime -- the
 * strongest available signal that a stress scenario broke something at the
 * JS level (e.g. a reflow/recursion bug), independent of visual review. */
function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}

module.exports = {
  startStream, touchScrollTerminal, toggleOnScreenKeyboard, rotateDevice, collectPageErrors,
};
