#!/usr/bin/env node
/* NomadTTY — MCP tool registry.
 *
 * Each tool follows the same shape: validate (validation.js) -> act on the
 * pane (tmux.js) -> return a small JSON payload as MCP text content.
 * Expected, recoverable failures (bad terminal_id, bad key name, blocked
 * command) are surfaced as `isError` tool results so an agent can see and
 * react to them; only truly unexpected errors propagate as thrown
 * exceptions (the SDK turns those into a protocol-level error).
 */

'use strict';

const { z } = require('zod');
const tmux = require('./tmux');
const {
  ToolInputError, requireTerminalId, requireText, findDenylistMatch,
  requireNamedKeys, requireHexKeys, requireLineCount, MAX_FULL_CAPTURE_LINES,
} = require('./validation');

const FOLLOW_MAX_SECONDS = parseInt(process.env.MCP_FOLLOW_MAX_SECONDS || '30', 10);
const FOLLOW_POLL_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Wraps a handler so ToolInputError becomes an isError result instead of a thrown protocol error. */
function guarded(handler) {
  return async (args, extra) => {
    try {
      return await handler(args, extra);
    } catch (err) {
      if (err instanceof ToolInputError) return errorResult(err.message);
      return errorResult(`internal error: ${err.message}`);
    }
  };
}

// Per-terminal scroll cursor: lines of backscroll currently offset from the
// live bottom of the pane. Lives here (not tmux.js) because it's MCP-tool
// state, not a tmux primitive — tmux itself has no notion of "the agent's
// current scroll position" outside of interactive copy-mode.
const scrollOffsets = new Map();

