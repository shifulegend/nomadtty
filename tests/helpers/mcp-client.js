'use strict';

const { MCP_URL, MCP_AUTH_TOKEN } = require('./env');

/* The MCP server always responds to POST /mcp with text/event-stream (see
 * server/mcp/index.js), so every response body is one or more "data: {...}"
 * lines. This parses all of them, in order -- for a plain tool call that's
 * a single JSON-RPC response; for a follow=true call it's zero or more
 * "notifications/progress" messages followed by the final result. */
function parseSseMessages(body) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()));
}

let nextId = 1000;

/** Low-level POST to /mcp. Returns the raw APIResponse plus parsed SSE messages. */
async function post(request, { sessionId, body, token = MCP_AUTH_TOKEN } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await request.post(MCP_URL, { headers, data: body });
  const text = await res.text();
  return { res, status: res.status(), messages: text ? parseSseMessages(text) : [] };
}

/** Runs the initialize handshake and returns the session id from the response header. */
async function initializeMcpSession(request, { token } = {}) {
  const { res, status, messages } = await post(request, {
    token,
    body: {
      jsonrpc: '2.0',
      id: nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'playwright-mcp-tests', version: '1.0.0' },
      },
    },
  });
  return { sessionId: res.headers()['mcp-session-id'], status, message: messages[0] };
}

/** Calls a tool and returns its parsed JSON content (throws on a protocol-level error). */
async function callTool(request, sessionId, name, args, { meta } = {}) {
  const params = { name, arguments: args };
  if (meta) params._meta = meta;
  const { messages } = await post(request, {
    sessionId,
    body: { jsonrpc: '2.0', id: nextId++, method: 'tools/call', params },
  });
  const message = messages[messages.length - 1];
  if (message.error) {
    throw new Error(`tools/call ${name} returned a protocol error: ${JSON.stringify(message.error)}`);
  }
  return { result: message.result, allMessages: messages };
}

/** Like callTool, but returns the parsed tool payload directly and throws on isError too. */
async function callToolExpectOk(request, sessionId, name, args, opts) {
  const { result } = await callTool(request, sessionId, name, args, opts);
  if (result.isError) {
    throw new Error(`tools/call ${name} returned isError: ${JSON.stringify(result.content)}`);
  }
  return JSON.parse(result.content[0].text);
}

/**
 * Polls `fn` (an async predicate) until it returns a truthy value or
 * `timeout` elapses. Used where a tool's effect on the shell isn't
 * synchronous with the tool call returning (e.g. waiting for a command to
 * actually execute before asserting on its output) and there's no
 * WebSocket stream to await a specific line on, unlike helpers/ws-capture.js.
 * 8s default (not 5s): these polls wait on real tmux/ttyd subprocess
 * round-trips, which get slower under the load of a full suite run.
 */
async function pollUntil(fn, { timeout = 8000, interval = 100 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`pollUntil: condition not met within ${timeout}ms`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * True if `marker` appears as a complete line on its own (preceded by a
 * newline or the start of the capture, followed by a newline, optionally
 * with trailing whitespace in between) -- i.e. specifically real command
 * *output*, not the shell's echo of typed *input*. A naive
 * `content.includes(marker)` is fooled whenever the marker text also
 * appears inside the command that was typed to produce it (e.g.
 * `echo my_marker` echoes "my_marker" back before the command has even
 * run; `seq 1 300`'s own echoed input already contains the substring
 * "300"). This is the HTTP/tools.js-call equivalent of
 * tests/helpers/ws-capture.js's waitForOutputLine() for the WebSocket-based
 * browser suite -- see docs/ai/mistakes.md 2026-07-29-009 for the bug class.
 * Trailing `[ \t]*` before the newline: server/mcp/tmux.js's capture-pane
 * calls use `-J` (join tmux's own wrapped display lines back into one
 * logical line -- otherwise a long marker silently splits mid-word across
 * two "lines" whenever it exceeds the pane's column width), and `-J`'s own
 * documented behavior is to preserve each line's trailing spaces, which a
 * plain (non -J) capture would otherwise have trimmed.
 */
function outputHasOwnLine(content, marker) {
  const escaped = String(marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\r?\\n)${escaped}[ \\t]*\\r?\\n`).test(content);
}

module.exports = {
  post, initializeMcpSession, callTool, callToolExpectOk, parseSseMessages, pollUntil, outputHasOwnLine,
};
