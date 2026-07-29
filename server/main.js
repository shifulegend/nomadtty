#!/usr/bin/env node
/* NomadTTY — composition root.
 *
 * Starts both HTTP listeners that make up the backend in one process:
 *   - the Session Manager (127.0.0.1 only, UI + ttyd/tmux reverse proxy)
 *   - the MCP server (LAN-facing by default, terminal-control tools)
 * They share the same in-memory session registry directly (no network
 * hop between them) — see server/mcp/index.js for why the MCP server is
 * still a separate listener rather than a route on the Session Manager's
 * own server.
 *
 * `node server/session-manager.js` still works standalone unchanged (the
 * existing Playwright suite under tests/ depends on exactly that); this
 * file is the additional entry point for running the full backend,
 * including the MCP server, as a single process with coordinated
 * shutdown.
 */

'use strict';

const sessionManager = require('./session-manager');
const mcp = require('./mcp');

const sessionManagerServer = sessionManager.start();
const { httpServer: mcpServer, closeAll: closeMcpTransports } = mcp.start(sessionManager.sessions);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('NomadTTY: shutting down...');
  sessionManager.shutdownAllSessions();
  closeMcpTransports().finally(() => {
    mcpServer.close();
    sessionManagerServer.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
