#!/usr/bin/env node
/* NomadTTY — MCP input validation.
 *
 * The security boundary for a terminal-control tool is authentication +
 * network exposure (see auth.js), not filtering command content — a tool
 * whose entire purpose is "run what the agent says" cannot also refuse to
 * run things, or it stops being that tool. What IS this module's job:
 *   1. Reject structurally malformed input before it ever reaches a child
 *      process (wrong types, oversized payloads, NUL bytes, IDs that
 *      aren't real session IDs).
 *   2. Restrict `send_keystroke` to an explicit allowlist grammar. This
 *      isn't about stopping a malicious *command* (there is no command
 *      here, just a key name) — it's about preventing a key value that
 *      looks like a CLI flag (e.g. "-t") from being misparsed by tmux's
 *      own argument parser. tmux.js already passes every argument as a
 *      discrete argv element (never through a shell), so this is closing
 *      an argv-confusion gap, not a shell-injection gap.
 *   3. Offer an optional, best-effort denylist for `type_command` as a
 *      defense-in-depth speed bump against obviously destructive
 *      one-liners landing via prompt injection. It is explicitly not a
 *      sandbox and is documented as such — see DENYLIST_PATTERNS below.
 */

'use strict';

const TERMINAL_ID_RE = /^[a-f0-9]{12}$/;
const NAMED_KEY_RE = /^(?:C-|M-|S-)*(?:F(?:[1-9]|1[0-2])|[A-Za-z0-9]|Enter|Escape|Tab|Space|BSpace|BTab|Up|Down|Left|Right|Home|End|PageUp|PageDown|NPage|PPage|Insert|Delete)$/;
const HEX_BYTE_RE = /^[0-9a-fA-F]{2}$/;

const MAX_TEXT_BYTES = parseInt(process.env.MCP_MAX_TEXT_BYTES || '8192', 10);
const MAX_KEYS_PER_CALL = parseInt(process.env.MCP_MAX_KEYS_PER_CALL || '32', 10);
const MAX_LINES_REQUEST = parseInt(process.env.MCP_MAX_LINES_REQUEST || '5000', 10);
const MAX_FULL_CAPTURE_LINES = parseInt(process.env.MCP_MAX_CAPTURE_LINES || '5000', 10);
const DENYLIST_ENABLED = process.env.MCP_DENYLIST_ENABLED !== '0';

// Best-effort only (see module docstring): exact/obvious destructive
// one-liners, not a security guarantee. Extend via MCP_DENYLIST_EXTRA
// (comma-separated regex source strings) without editing code.
const DENYLIST_PATTERNS = [
  /\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+\/(?:\s|$)/i,
  /\bmkfs\b/i,
  /\bdd\s+.*of=\/dev\/(sd|nvme|hd|vd)/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  /\b(shutdown|reboot|poweroff|halt)\b\s*(-[a-z]*\s*)*(now)?/i,
  />\s*\/dev\/sd[a-z]/i,
];
if (process.env.MCP_DENYLIST_EXTRA) {
  for (const src of process.env.MCP_DENYLIST_EXTRA.split(',').map((s) => s.trim()).filter(Boolean)) {
    try { DENYLIST_PATTERNS.push(new RegExp(src, 'i')); } catch (_e) { /* ignore bad pattern */ }
  }
}

class ToolInputError extends Error {}

function requireTerminalId(sessions, terminalId) {
  if (typeof terminalId !== 'string' || !TERMINAL_ID_RE.test(terminalId)) {
    throw new ToolInputError(`Invalid terminal_id: expected a 12-character hex session id.`);
  }
  const entry = sessions.get(terminalId);
  if (!entry) throw new ToolInputError(`No session found for terminal_id "${terminalId}".`);
  if (entry.status !== 'running') {
    throw new ToolInputError(`Session "${terminalId}" is not running (status: ${entry.status}).`);
  }
  return entry;
}

function requireText(text, { fieldName = 'text' } = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ToolInputError(`${fieldName} must be a non-empty string.`);
  }
  if (text.indexOf('\u0000') !== -1) {
    throw new ToolInputError(`${fieldName} must not contain NUL bytes.`);
  }
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > MAX_TEXT_BYTES) {
    throw new ToolInputError(`${fieldName} is ${byteLength} bytes, exceeding the ${MAX_TEXT_BYTES}-byte limit (MCP_MAX_TEXT_BYTES).`);
  }
  return text;
}

/** Returns the first denylist match, or null. Advisory only — see module docstring. */
function findDenylistMatch(text) {
  if (!DENYLIST_ENABLED) return null;
  for (const pattern of DENYLIST_PATTERNS) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

function requireNamedKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new ToolInputError('keys must be a non-empty array of key names (e.g. ["C-c"], ["M-F4"]).');
  }
  if (keys.length > MAX_KEYS_PER_CALL) {
    throw new ToolInputError(`keys exceeds the ${MAX_KEYS_PER_CALL}-key limit per call (MCP_MAX_KEYS_PER_CALL).`);
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !NAMED_KEY_RE.test(key)) {
      throw new ToolInputError(`Invalid key "${key}". Expected tmux key-notation, e.g. "C-c", "M-F4", "Enter", "Up".`);
    }
  }
  return keys;
}

function requireHexKeys(hex) {
  if (!Array.isArray(hex) || hex.length === 0) {
    throw new ToolInputError('hex must be a non-empty array of 2-digit hex byte strings (e.g. ["1b", "5b", "41"]).');
  }
  if (hex.length > MAX_KEYS_PER_CALL) {
    throw new ToolInputError(`hex exceeds the ${MAX_KEYS_PER_CALL}-byte limit per call (MCP_MAX_KEYS_PER_CALL).`);
  }
  for (const byte of hex) {
    if (typeof byte !== 'string' || !HEX_BYTE_RE.test(byte)) {
      throw new ToolInputError(`Invalid hex byte "${byte}". Expected exactly 2 hex digits, e.g. "1b".`);
    }
  }
  return hex;
}

function requireLineCount(lines, { fieldName = 'lines' } = {}) {
  if (!Number.isInteger(lines) || lines < 1) {
    throw new ToolInputError(`${fieldName} must be a positive integer.`);
  }
  if (lines > MAX_LINES_REQUEST) {
    throw new ToolInputError(`${fieldName} exceeds the ${MAX_LINES_REQUEST}-line limit per request (MCP_MAX_LINES_REQUEST).`);
  }
  return lines;
}

module.exports = {
  TERMINAL_ID_RE, NAMED_KEY_RE, HEX_BYTE_RE,
  MAX_TEXT_BYTES, MAX_KEYS_PER_CALL, MAX_LINES_REQUEST, MAX_FULL_CAPTURE_LINES,
  ToolInputError,
  requireTerminalId, requireText, findDenylistMatch,
  requireNamedKeys, requireHexKeys, requireLineCount,
};
