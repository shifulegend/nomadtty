'use strict';

/*
 * Coverage for all 7 MCP tools (server/mcp/tools.js), exercised over real
 * HTTP against the live MCP server -- no browser involved, matching how an
 * actual agent uses these tools (Playwright's `request` fixture is a pure
 * HTTP client here, not driving a page). Each test gets its own terminal
 * session (created via the API, exactly as an agent would -- no browser
 * tab ever opens it) and its own MCP session (the `initialize` handshake),
 * via fixtures below, so tests can't see each other's terminal state.
 *
 * Completion checks poll for real command OUTPUT via outputHasOwnLine(),
 * not a naive content.includes(marker) -- the latter is fooled whenever the
 * marker text also appears in the command that was TYPED to produce it
 * (e.g. `seq 1 300`'s own echoed input already contains the substring
 * "300", well before the command has actually run). See
 * docs/ai/mistakes.md 2026-07-29-009 and helpers/mcp-client.js's
 * outputHasOwnLine() doc comment.
 */

const base = require('@playwright/test');
const { BASE_URL, MCP_URL, MCP_PORT } = require('../helpers/env');
const { apiCreateSession, apiCloseAllSessions } = require('../helpers/session-manager');
const { initializeMcpSession, callTool, callToolExpectOk, post, pollUntil, outputHasOwnLine } = require('../helpers/mcp-client');

const test = base.test.extend({
  terminalId: async ({ request }, use) => {
    const id = await apiCreateSession(request, 'mcp-tools-test');
    await use(id);
    await request.delete(`${BASE_URL}/api/sessions/${id}`).catch(() => {});
  },
  mcpSessionId: async ({ request }, use) => {
    const { sessionId, status } = await initializeMcpSession(request);
    base.expect(status).toBe(200);
    base.expect(sessionId).toBeTruthy();
    await use(sessionId);
  },
});
const { expect } = base;

test.afterEach(async ({ request }) => {
  await apiCloseAllSessions(request);
});

/** Types `text` (with Enter) and waits until its real stdout line is visible via get_screenshot. */
async function runAndWaitForOutput(request, mcpSessionId, terminalId, text, outputLine) {
  await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text });
  return pollUntil(async () => {
    const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
    return outputHasOwnLine(shot.content, outputLine) ? shot : null;
  });
}

test.describe('MCP protocol', () => {
  test('tools/list returns exactly the 10 documented tools with object schemas requiring terminal_id where expected', async ({ request, mcpSessionId }) => {
    const { messages } = await post(request, { sessionId: mcpSessionId, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    const tools = messages[0].result.tools;
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'close_session', 'create_session', 'get_process_status', 'get_screenshot',
      'list_active_ports', 'list_sessions', 'read_terminal_contents', 'scroll_buffer',
      'send_keystroke', 'type_command',
    ]);
    const NO_TERMINAL_ID = new Set(['list_active_ports', 'list_sessions', 'create_session']);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      if (!NO_TERMINAL_ID.has(t.name)) {
        expect(t.inputSchema.required).toContain('terminal_id');
      }
    }
  });

  test('rejects requests with no bearer token', async ({ request }) => {
    const res = await request.post(MCP_URL, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } } },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects requests with an incorrect bearer token', async ({ request }) => {
    const { status } = await initializeMcpSession(request, { token: 'definitely-the-wrong-token' });
    expect(status).toBe(401);
  });

  test('accepts requests with the correct bearer token', async ({ request }) => {
    const { status, sessionId } = await initializeMcpSession(request);
    expect(status).toBe(200);
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

test.describe('get_screenshot', () => {
  test('captures the terminal\'s live viewport, including real command output', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `screenshot_${test.info().testId}`;
    const screenshot = await runAndWaitForOutput(request, mcpSessionId, terminalId, `echo ${marker}`, marker);
    expect(screenshot.format).toBe('text');
    expect(screenshot.width).toBeGreaterThan(0);
    expect(screenshot.height).toBeGreaterThan(0);
    expect(screenshot.scroll_offset).toBe(0);
  });

  test('ansi=true includes escape codes when the shell emits color', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `red_ansi_${test.info().testId}`;
    // Wait for completion via the plain (ansi:false) capture first: with no
    // -e flag tmux strips the SGR codes, so the real output line is exactly
    // `marker` with nothing else on it -- a clean target for outputHasOwnLine.
    // Once that's confirmed, a *separate* ansi:true call fetches the
    // escape-coded version (decoupling "did it run" from "what does the
    // colored capture look like").
    await runAndWaitForOutput(request, mcpSessionId, terminalId, `printf '\\033[31m${marker}\\033[0m\\n'`, marker);
    const withAnsi = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId, ansi: true });
    expect(withAnsi.content).toContain('\x1b[31m'); // SGR "red" escape emitted by the printf above
    expect(withAnsi.content).toContain(marker);
  });

  test('rejects an unknown terminal_id', async ({ request, mcpSessionId }) => {
    const { result } = await callTool(request, mcpSessionId, 'get_screenshot', { terminal_id: 'ffffffffffff' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No session found/);
  });
});

