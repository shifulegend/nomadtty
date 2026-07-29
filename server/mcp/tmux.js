#!/usr/bin/env node
/* NomadTTY — tmux/process primitives for the MCP server.
 *
 * Every MCP tool that touches a terminal goes through this file, and this
 * file is the ONLY place in the MCP server that shells out to the OS. All
 * calls use execFileSync/execFile with an argv array (never `exec`/
 * `shell: true`), so arbitrary bytes in a terminal_id, command string, or
 * key name can never be interpreted by a shell — they can only ever be a
 * single literal argv element to `tmux`/`ps`/`ss`. That is the actual
 * injection defense here, not pattern-matching command content (see
 * validation.js and tools.js for why content-level "dangerous command"
 * filtering is deliberately just a best-effort second layer, not the
 * security boundary).
 */

'use strict';

const { execFileSync } = require('child_process');

function tmux(args) {
  return execFileSync('tmux', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function paneExists(tmuxName) {
  try {
    execFileSync('tmux', ['has-session', '-t', tmuxName], { stdio: 'ignore' });
    return true;
  } catch (_e) {
    return false;
  }
}

/** Single round-trip for the pane metadata every capture/scroll/status tool needs.
 * Uses "|" as the field separator, not a tab: tmux's -F formatter replaces literal
 * control characters (including a literal tab in the format string) with "_",
 * which silently broke a tab-delimited parse here. */
function getPaneInfo(tmuxName) {
  const out = tmux([
    'display-message', '-p', '-t', tmuxName,
    '-F', '#{history_size}|#{pane_width}|#{pane_height}|#{pane_pid}|#{cursor_y}',
  ]).trim();
  const [historySize, width, height, pid, cursorY] = out.split('|').map(Number);
  return { historySize, width, height, pid, cursorY };
}

function capturePane(tmuxName, { ansi = false, start, end } = {}) {
  const args = ['capture-pane', '-t', tmuxName, '-p'];
  if (ansi) args.push('-e');
  if (start !== undefined) args.push('-S', String(start));
  if (end !== undefined) args.push('-E', String(end));
  return tmux(args);
}

/** The entire scrollback + current viewport, oldest line first. */
function captureFull(tmuxName, { ansi = false } = {}) {
  return capturePane(tmuxName, { ansi, start: '-' });
}

/** The first `n` lines of scrollback (oldest history), independent of viewport size. */
function captureHead(tmuxName, n, { ansi = false } = {}) {
  const { historySize } = getPaneInfo(tmuxName);
  const start = -historySize;
  const end = start + n - 1;
  return capturePane(tmuxName, { ansi, start, end });
}

/**
 * The last `n` lines of real output, independent of scrollback size.
 * Anchored to the cursor's current row (`cursor_y`), not the pane's fixed
 * height: a freshly created pane is mostly blank below the prompt, and
 * capture-pane's row numbering always spans the full geometric height, so
 * anchoring on height alone would return blank padding instead of the
 * most recent real content whenever the viewport isn't already full.
 */
function captureTail(tmuxName, n, { ansi = false } = {}) {
  const { cursorY } = getPaneInfo(tmuxName);
  const start = cursorY - n + 1;
  return capturePane(tmuxName, { ansi, start, end: cursorY });
}

/**
 * A snapshot of the pane's current viewport only — the terminal's "visual
 * state" right now, as opposed to any scrollback. This is what
 * get_screenshot and scroll_buffer return: a textual/ANSI capture, since
 * ttyd/tmux is a text-mode PTY with no server-side pixel renderer (see
 * tools.js get_screenshot for the fuller rationale).
 *
 * Anchored on `#{cursor_y}` (where real content currently ends), not row 0
 * (the pane's fixed geometric top): tmux row numbering treats row 0 as the
 * top of the pane/history boundary, counting *down* from there, so
 * `offsetFromBottom=0` naively computed as `[-height+1, 0]` would capture
 * a window ending at the very top of the pane instead of at the live
 * cursor position -- correct only by coincidence once a pane is already
 * completely full (cursor sits at height-1, same as the naive "0").
 * See mistakes.md 2026-07-29-008 for the sibling bug this mirrors in
 * captureTail().
 */
function captureViewport(tmuxName, { ansi = false, offsetFromBottom = 0 } = {}) {
  const { height, cursorY } = getPaneInfo(tmuxName);
  const end = cursorY - offsetFromBottom;
  const start = end - height + 1;
  return capturePane(tmuxName, { ansi, start, end });
}

/** Injects literal text as if typed, with no key-name interpretation. */
function sendLiteral(tmuxName, text) {
  tmux(['send-keys', '-t', tmuxName, '-l', '--', text]);
}

function sendEnter(tmuxName) {
  tmux(['send-keys', '-t', tmuxName, 'Enter']);
}

/** `keys` must already be validated tmux key-name tokens (see validation.js). */
function sendNamedKeys(tmuxName, keys) {
  tmux(['send-keys', '-t', tmuxName, '--', ...keys]);
}

/** `hexBytes` must already be validated 2-digit hex strings (see validation.js). */
function sendHexKeys(tmuxName, hexBytes) {
  tmux(['send-keys', '-t', tmuxName, '-H', '--', ...hexBytes]);
}

/** The pane's process and every descendant, via `ps`'s own tree fields (no `pstree` dependency). */
function processTree(rootPid) {
  const out = execFileSync(
    'ps', ['-e', '-o', 'pid=,ppid=,pcpu=,pmem=,etime=,stat=,comm='],
    { encoding: 'utf8' }
  );
  const rows = out.split('\n').filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (!m) return null;
    return {
      pid: Number(m[1]), ppid: Number(m[2]), cpuPercent: Number(m[3]),
      memPercent: Number(m[4]), elapsed: m[5], state: m[6], command: m[7],
    };
  }).filter(Boolean);

  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }
  const root = rows.find((r) => r.pid === rootPid);
  if (!root) return [];
  const result = [root];
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift();
    for (const child of byParent.get(pid) || []) {
      result.push(child);
      queue.push(child.pid);
    }
  }
  return result;
}

/** Listening sockets host-wide, via `ss` (present on any NomadTTY host — iproute2 is a base package). */
function listeningSockets({ protocol = 'all' } = {}) {
  const flags = [];
  if (protocol === 'tcp' || protocol === 'all') flags.push('-tlnp');
  if (protocol === 'udp' || protocol === 'all') flags.push('-ulnp');

  const results = [];
  for (const flag of flags) {
    let out;
    try {
      out = execFileSync('ss', ['-H', flag], { encoding: 'utf8' });
    } catch (_e) {
      continue; // ss unavailable or no permission for -p on some sockets; best-effort.
    }
    const proto = flag.startsWith('-t') ? 'tcp' : 'udp';
    for (const line of out.split('\n').filter(Boolean)) {
      const cols = line.trim().split(/\s+/);
      const localAddr = cols[3] || '';
      const lastColon = localAddr.lastIndexOf(':');
      const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      results.push({
        protocol: proto,
        localAddress: lastColon >= 0 ? localAddr.slice(0, lastColon) : localAddr,
        localPort: lastColon >= 0 ? Number(localAddr.slice(lastColon + 1)) : null,
        process: processMatch ? processMatch[1] : null,
        pid: processMatch ? Number(processMatch[2]) : null,
      });
    }
  }
  return results;
}

module.exports = {
  paneExists, getPaneInfo, capturePane, captureFull, captureHead, captureTail,
  captureViewport, sendLiteral, sendEnter, sendNamedKeys, sendHexKeys,
  processTree, listeningSockets,
};
