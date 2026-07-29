#!/usr/bin/env node
/* NomadTTY — MCP server authentication.
 *
 * type_command and send_keystroke give an MCP client the same power as
 * anyone typing at the terminal directly — the tool's whole purpose is
 * running arbitrary commands. That means content filtering cannot be the
 * security boundary (see validation.js). The actual boundary is: who is
 * allowed to open a connection at all. This module enforces a bearer
 * token on every /mcp request, and refuses to bind to a non-loopback
 * interface without one configured (unless explicitly overridden), so
 * "LAN-accessible" never silently means "LAN-open."
 */

'use strict';

const crypto = require('crypto');

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const MCP_ALLOW_INSECURE = process.env.MCP_ALLOW_INSECURE === '1';

function isLoopback(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/**
 * Called once at startup. Throws with a clear operator-facing message
 * rather than silently exposing an unauthenticated terminal-control
 * endpoint to the LAN.
 */
function assertBootSecurityPolicy(host) {
  if (!MCP_AUTH_TOKEN && !isLoopback(host) && !MCP_ALLOW_INSECURE) {
    throw new Error(
      `Refusing to start the MCP server on ${host} (non-loopback) without MCP_AUTH_TOKEN set.\n` +
      `type_command/send_keystroke give any caller full shell access to this host's terminals.\n` +
      `Set MCP_AUTH_TOKEN to a long random value, or set MCP_HOST=127.0.0.1 for local-only access,\n` +
      `or set MCP_ALLOW_INSECURE=1 to explicitly accept the risk (not recommended).`
    );
  }
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Returns true if the request is authorized (or auth is intentionally disabled). */
function isAuthorized(req) {
  if (!MCP_AUTH_TOKEN) return true; // only reachable in loopback or MCP_ALLOW_INSECURE mode
  const header = req.headers['authorization'] || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(match[1], MCP_AUTH_TOKEN);
}

module.exports = { assertBootSecurityPolicy, isAuthorized, isLoopback, MCP_AUTH_TOKEN };