function registerTools(server, { sessions }) {
  server.registerTool(
    'get_screenshot',
    {
      title: 'Get terminal screenshot',
      description:
        "Captures the current visual state of a terminal's viewport (the lines currently visible, " +
        'not scrollback). NomadTTY terminals are text-mode (ttyd/tmux), so "screenshot" here means a ' +
        'textual/ANSI snapshot of the viewport rather than a pixel image — there is no server-side ' +
        'pixel renderer. Set ansi=true to preserve color/style escape codes.',
      inputSchema: {
        terminal_id: z.string().describe('The session id, as returned by the Session Manager (12 hex chars).'),
        ansi: z.boolean().optional().default(false).describe('Include ANSI escape codes (colors/styles) in the output.'),
      },
    },
    guarded(async ({ terminal_id, ansi }) => {
      const entry = requireTerminalId(sessions, terminal_id);
      const info = tmux.getPaneInfo(entry.tmuxName);
      const offset = scrollOffsets.get(terminal_id) || 0;
      const content = tmux.captureViewport(entry.tmuxName, { ansi, offsetFromBottom: offset });
      return textResult({
        terminal_id, format: ansi ? 'ansi' : 'text',
        width: info.width, height: info.height, scroll_offset: offset, content,
      });
    })
  );

  server.registerTool(
    'scroll_buffer',
    {
      title: 'Scroll terminal buffer',
      description:
        'Moves the terminal\'s scroll position up (into history) or down (toward live output) and ' +
        'returns the newly visible viewport. Position is tracked per terminal_id and persists across calls.',
      inputSchema: {
        terminal_id: z.string().describe('The session id to scroll.'),
        direction: z.enum(['up', 'down']).describe('"up" moves further into scrollback history; "down" moves toward the live view.'),
        degree: z.object({
          unit: z.enum(['lines', 'pages']).describe('Scroll by raw line count or by whole viewport pages.'),
          amount: z.number().int().positive().describe('How many lines/pages to scroll.'),
        }),
        ansi: z.boolean().optional().default(false),
      },
    },
    guarded(async ({ terminal_id, direction, degree, ansi }) => {
      const entry = requireTerminalId(sessions, terminal_id);
      const info = tmux.getPaneInfo(entry.tmuxName);
      const deltaLines = degree.unit === 'pages' ? degree.amount * info.height : degree.amount;
      const current = scrollOffsets.get(terminal_id) || 0;
      const maxOffset = Math.max(0, info.historySize);
      let next = direction === 'up' ? current + deltaLines : current - deltaLines;
      next = Math.max(0, Math.min(maxOffset, next));
      scrollOffsets.set(terminal_id, next);

      const content = tmux.captureViewport(entry.tmuxName, { ansi, offsetFromBottom: next });
      return textResult({
        terminal_id, scroll_offset: next, at_top: next >= maxOffset, at_bottom: next === 0,
        width: info.width, height: info.height, content,
      });
    })
  );

  server.registerTool(
    'type_command',
    {
      title: 'Type into terminal stdin',
      description:
        'Injects a literal text string into the terminal\'s stdin, as if typed. By default also sends ' +
        'Enter to submit it as a command; set submit=false to leave it in the line buffer unsent. ' +
        'This tool grants the same power as typing at the terminal directly, so access to it must be ' +
        'restricted to trusted, authenticated agents (see the MCP server\'s auth requirements) — content ' +
        'is not sandboxed beyond a best-effort denylist of obviously destructive one-liners.',
      inputSchema: {
        terminal_id: z.string().describe('The session id to type into.'),
        text: z.string().describe('The literal text to inject (e.g. "echo hello").'),
        submit: z.boolean().optional().default(true).describe('Send Enter after the text to submit it.'),
      },
    },
    guarded(async ({ terminal_id, text, submit }) => {
      const entry = requireTerminalId(sessions, terminal_id);
      requireText(text, { fieldName: 'text' });
      const denylistHit = findDenylistMatch(text);
      if (denylistHit) {
        throw new ToolInputError(
          `Blocked: text matched a destructive-command safeguard (pattern: ${denylistHit}). ` +
          'This is a best-effort guard, not a sandbox; set MCP_DENYLIST_ENABLED=0 to disable it if this was a false positive.'
        );
      }
      tmux.sendLiteral(entry.tmuxName, text);
      if (submit) tmux.sendEnter(entry.tmuxName);
      return textResult({ terminal_id, injected: text, submitted: submit });
    })
  );

  server.registerTool(
    'send_keystroke',
    {
      title: 'Send a keystroke or control combination',
      description:
        'Injects a specific keystroke into the terminal: either named key combinations in tmux notation ' +
        '(mode="named", e.g. ["C-c"] for Ctrl+C, ["M-F4"] for Alt+F4, ["Up"], ["Escape"]) or raw bytes ' +
        'as two-digit hex codes (mode="hex", e.g. ["1b","5b","41"] for an escape sequence). Use this for ' +
        'control characters and special keys that type_command\'s literal-text mode cannot express.',
      inputSchema: {
        terminal_id: z.string().describe('The session id to send the keystroke to.'),
        mode: z.enum(['named', 'hex']).describe('"named" for tmux key notation, "hex" for raw hex-encoded bytes.'),
        keys: z.array(z.string()).optional().describe('Required when mode="named": e.g. ["C-c"], ["M-F4"], ["Enter"].'),
        hex: z.array(z.string()).optional().describe('Required when mode="hex": two-digit hex bytes, e.g. ["1b","5b","41"].'),
      },
    },
    guarded(async ({ terminal_id, mode, keys, hex }) => {
      const entry = requireTerminalId(sessions, terminal_id);
      if (mode === 'named') {
        const validKeys = requireNamedKeys(keys);
        tmux.sendNamedKeys(entry.tmuxName, validKeys);
        return textResult({ terminal_id, mode, keys: validKeys });
      }
      const validHex = requireHexKeys(hex);
      tmux.sendHexKeys(entry.tmuxName, validHex);
      return textResult({ terminal_id, mode, hex: validHex });
    })
  );

  server.registerTool(
    'read_terminal_contents',
    {
      title: 'Read terminal buffer contents',
      description:
        'Retrieves the terminal\'s stdout buffer as raw text or ANSI-escaped text. mode="tail" (default) ' +
        'returns the most recent `lines` lines — the efficient choice for polling recent output. ' +
        'mode="head" returns the oldest `lines` lines of scrollback. mode="full" returns the entire ' +
        `buffer, capped at ${MAX_FULL_CAPTURE_LINES} lines (truncated to the most recent lines beyond that, ` +
        'flagged via `truncated`). Set follow=true with an MCP progress token on the request to stream ' +
        'new output in real time over SSE as it arrives, for up to MCP_FOLLOW_MAX_SECONDS.',
      inputSchema: {
        terminal_id: z.string().describe('The session id to read from.'),
        mode: z.enum(['full', 'head', 'tail']).optional().default('tail'),
        lines: z.number().int().positive().optional().describe('Line count for mode="head"/"tail" (default 200).'),
        ansi: z.boolean().optional().default(false).describe('Include ANSI escape codes in the output.'),
        follow: z.boolean().optional().default(false).describe(
          'Stream new output as it arrives via progress notifications (requires the caller to set a progressToken).'
        ),
      },
    },
    guarded(async ({ terminal_id, mode, lines, ansi, follow }, extra) => {
      const entry = requireTerminalId(sessions, terminal_id);
      const read = () => readByMode(entry.tmuxName, mode, lines, ansi);

      if (!follow) return textResult({ terminal_id, mode, ansi, ...read() });

      const progressToken = extra && extra._meta ? extra._meta.progressToken : undefined;
      let snapshot = tmux.captureTail(entry.tmuxName, lines || 200, { ansi });
      if (progressToken === undefined) {
        // No progress token supplied: caller can't receive streamed events,
        // so behave like a normal single-shot read rather than silently
        // waiting/blocking with nothing to show for it.
        return textResult({ terminal_id, mode, ansi, followed: false, ...read() });
      }

      const deadline = Date.now() + FOLLOW_MAX_SECONDS * 1000;
      let progress = 0;
      while (Date.now() < deadline && !extra.signal.aborted) {
        await sleep(FOLLOW_POLL_MS);
        const next = tmux.captureTail(entry.tmuxName, lines || 200, { ansi });
        if (next !== snapshot) {
          const delta = diffNewSuffix(snapshot, next);
          progress += 1;
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress, message: delta },
          });
          snapshot = next;
        }
      }
      return textResult({ terminal_id, mode, ansi, followed: true, content: snapshot });
    })
  );

  server.registerTool(
    'get_process_status',
    {
      title: 'Get process status for a terminal',
      description:
        "Returns the process tree running inside a terminal's shell (the pane's process and every " +
        'descendant), with PID, CPU%, memory%, elapsed time, and state — useful for checking whether a ' +
        'command an agent started is still running, hung, or has exited.',
      inputSchema: {
        terminal_id: z.string().describe('The session id to inspect.'),
      },
    },
    guarded(async ({ terminal_id }) => {
      const entry = requireTerminalId(sessions, terminal_id);
      const info = tmux.getPaneInfo(entry.tmuxName);
      const processes = tmux.processTree(info.pid);
      return textResult({ terminal_id, shell_pid: info.pid, processes });
    })
  );

  server.registerTool(
    'list_active_ports',
    {
      title: 'List active listening ports',
      description:
        'Lists TCP/UDP ports currently in LISTEN state on the host running NomadTTY — useful for an ' +
        'agent to confirm a dev server it just started is actually listening, or to check for a port ' +
        'conflict before starting one. This reflects the whole host, not one terminal in isolation, ' +
        'since NomadTTY sessions share the host network namespace.',
      inputSchema: {
        protocol: z.enum(['tcp', 'udp', 'all']).optional().default('all'),
      },
    },
    guarded(async ({ protocol }) => {
      const ports = tmux.listeningSockets({ protocol });
      return textResult({ protocol, count: ports.length, ports });
    })
  );
}