test.describe('read_terminal_contents', () => {
  test('mode=tail returns the most recent lines, not the start of a long sequence', async ({ request, mcpSessionId, terminalId }) => {
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'seq 1 300' });
    const tail = await pollUntil(async () => {
      const r = await callToolExpectOk(request, mcpSessionId, 'read_terminal_contents', { terminal_id: terminalId, mode: 'tail', lines: 10 });
      return outputHasOwnLine(r.content, '300') ? r : null;
    });
    expect(outputHasOwnLine(tail.content, '300')).toBe(true);
    expect(outputHasOwnLine(tail.content, '1')).toBe(false); // long since scrolled past a 10-line tail window
  });

  test('mode=head returns the oldest lines of scrollback, not the tail', async ({ request, mcpSessionId, terminalId }) => {
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'seq 1 300' });
    await pollUntil(async () => {
      const r = await callToolExpectOk(request, mcpSessionId, 'read_terminal_contents', { terminal_id: terminalId, mode: 'tail', lines: 5 });
      return outputHasOwnLine(r.content, '300') ? r : null;
    });
    const head = await callToolExpectOk(request, mcpSessionId, 'read_terminal_contents', { terminal_id: terminalId, mode: 'head', lines: 5 });
    expect(outputHasOwnLine(head.content, '1')).toBe(true);
    expect(outputHasOwnLine(head.content, '300')).toBe(false);
  });

  test('mode=full returns the whole buffer, untruncated for a small session', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `full_mode_${test.info().testId}`;
    await runAndWaitForOutput(request, mcpSessionId, terminalId, `echo ${marker}`, marker);
    const full = await callToolExpectOk(request, mcpSessionId, 'read_terminal_contents', { terminal_id: terminalId, mode: 'full' });
    expect(full.truncated).toBe(false);
    expect(outputHasOwnLine(full.content, marker)).toBe(true);
  });

  test('follow=true with a progressToken streams live output as SSE progress notifications', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `follow_${test.info().testId}`;

    const followPromise = post(request, {
      sessionId: mcpSessionId,
      body: {
        jsonrpc: '2.0', id: 999, method: 'tools/call',
        params: {
          name: 'read_terminal_contents',
          arguments: { terminal_id: terminalId, mode: 'tail', lines: 10, follow: true },
          _meta: { progressToken: 'test-progress-token' },
        },
      },
    });

    // Give the follow loop a moment to start polling before we produce output.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: `echo ${marker}` });

    const { messages } = await followPromise;
    const progressEvents = messages.filter((m) => m.method === 'notifications/progress');
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.some((e) => e.params.message.includes(marker))).toBe(true);

    const finalResult = messages[messages.length - 1];
    const payload = JSON.parse(finalResult.result.content[0].text);
    expect(payload.followed).toBe(true);
    expect(outputHasOwnLine(payload.content, marker)).toBe(true);
  });

  test('without follow, a progressToken is ignored and a normal single result is returned', async ({ request, mcpSessionId, terminalId }) => {
    const { allMessages } = await callTool(request, mcpSessionId, 'read_terminal_contents', { terminal_id: terminalId, mode: 'tail' }, {});
    expect(allMessages.length).toBeGreaterThan(0);
    expect(allMessages.filter((m) => m.method === 'notifications/progress').length).toBe(0);
  });
});

