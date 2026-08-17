'use strict';
/* Throwaway debug script: reproduces the send_keystroke hex-mode test manually,
 * printing raw get_screenshot content on every poll iteration. Not part of the
 * suite; delete after the investigation. */
const { chromium } = require('playwright');
process.env.SESSION_MANAGER_PORT = '4171';
process.env.TTYD_BASE_PORT = '48910';
process.env.MCP_PORT = '4172';
process.env.MCP_HOST = '127.0.0.1';
process.env.MCP_AUTH_TOKEN = 'test-suite-fixed-token-do-not-use-in-production';

const { spawn } = require('child_process');
const path = require('path');

async function main() {
  const server = spawn('node', [path.join(__dirname, '..', 'server', 'main.js')], {
    env: process.env,
    stdio: 'inherit',
  });

  await new Promise((r) => setTimeout(r, 2000));

  const BASE_URL = 'http://127.0.0.1:4171';
  const MCP_URL = 'http://127.0.0.1:4172/mcp';
  const TOKEN = process.env.MCP_AUTH_TOKEN;

  const fetch = global.fetch;

  async function apiCreateSession() {
    const res = await fetch(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'debug-hexmode' }),
    });
    const j = await res.json();
    return j.id || j.terminal_id;
  }

  function parseSse(text) {
    return text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()));
  }

  async function post(body, sessionId) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${TOKEN}` };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    return { res, messages: text ? parseSse(text) : [] };
  }

  async function initMcp() {
    const { res, messages } = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'debug', version: '1.0.0' } },
    });
    return res.headers.get('mcp-session-id');
  }

  let nextId = 100;
  async function callTool(sessionId, name, args) {
    const { messages } = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, sessionId);
    const msg = messages[messages.length - 1];
    if (msg.error) throw new Error(JSON.stringify(msg.error));
    return JSON.parse(msg.result.content[0].text);
  }

  const terminalId = await apiCreateSession();
  console.log('terminal_id:', terminalId);
  const mcpSessionId = await initMcp();
  console.log('mcp session:', mcpSessionId);

  const marker = `hexsubmit_debugtest123456789abcdef`;
  console.log('marker:', marker, 'length:', marker.length);

  const typed = await callTool(mcpSessionId, 'type_command', { terminal_id: terminalId, text: `echo ${marker}`, submit: false });
  console.log('type_command result:', typed);

  const sent = await callTool(mcpSessionId, 'send_keystroke', { terminal_id: terminalId, mode: 'hex', hex: ['0d'] });
  console.log('send_keystroke result:', sent);

  const start = Date.now();
  let iter = 0;
  let found = false;
  while (Date.now() - start < 8000) {
    iter++;
    const shot = await callTool(mcpSessionId, 'get_screenshot', { terminal_id: terminalId });
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = new RegExp(`(?:^|\\r?\\n)${escaped}[ \\t]*\\r?\\n`).test(shot.content);
    console.log(`--- iter ${iter} (t=${Date.now() - start}ms) match=${matches} ---`);
    console.log(JSON.stringify(shot.content));
    if (matches) { found = true; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log('FOUND:', found, 'after', iter, 'iterations,', Date.now() - start, 'ms');

  server.kill();
  process.exit(found ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