function readByMode(tmuxName, mode, lines, ansi) {
  if (mode === 'tail') {
    const n = requireLineCount(lines ?? 200, { fieldName: 'lines' });
    return { content: tmux.captureTail(tmuxName, n, { ansi }) };
  }
  if (mode === 'head') {
    const n = requireLineCount(lines ?? 200, { fieldName: 'lines' });
    return { content: tmux.captureHead(tmuxName, n, { ansi }) };
  }
  // mode === 'full'
  const info = tmux.getPaneInfo(tmuxName);
  // historySize + real rows used in the current viewport (cursorY + 1) -- not
  // + pane height, which would count blank padding below the prompt as "lines".
  const totalLines = info.historySize + info.cursorY + 1;
  if (totalLines > MAX_FULL_CAPTURE_LINES) {
    return { content: tmux.captureTail(tmuxName, MAX_FULL_CAPTURE_LINES, { ansi }), truncated: true, total_lines: totalLines };
  }
  return { content: tmux.captureFull(tmuxName, { ansi }), truncated: false, total_lines: totalLines };
}

/** Best-effort: returns whatever suffix of `next` isn't a prefix-shared part of `prev`. */
function diffNewSuffix(prev, next) {
  if (next.startsWith(prev)) return next.slice(prev.length);
  return next; // pane was redrawn/scrolled rather than simply appended to; send the whole new view.
}

module.exports = { registerTools };
