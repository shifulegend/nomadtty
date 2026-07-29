'use strict';

/*
 * Why this exists (read before "fixing" a flaky canvas assertion):
 *
 * The terminal view is xterm.js running inside ttyd, rendered with the
 * WebGL/canvas renderer. That means keystrokes and their echoed output
 * exist only as pixels on a <canvas> — there is no DOM text node to query
 * with waitForSelector/textContent, and ttyd's renderer mode is chosen by
 * a server-side CLI flag (not a URL param), so a test cannot switch it to
 * the DOM renderer without editing application source, which is out of
 * scope for this suite.
 *
 * The reliable, non-flaky alternative: every byte the terminal displays
 * arrives over the same `/term/<id>/ws` WebSocket the browser already
 * holds, using ttyd's tiny framing protocol (1-byte command prefix):
 *   server -> client: "0" + output bytes, "1" + title, "2" + preferences
 *   client -> server: "0" + input bytes, "1" + resize JSON
 * Playwright exposes raw frames via `page.on('websocket', ...)`, so we
 * decode the "0" (output) and "1" (resize) frames directly. This asserts
 * on the actual PTY stream — strictly more reliable than pixel/OCR
 * inspection of a canvas, and it still requires the canvas to have
 * mounted and the socket to be open, so callers should pair it with
 * `waitForTerminalReady()` below rather than replacing that check.
 */

const OUTPUT_CMD = '0'.charCodeAt(0);
const RESIZE_CMD = '1'.charCodeAt(0);

function toBuffer(payload) {
  return typeof payload === 'string' ? Buffer.from(payload, 'binary') : payload;
}

/**
 * Attach a capture to the next ttyd WebSocket opened on this page and
 * return helpers to inspect it. Must be called before the action that
 * triggers the terminal connection (e.g. before clicking "Join").
 */
function captureTerminalSocket(page) {
  let output = '';
  const resizeFrames = [];
  let socketPromiseResolve;
  const socketPromise = new Promise((resolve) => { socketPromiseResolve = resolve; });

  const listener = (ws) => {
    if (!/\/ws(\?|$)/.test(ws.url())) return;
    ws.on('framereceived', (f) => {
      const buf = toBuffer(f.payload);
      if (buf.length && buf[0] === OUTPUT_CMD) output += buf.slice(1).toString('utf8');
    });
    ws.on('framesent', (f) => {
      const buf = toBuffer(f.payload);
      if (buf.length && buf[0] === RESIZE_CMD) {
        try { resizeFrames.push(JSON.parse(buf.slice(1).toString('utf8'))); } catch (_e) { /* ignore */ }
      }
    });
    socketPromiseResolve(ws);
  };
  page.on('websocket', listener);

  return {
    /** Resolves once the ttyd WebSocket has actually opened. */
    waitForSocket: (timeout = 15000) => Promise.race([
      socketPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ttyd WebSocket never opened')), timeout)),
    ]),
    /** Poll accumulated PTY output until `substring` appears. */
    waitForOutput(substring, timeout = 10000) {
      return this.waitForOutputCount(substring, 1, timeout);
    },
    /**
     * Poll accumulated PTY output until `substring` appears at least
     * `count` times. A raw PTY in canonical mode echoes each typed
     * keystroke back over the wire as it's typed, so the terminal itself
     * (not just its actual stdout) will already contain e.g. "marker\r\n"
     * the instant Enter is echoed — before the shell has executed
     * anything. Anything asserting on genuine command *output* (as
     * opposed to "the input was accepted") must require a second
     * occurrence, or it can pass on the echoed keystrokes alone.
     */
    waitForOutputCount(substring, count, timeout = 10000) {
      const start = Date.now();
      return new Promise((resolve, reject) => {
        (function check() {
          if (output.split(substring).length - 1 >= count) return resolve(output);
          if (Date.now() - start > timeout) {
            return reject(new Error(
              `Timed out waiting for PTY output to contain ${JSON.stringify(substring)} ` +
              `at least ${count} time(s).\n` +
              `Last 300 chars received: ${JSON.stringify(output.slice(-300))}`
            ));
          }
          setTimeout(check, 25);
        })();
      });
    },
    /** Poll for at least `count` resize frames, returning the latest. */
    waitForResize(count = 1, timeout = 5000) {
      const start = Date.now();
      return new Promise((resolve, reject) => {
        (function check() {
          if (resizeFrames.length >= count) return resolve(resizeFrames[resizeFrames.length - 1]);
          if (Date.now() - start > timeout) {
            return reject(new Error(`Timed out waiting for ${count} resize frame(s); saw ${resizeFrames.length}`));
          }
          setTimeout(check, 25);
        })();
      });
    },
    getOutput: () => output,
    getResizeFrames: () => resizeFrames.slice(),
    dispose: () => page.off('websocket', listener),
  };
}

module.exports = { captureTerminalSocket };
