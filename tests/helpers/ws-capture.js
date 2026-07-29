'use strict';

/*
 * Why this exists (read before "fixing" a flaky rendering-based assertion):
 *
 * The terminal view is xterm.js running inside ttyd. Its renderer mode
 * (webgl/canvas/dom, see server/session-manager.js's TTYD_RENDERER_TYPE) is
 * chosen by a server-side CLI flag, not a URL param, so a test cannot
 * switch it per-run. Under webgl/canvas, keystrokes and echoed output exist
 * only as pixels — there is no DOM text node to query with
 * waitForSelector/textContent at all. The 'dom' renderer (the default per
 * docs/ai/decision-log.md's ttyd renderer entry) does produce real text nodes, but asserting
 * on the WS stream stays strictly more reliable than either: it doesn't
 * depend on rendering having completed or on renderer choice at all, so
 * this suite keeps using it uniformly rather than branching per renderer.
 *
 * The mechanism: every byte the terminal displays arrives over the same
 * `/term/<id>/ws` WebSocket the browser already holds, using ttyd's tiny
 * framing protocol (1-byte command prefix):
 *   server -> client: "0" + output bytes, "1" + title, "2" + preferences
 *   client -> server: "0" + input bytes, "1" + resize JSON
 * Playwright exposes raw frames via `page.on('websocket', ...)`, so we
 * decode the "0" (output) and "1" (resize) frames directly. This still
 * requires the terminal to have mounted and the socket to be open, so
 * callers should pair it with `waitForTerminalReady()` rather than
 * replacing that check.
 */

const OUTPUT_CMD = '0'.charCodeAt(0);
const RESIZE_CMD = '1'.charCodeAt(0);

function toBuffer(payload) {
  return typeof payload === 'string' ? Buffer.from(payload, 'binary') : payload;
}

/**
 * Strips ANSI/VT escape sequences (CSI, OSC, and short two/three-byte
 * escapes) from captured PTY output. tmux's own redraws -- not just
 * xterm.js's -- routinely reposition the cursor (e.g. `ESC[A` to move up a
 * row) instead of emitting a plain `\r\n` when a line lands at the very
 * bottom of the scroll region, which a naive "look for `\r\n` immediately
 * before/after this text" check can't see past. Stripping escapes first
 * reduces the buffer to what a human actually reads, so the only thing
 * left to determine line boundaries is real `\r`/`\n` bytes.
 *
 * Critically, tmux can express "the pane scrolled up N lines" purely via
 * `ESC[<N>S` (Scroll Up) plus a cursor-position sequence, with NO literal
 * newline byte anywhere in the stream -- observed when output lands
 * exactly at the bottom of the scroll region during a busy/fast-scrolling
 * stream. That sequence is semantically N line breaks even though no `\n`
 * byte exists, so it's converted to literal `\n`s before the generic CSI
 * stripping pass would otherwise just delete it and the line-boundary
 * information with it.
 */
function stripAnsi(str) {
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC: ESC ] ... (BEL | ST)
    .replace(/\x1b\[(\d*)S/g, (_m, n) => '\n'.repeat(parseInt(n, 10) || 1)) // Scroll Up -> real newlines
    .replace(/\x1b\[[0-9;?]*[\x20-\x2f]*[\x40-\x7e]/g, '') // CSI: ESC [ params... final-byte
    .replace(/\x1b[()#%][0-9A-Za-z]/g, '') // charset designation, e.g. ESC(B
    .replace(/\x1b[0-9A-Za-z=><]/g, ''); // short escapes, e.g. ESC=, ESC>, ESC7, ESC8, ESCc
}

/**
 * Attach a capture to the next ttyd WebSocket opened on this page and
 * return helpers to inspect it. Must be called before the action that
 * triggers the terminal connection (e.g. before clicking "Join").
 */
function captureTerminalSocket(page) {
  let output = '';
  let sentInput = '';
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
      if (!buf.length) return;
      if (buf[0] === RESIZE_CMD) {
        try { resizeFrames.push(JSON.parse(buf.slice(1).toString('utf8'))); } catch (_e) { /* ignore */ }
      } else if (buf[0] === OUTPUT_CMD) {
        // Client -> server frames also use the "0" prefix for real PTY
        // input (see kb.js's send()) -- tracked separately from output so
        // tests can assert a gesture sent literally zero bytes to the PTY.
        sentInput += buf.slice(1).toString('utf8');
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
     *
     * Prefer waitForOutputLine() over this for "did the command actually
     * run" checks — a terminal redraw (e.g. triggered by a resize) can
     * interleave escape sequences into the middle of the echoed *input*
     * text, splitting it across two writes and permanently preventing a
     * second whole-substring match even though the command ran fine.
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
    /**
     * Poll accumulated PTY output until `line` appears as a complete line
     * on its own (preceded by a newline or the start of the buffer,
     * followed immediately by \r\n) — i.e. specifically the shell's real
     * stdout line, not "echo <line>" being echoed back as typed input.
     * This is the robust replacement for waitForOutputCount(line, 2):
     * unlike raw occurrence-counting, it isn't fooled by a mid-typing
     * terminal redraw splitting the echoed *input* text into two pieces
     * (which would otherwise make a second whole-substring match
     * impossible even though the command executed correctly) — the real
     * stdout write isn't subject to that same splitting.
     *
     * Matches against the ANSI-stripped buffer (see stripAnsi() above),
     * since tmux can redraw a bottom-of-pane line via cursor repositioning
     * rather than a plain `\r\n`, which would otherwise defeat the "real
     * newline immediately before/after" check even though the line's own
     * text arrived intact and uncorrupted.
     */
    waitForOutputLine(line, timeout = 10000) {
      const pattern = new RegExp(`(?:^|\\r?\\n)${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n`);
      const start = Date.now();
      return new Promise((resolve, reject) => {
        (function check() {
          if (pattern.test(stripAnsi(output))) return resolve(output);
          if (Date.now() - start > timeout) {
            return reject(new Error(
              `Timed out waiting for PTY output to contain the line ${JSON.stringify(line)} on its own.\n` +
              `Last 300 chars (stripped) received: ${JSON.stringify(stripAnsi(output).slice(-300))}`
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
    getSentInput: () => sentInput,
    getResizeFrames: () => resizeFrames.slice(),
    dispose: () => page.off('websocket', listener),
  };
}

module.exports = { captureTerminalSocket };