test.describe('scroll_buffer', () => {
  test('scrolling up moves into history and scrolling back down returns to the live view', async ({ request, mcpSessionId, terminalId }) => {
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'seq 1 200' });
    await pollUntil(async () => {
      const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
      return outputHasOwnLine(shot.content, '200') ? shot : null;
    });

    const scrolledUp = await callToolExpectOk(request, mcpSessionId, 'scroll_buffer', {
      terminal_id: terminalId, direction: 'up', degree: { unit: 'pages', amount: 1 },
    });
    expect(scrolledUp.scroll_offset).toBeGreaterThan(0);
    expect(outputHasOwnLine(scrolledUp.content, '200')).toBe(false); // scrolled away from the live bottom

    const scrolledDown = await callToolExpectOk(request, mcpSessionId, 'scroll_buffer', {
      terminal_id: terminalId, direction: 'down', degree: { unit: 'lines', amount: 10000 },
    });
    expect(scrolledDown.scroll_offset).toBe(0);
    expect(scrolledDown.at_bottom).toBe(true);
  });

  test('scrolling up is clamped at the top of scrollback', async ({ request, mcpSessionId, terminalId }) => {
    // No real scrollback yet (fresh session) -- history_size is 0, so any
    // "up" scroll must clamp to offset 0, not go negative into nonexistent history.
    const scrolled = await callToolExpectOk(request, mcpSessionId, 'scroll_buffer', {
      terminal_id: terminalId, direction: 'up', degree: { unit: 'lines', amount: 500 },
    });
    expect(scrolled.scroll_offset).toBe(0);
    expect(scrolled.at_top).toBe(true);
  });
});

test.describe('touch-history (copy-mode) / MCP interop', () => {
  /*
   * kb.js's mobile "Hist" toolbar button drives real tmux copy-mode
   * server-side (server/session-manager.js's /api/sessions/:id/copy-scroll,
   * see docs/ai/decision-log.md) so a swipe pages through genuine
   * scrollback, exactly like a native terminal. That pane is the SAME one
   * every MCP tool acts on, so a human left mid-scroll must never be able
   * to break a concurrent agent call. These tests drive that endpoint
   * directly (no browser needed -- it's a plain loopback HTTP POST, same
   * as the rest of the Session Manager API) to simulate "a human tapped
   * Hist and is mid-swipe" concurrently with real MCP tool calls.
   */
  async function enterCopyMode(request, terminalId) {
    const res = await request.post(`${BASE_URL}/api/sessions/${terminalId}/copy-scroll`, {
      data: { action: 'enter' },
    });
    expect(res.ok()).toBe(true);
  }

  test('type_command still lands in the shell (not copy-mode) while the pane is mid-scroll', async ({ request, mcpSessionId, terminalId }) => {
    await runAndWaitForOutput(request, mcpSessionId, terminalId, 'echo before_scroll', 'before_scroll');

    await enterCopyMode(request, terminalId);
    const midScroll = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
    // capture-pane's returned text is unaffected by copy-mode -- verifies
    // MCP reads stay correct even while a human is mid-scroll.
    expect(outputHasOwnLine(midScroll.content, 'before_scroll')).toBe(true);

    // The interference case: an agent's send must still work correctly,
    // not error and not silently vanish into copy-mode's own key bindings.
    const marker = `after_scroll_${test.info().testId}`;
    await runAndWaitForOutput(request, mcpSessionId, terminalId, `echo ${marker}`, marker);
  });

  test('send_keystroke still lands in the shell while the pane is mid-scroll', async ({ request, mcpSessionId, terminalId }) => {
    await enterCopyMode(request, terminalId);
    // Short, fixed, and alphanumeric-only: terminalId already isolates this
    // test from every other; `echo <marker>` split into individual named
    // keys must stay under MCP_MAX_KEYS_PER_CALL (32) and every single-char
    // key must match NAMED_KEY_RE ([A-Za-z0-9] only -- no underscore).
    const marker = 'skscrollok';
    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', {
      terminal_id: terminalId, mode: 'named',
      keys: `echo ${marker}`.split('').map((c) => c === ' ' ? 'Space' : c),
    });
    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'named', keys: ['Enter'] });
    await pollUntil(async () => {
      const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
      return outputHasOwnLine(shot.content, marker) ? shot : null;
    });
  });
});

