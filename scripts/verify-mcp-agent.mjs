#!/usr/bin/env node
/**
 * NomadTTY — independent MCP end-to-end verification agent.
 *
 * Acts as a minimal, standalone MCP client (raw fetch + hand-rolled
 * JSON-RPC/SSE parsing — no @modelcontextprotocol/sdk, no test framework)
 * to prove the server's Streamable HTTP transport actually works over the
 * wire, independent of the server's own client-side assumptions. It:
 *
 *   1. Creates a real terminal session via the Session Manager API.
 *   2. Authenticates to the MCP server with a bearer token and completes
 *      the `initialize` handshake.
 *   3. Calls `type_command` to inject a uniquely-markered `echo` command.
 *   4. Calls `get_screenshot` and asserts the marker is visible in the
 *      returned viewport snapshot -- proving type_command -> shell
 *      execution -> get_screenshot is a working, observable round trip.
 *   5. Cleans up the session it created.
 *
 * Usage:
 *   MCP_AUTH_TOKEN=<token> node scripts/verify-mcp-agent.mjs
 *
 * Env vars (all optional except MCP_AUTH_TOKEN when the server enforces one):
 *   SESSION_MANAGER_HOST (default 127.0.0.1), SESSION_MANAGER_PORT (default 4000)
 *   MCP_HOST (default 127.0.0.1), MCP_PORT (default 4200)
 *   MCP_AUTH_TOKEN (no default)
 *
 * Exits 0 on success, 1 on any failed step (CI-friendly).
 */

const SESSION_MANAGER_HOST = process.env.SESSION_MANAGER_HOST || '127.0.0.1';
const SESSION_MANAGER_PORT = process.env.SESSION_MANAGER_PORT || '4000';
const MCP_HOST = process.env.MCP_HOST || '127.0.0.1';
const MCP_PORT = process.env.MCP_PORT || '4200';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';

const SESSION_MANAGER_URL = `http://${SESSION_MANAGER_HOST}:${SESSION_MANAGER_PORT}`;
const MCP_URL = `http://${MCP_HOST}:${MCP_PORT}/mcp`;

let step = 0;
function log(msg) {
  console.log(`[verify-mcp-agent] ${msg}`);
}
function fail(msg) {
  console.error(`[verify-mcp-agent] FAIL (step ${step}): ${msg}`);
  process.exit(1);
}

/** Parses a Streamable HTTP SSE response body and returns the single JSON-RPC message it carries. */
function parseSingleSseMessage(body) {
  const dataLines = body.split('\n').filter((l) => l.startsWith('data:'));
  if (!dataLines.length) throw new Error(`no SSE "data:" line in response body: ${JSON.stringify(body)}`);
  return JSON.parse(dataLines[0].slice(5).trim());
}

async function mcpRequest(sessionId, payload) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (MCP_AUTH_TOKEN) headers['Authorization'] = `Bearer ${MCP_AUTH_TOKEN}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const bodyText = await res.text();
  if (res.status === 401) throw new Error(`401 Unauthorized -- is MCP_AUTH_TOKEN correct? Body: ${bodyText}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${bodyText}`);
  return { sessionId: res.headers.get('mcp-session-id') || sessionId, message: parseSingleSseMessage(bodyText) };
}

async function callTool(sessionId, name, args) {
  const { message } = await mcpRequest(sessionId, {
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args },
  });
  if (message.error) throw new Error(`tools/call ${name} returned a protocol error: ${JSON.stringify(message.error)}`);
  const result = message.result;
  if (result.isError) throw new Error(`tools/call ${name} returned isError: ${JSON.stringify(result.content)}`);
  return JSON.parse(result.content[0].text);
}

async function main() {
  step = 1;
  log(`Creating a terminal session via ${SESSION_MANAGER_URL} ...`);
  const createRes = await fetch(`${SESSION_MANAGER_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'mcp-agent-verify' }),
  });
  if (!createRes.ok) fail(`Session Manager POST /api/sessions failed: HTTP ${createRes.status}`);
  const { id: terminalId } = await createRes.json();
  log(`Session created: terminal_id=${terminalId}`);

  try {
    step = 2;
    log(`Authenticating and initializing MCP session at ${MCP_URL} ...`);
    const { sessionId, message: initMsg } = await mcpRequest(undefined, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-03-26', capabilities: {},
        clientInfo: { name: 'nomadtty-verify-mcp-agent', version: '1.0.0' },
      },
    });
    if (!sessionId) fail('initialize response did not include an Mcp-Session-Id header');
    if (initMsg.error) fail(`initialize returned a protocol error: ${JSON.stringify(initMsg.error)}`);
    log(`Authenticated. MCP session id: ${sessionId}`);

    step = 3;
    const marker = `mcp_agent_verify_${Date.now()}`;
    log(`Calling type_command to inject "echo ${marker}" ...`);
    await callTool(sessionId, 'type_command', { terminal_id: terminalId, text: `echo ${marker}` });

    step = 4;
    // Give the shell a brief moment to actually execute before screenshotting.
    await new Promise((r) => setTimeout(r, 500));
    log('Calling get_screenshot to capture the terminal\'s visual state ...');
    const screenshot = await callTool(sessionId, 'get_screenshot', { terminal_id: terminalId });

    if (!screenshot.content || !screenshot.content.includes(marker)) {
      fail(`get_screenshot's viewport did not contain the expected marker "${marker}".\nCaptured content:\n${screenshot.content}`);
    }
    log(`Marker found in get_screenshot output -- type_command -> shell -> get_screenshot round trip verified.`);
    log(`Captured viewport:\n${screenshot.content}`);

    console.log('\n[verify-mcp-agent] PASS: end-to-end MCP viability confirmed (type_command + get_screenshot).');
  } finally {
    step = 5;
    log(`Cleaning up: closing terminal session ${terminalId} ...`);
    await fetch(`${SESSION_MANAGER_URL}/api/sessions/${terminalId}`, { method: 'DELETE' }).catch(() => {});
  }
}

main().catch((err) => fail(err.stack || err.message));
