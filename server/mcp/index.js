#!/usr/bin/env node
/* NomadTTY — MCP server (HTTP Streamable transport).
 *
 * Mounts the MCP "Streamable HTTP" transport (JSON-RPC over POST, with an
 * optional upgrade to text/event-stream for streaming responses, plus a
 * standing GET SSE stream for server-initiated messages) at /mcp, on its
 * own HTTP listener within this same process. It shares the live
 * `sessions` registry from session-manager.js directly (in-memory, same
 * process) rather than talking to it over the network — this is what
 * "attached to the existing backend architecture" means here: same
 * process, same terminal registry, a second listener.
 *
 * It is a second listener rather than a second route on the existing
 * Session Manager HTTP server on purpose: that server binds to 127.0.0.1
 * only and has no authentication of its own (see docs/ai/decision-log.md).
 * Making the MCP endpoint LAN-reachable by widening THAT bind would have
 * silently exposed the unauthenticated Session Manager UI/API to the LAN
 * too. Keeping them on separate listeners lets the MCP server (which does
 * enforce a bearer token — see auth.js) be LAN-facing without changing the
 * Session Manager's existing security posture at all.
 */

'use strict';

const http = require('http');
const { randomUUID } = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');

const auth = require('./auth');
const { registerTools } = require('./tools');

const MCP_PORT = parseInt(process.env.MCP_PORT || '4200', 10);
const MCP_HOST = process.env.MCP_HOST || '0.0.0.0';

function createMcpServer(sessions) {
  const server = new McpServer(
    { name: 'nomadtty', version: require('../../package.json').version },
    { capabilities: { tools: {}, logging: {} } }
  );
  registerTools(server, { sessions });
  return server;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB is generous for a JSON-RPC tool call
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (_e) {
        reject(Object.assign(new Error('invalid JSON'), { statusCode: 400, rpcParseError: true }));
      }
    });
    req.on('error', reject);
  });
}

function sendJsonRpcError(res, status, code, message, id = null) {
  const body = JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id });
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Builds the /mcp request handler. `sessions` is the live registry from
 * server/session-manager.js (a Map<terminal_id, entry>) — tools read it
 * directly, so they always see whatever sessions currently exist.
 */
function createMcpRequestHandler({ sessions }) {
  const transports = new Map();

  async function handlePost(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJsonRpcError(res, err.statusCode || 400, err.rpcParseError ? -32700 : -32000, err.message);
    }

    const sessionId = req.headers['mcp-session-id'];
    try {
      if (sessionId && transports.has(sessionId)) {
        return await transports.get(sessionId).handleRequest(req, res, body);
      }
      if (!sessionId && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => transports.set(id, transport),
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };
        const mcpServer = createMcpServer(sessions);
        await mcpServer.connect(transport);
        return await transport.handleRequest(req, res, body);
      }
      return sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
    } catch (err) {
      if (!res.headersSent) sendJsonRpcError(res, 500, -32603, `Internal server error: ${err.message}`);
    }
  }

  async function handleGetOrDelete(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId && transports.get(sessionId);
    if (!transport) return sendJsonRpcError(res, 400, -32000, 'Invalid or missing Mcp-Session-Id header');
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) sendJsonRpcError(res, 500, -32603, `Internal server error: ${err.message}`);
    }
  }

  async function requestListener(req, res) {
    if (!auth.isAuthorized(req)) {
      return sendJsonRpcError(res, 401, -32001, 'Unauthorized: missing or invalid bearer token');
    }
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'GET' || req.method === 'DELETE') return handleGetOrDelete(req, res);
    res.writeHead(405, { Allow: 'GET, POST, DELETE' });
    res.end();
  }

  async function closeAll() {
    for (const [id, transport] of transports) {
      try { await transport.close(); } catch (_e) { /* best-effort */ }
      transports.delete(id);
    }
  }

  return { requestListener, closeAll, transportCount: () => transports.size };
}

function start(sessions) {
  auth.assertBootSecurityPolicy(MCP_HOST);
  const { requestListener, closeAll } = createMcpRequestHandler({ sessions });

  const httpServer = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/mcp') {
      res.writeHead(404);
      return res.end('Not found');
    }
    requestListener(req, res);
  });

  httpServer.listen(MCP_PORT, MCP_HOST, () => {
    console.log(`NomadTTY MCP server listening on ${MCP_HOST}:${MCP_PORT} (POST/GET/DELETE /mcp)`);
    if (!auth.MCP_AUTH_TOKEN) {
      console.warn('WARNING: MCP_AUTH_TOKEN is not set — the MCP endpoint is unauthenticated.');
    }
  });

  httpServer.on('close', closeAll);
  return { httpServer, closeAll };
}

module.exports = { start, createMcpRequestHandler, MCP_PORT, MCP_HOST };