test.describe('type_command', () => {
  test('submit:false leaves the text unsent until Enter is sent separately', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `unsent_${test.info().testId}`;
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: `echo ${marker}`, submit: false });

    // Immediate, not polled: submit:false has no async effect to wait for.
    // Exactly one occurrence (the echoed input) proves it was NOT executed
    // -- outputHasOwnLine would also correctly report false here, but an
    // exact occurrence count is the more direct way to assert "not yet run".
    const beforeEnter = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
    expect(beforeEnter.content.split(marker).length - 1).toBe(1);

    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'named', keys: ['Enter'] });
    await pollUntil(async () => {
      const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
      return outputHasOwnLine(shot.content, marker) ? shot : null;
    });
  });

  test('is blocked by the destructive-command denylist', async ({ request, mcpSessionId, terminalId }) => {
    const { result } = await callTool(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'rm -rf /' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Blocked/);
  });
});

test.describe('send_keystroke', () => {
  test('named mode: Ctrl+C interrupts a running foreground command', async ({ request, mcpSessionId, terminalId }) => {
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'sleep 30' });
    // "sleep 30" produces no stdout of its own, so this precondition check
    // (the shell accepted the input) has to match the echoed *input* line
    // itself -- there is no "real output" line to wait for instead.
    await pollUntil(async () => {
      const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
      return shot.content.includes('sleep 30') ? shot : null;
    });

    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'named', keys: ['C-c'] });

    // A fresh command's real stdout line appearing is the proof bash
    // actually regained the foreground (interrupted, not just buffered
    // behind sleep) -- outputHasOwnLine can't be fooled by the buffered
    // input line the way a naive substring/occurrence check on the whole
    // capture could be.
    const marker = `interrupted_${test.info().testId}`;
    await runAndWaitForOutput(request, mcpSessionId, terminalId, `echo ${marker}`, marker);
  });

  test('hex mode: raw bytes reach the PTY (0d submits a pending command like Enter)', async ({ request, mcpSessionId, terminalId }) => {
    const marker = `hexsubmit_${test.info().testId}`;
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: `echo ${marker}`, submit: false });
    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'hex', hex: ['0d'] });

    await pollUntil(async () => {
      const shot = await callToolExpectOk(request, mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
      return outputHasOwnLine(shot.content, marker) ? shot : null;
    });
  });

  test('rejects a named key outside the tmux key-notation allowlist', async ({ request, mcpSessionId, terminalId }) => {
    const { result } = await callTool(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'named', keys: ['-t evil'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid key/);
  });

  test('rejects a hex byte that is not exactly two hex digits', async ({ request, mcpSessionId, terminalId }) => {
    const { result } = await callTool(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'hex', hex: ['zz'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid hex byte/);
  });
});

test.describe('get_process_status', () => {
  test('reports the shell pid and its own process entry', async ({ request, mcpSessionId, terminalId }) => {
    const status = await callToolExpectOk(request, mcpSessionId, 'get_process_status', { terminal_id: terminalId });
    expect(status.shell_pid).toBeGreaterThan(0);
    const shellEntry = status.processes.find((p) => p.pid === status.shell_pid);
    expect(shellEntry).toBeTruthy();
    expect(shellEntry.command).toMatch(/bash/);
  });

  test('shows a child process while a command is running', async ({ request, mcpSessionId, terminalId }) => {
    await callToolExpectOk(request, mcpSessionId, 'type_command', { terminal_id: terminalId, text: 'sleep 5' });
    const status = await pollUntil(async () => {
      const s = await callToolExpectOk(request, mcpSessionId, 'get_process_status', { terminal_id: terminalId });
      return s.processes.some((p) => p.command === 'sleep') ? s : null;
    });
    expect(status.processes.some((p) => p.command === 'sleep')).toBe(true);
    await callToolExpectOk(request, mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'named', keys: ['C-c'] });
  });
});

test.describe('list_active_ports', () => {
  test('lists the MCP server\'s own listening port', async ({ request, mcpSessionId }) => {
    const result = await callToolExpectOk(request, mcpSessionId, 'list_active_ports', { protocol: 'tcp' });
    expect(result.protocol).toBe('tcp');
    expect(Array.isArray(result.ports)).toBe(true);
    expect(result.ports.some((p) => p.localPort === Number(MCP_PORT))).toBe(true);
  });

  test('protocol defaults to "all" when omitted', async ({ request, mcpSessionId }) => {
    const result = await callToolExpectOk(request, mcpSessionId, 'list_active_ports', {});
    expect(result.protocol).toBe('all');
  });
});

test.describe('session management (list_sessions, create_session, close_session)', () => {
  test('create_session, list_sessions, and close_session cover the full lifecycle through MCP alone', async ({ request, mcpSessionId }) => {
    const created = await callToolExpectOk(request, mcpSessionId, 'create_session', { label: 'mcp-lifecycle-test' });
    expect(created.label).toBe('mcp-lifecycle-test');
    expect(created.status).toBe('starting');
    expect(created.terminal_id).toMatch(/^[a-f0-9]{12}$/);

    const afterCreate = await callToolExpectOk(request, mcpSessionId, 'list_sessions', {});
    expect(afterCreate.sessions.some((s) => s.terminal_id === created.terminal_id)).toBe(true);

    // create_session returns as soon as the session is spawned, before ttyd has
    // necessarily finished starting (status starts as "starting", not "running" --
    // see server/session-manager.js's spawnSession). Wait for "running" before
    // acting on it, the same race class fixed in the HTTP proxy path (see
    // docs/ai/mistakes.md 2026-07-29-023).
    await pollUntil(async () => {
      const list = await callToolExpectOk(request, mcpSessionId, 'list_sessions', {});
      const entry = list.sessions.find((s) => s.terminal_id === created.terminal_id);
      return entry && entry.status === 'running' ? entry : null;
    });

    // Prove the session is real, not just a registry entry -- act on it via
    // an existing tool exactly as an agent would after discovering it.
    await runAndWaitForOutput(request, mcpSessionId, created.terminal_id, 'echo mcp_created_session_works', 'mcp_created_session_works');

    const closed = await callToolExpectOk(request, mcpSessionId, 'close_session', { terminal_id: created.terminal_id });
    expect(closed).toEqual({ terminal_id: created.terminal_id, closed: true });

    const afterClose = await callToolExpectOk(request, mcpSessionId, 'list_sessions', {});
    expect(afterClose.sessions.some((s) => s.terminal_id === created.terminal_id)).toBe(false);
  });

  test('create_session works with no label', async ({ request, mcpSessionId }) => {
    const created = await callToolExpectOk(request, mcpSessionId, 'create_session', {});
    expect(created.label).toBeTruthy(); // spawnSession() defaults it
    await callToolExpectOk(request, mcpSessionId, 'close_session', { terminal_id: created.terminal_id });
  });

  test('close_session rejects an unknown terminal_id', async ({ request, mcpSessionId }) => {
    const { result } = await callTool(request, mcpSessionId, 'close_session', { terminal_id: 'ffffffffffff' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No session found/);
  });

  test('close_session rejects a malformed terminal_id', async ({ request, mcpSessionId }) => {
    const { result } = await callTool(request, mcpSessionId, 'close_session', { terminal_id: 'not-a-valid-id' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid terminal_id/);
  });

  test('list_sessions reflects sessions created via the HTTP API too, not just via MCP', async ({ request, mcpSessionId, terminalId }) => {
    const result = await callToolExpectOk(request, mcpSessionId, 'list_sessions', {});
    expect(result.sessions.some((s) => s.terminal_id === terminalId)).toBe(true);
  });
});
