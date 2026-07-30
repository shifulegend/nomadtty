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
const fs = require('fs');

function tmux(args) {
  return execFileSync('tmux', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/* Copy-mode commands (below) are driven from a fresh, one-shot `tmux <cmd>`
 * invocation, never from an actual attached client -- unlike ttyd's own
 * connection, which IS a real client. `tmux send-keys -X ...` (copy-mode
 * commands) run this way was fast and safe in every no-real-client-attached
 * test run; a genuinely attached-client run could not be fully reproduced
 * in this environment (ttyd only registers as a tmux client after its own
 * WS subprotocol handshake, not a bare WebSocket upgrade), so that
 * condition is NOT empirically confirmed safe -- unlike the plain
 * (non -X) send-keys path below, which WAS confirmed unsafe with a real
 * client attached (observed hang, see docs/ai/decision-log.md). A bounded
 * timeout is applied here defensively for that unresolved gap:
 * `execFileSync` has no default timeout, and a hang would block this
 * entire single-threaded Node process, not just one call. */
const COPY_MODE_TIMEOUT_MS = 2000;
function tmuxBounded(args) {
  return execFileSync('tmux', args, { encoding: 'utf8', timeout: COPY_MODE_TIMEOUT_MS });
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

/**
 * `-J` rejoins tmux's own wrapped display lines (tmux tracks which rows
 * wrapped from the previous one) back into single logical lines, instead of
 * emitting a `\n` after every physical row regardless of wrapping. Without
 * it, any captured text longer than the pane's column width -- e.g. a long
 * marker string, or its echoed input -- silently splits across two or more
 * "lines" in the plain-text output, breaking any check that requires it to
 * appear as one complete line (outputHasOwnLine() in
 * tests/helpers/mcp-client.js, and the analogous waitForOutputLine() in
 * tests/helpers/ws-capture.js) even though nothing is actually wrong with
 * the terminal or the command that ran. Purely a text-formatting flag --
 * it does not change which rows `-S`/`-E` address, so every existing
 * cursor_y/history_size-anchored range computed elsewhere in this file
 * stays correct.
 */
function capturePane(tmuxName, { ansi = false, start, end } = {}) {
  const args = ['capture-pane', '-t', tmuxName, '-p', '-J'];
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

/**
 * True if the pane is currently in tmux copy-mode -- i.e. a client (the
 * browser's "Hist" toggle, see server/session-manager.js) has frozen the
 * live view to page through scrollback. This always asks tmux directly
 * (not the in-memory tracking below) -- used only from the low-frequency
 * copy-mode-driving path itself, never from the send* hot path.
 */
function isInCopyMode(tmuxName) {
  return tmuxBounded(['display-message', '-p', '-t', tmuxName, '-F', '#{pane_in_mode}']).trim() === '1';
}

/* In-memory mirror of "did OUR code put this pane in copy-mode", checked by
 * exitCopyModeIfActive() below before paying for a real `tmux
 * display-message` round trip. Measured: adding the unconditional real
 * check to every MCP send call roughly doubled its latency (3.4ms -> 7.7ms
 * per call on a 2-core Colab VM), enough to push some send-heavy tests
 * (many sequential type_command/send_keystroke calls) over their existing
 * timeout budgets -- a real, measured regression, not a correctness one.
 * Set/cleared only by enterCopyMode/exitCopyModeIfActive/scrollCopyMode
 * below, i.e. only by this app's own copy-mode control surface (kb.js's
 * "Hist" toggle). A pane put into copy-mode through some OTHER path
 * (manual tmux commands over direct shell access, not through this app at
 * all) would not be reflected here -- accepted: this project's own
 * threat model already treats "has direct shell access" as equivalent to
 * "already has full control," so this narrows an already-out-of-scope edge
 * case rather than reopening the interference bug for any path this app
 * actually exposes. */
const knownCopyModePanes = new Set();

/** Enters copy-mode without moving the view. */
function enterCopyMode(tmuxName) {
  tmuxBounded(['copy-mode', '-t', tmuxName]);
  knownCopyModePanes.add(tmuxName);
}

/**
 * Forces the pane back to live/shell input, unconditionally safe to call
 * even when the pane is already live (no-ops). Every send* function below
 * calls this FIRST: `tmux send-keys -l`/a plain named key targeting a pane
 * that is in copy-mode was found, empirically, to either fail outright
 * ("no current client", with no client attached at all) or -- with a real
 * persistent pty-backed client attached -- hang indefinitely. Either
 * outcome is unacceptable for an MCP tool call (a hang would freeze this
 * whole single-threaded Node process, not just the one call), so an
 * agent's send must always force the pane back to live first rather than
 * risk either failure mode. This makes an agent's command always win over
 * a concurrent human mid-scroll (see docs/ai/decision-log.md), which is
 * also the more useful behavior: the human sees the agent's new output
 * immediately rather than staying stuck on a stale scrolled-back view.
 * Checks the in-memory set first (near-zero cost) and only pays for a real
 * tmux round trip when it says copy-mode might actually be active.
 */
function exitCopyModeIfActive(tmuxName) {
  if (!knownCopyModePanes.has(tmuxName)) return;
  if (isInCopyMode(tmuxName)) tmuxBounded(['send-keys', '-X', '-t', tmuxName, 'cancel']);
  knownCopyModePanes.delete(tmuxName);
}

/** Pages the copy-mode view by `lines` rows, entering copy-mode first if needed. */
function scrollCopyMode(tmuxName, direction, lines) {
  if (!knownCopyModePanes.has(tmuxName)) enterCopyMode(tmuxName);
  tmuxBounded(['send-keys', '-X', '-t', tmuxName, '-N', String(lines), direction === 'up' ? 'scroll-up' : 'scroll-down']);
}

/** Drops a closed session's entry from the in-memory copy-mode set, called
 * by session-manager.js's closeSession() -- otherwise a tmuxName that was
 * ever scrolled would sit in the Set forever, since kill-session ends the
 * pane without ever going through exitCopyModeIfActive(). */
function forgetPane(tmuxName) {
  knownCopyModePanes.delete(tmuxName);
}

/** Injects literal text as if typed, with no key-name interpretation. */
function sendLiteral(tmuxName, text) {
  exitCopyModeIfActive(tmuxName);
  tmux(['send-keys', '-t', tmuxName, '-l', '--', text]);
}

function sendEnter(tmuxName) {
  exitCopyModeIfActive(tmuxName);
  tmux(['send-keys', '-t', tmuxName, 'Enter']);
}

/** `keys` must already be validated tmux key-name tokens (see validation.js). */
function sendNamedKeys(tmuxName, keys) {
  exitCopyModeIfActive(tmuxName);
  tmux(['send-keys', '-t', tmuxName, '--', ...keys]);
}

/** `hexBytes` must already be validated 2-digit hex strings (see validation.js). */
function sendHexKeys(tmuxName, hexBytes) {
  exitCopyModeIfActive(tmuxName);
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

/** Reverses byte order of a hex string 2 chars at a time — /proc/net/tcp{,6}
 * store each address word in host (little-endian on every real Linux target)
 * byte order, not network byte order. */
function reverseHexBytes(hex) {
  let out = '';
  for (let i = hex.length - 2; i >= 0; i -= 2) out += hex.slice(i, i + 2);
  return out;
}

/** "0100007F" (4-byte hex, little-endian) -> "127.0.0.1". */
function hexToIPv4(hex) {
  const be = reverseHexBytes(hex);
  const bytes = [];
  for (let i = 0; i < be.length; i += 2) bytes.push(parseInt(be.slice(i, i + 2), 16));
  return bytes.join('.');
}

/** 32-hex-char IPv6 address (4 little-endian 32-bit words) -> standard hex-group form. */
function hexToIPv6(hex) {
  let bytesHex = '';
  for (let i = 0; i < 32; i += 8) bytesHex += reverseHexBytes(hex.slice(i, i + 8));
  const groups = [];
  for (let i = 0; i < bytesHex.length; i += 4) groups.push(bytesHex.slice(i, i + 4));
  return groups.join(':');
}

/** Parses one line of /proc/net/{tcp,udp}{,6} into {localAddress, localPort, inode},
 * or null for a malformed/header line. TCP callers filter to state 0A (LISTEN);
 * UDP has no equivalent concept, so every bound entry counts as "listening". */
function parseProcNetLine(line, isV6) {
  const cols = line.trim().split(/\s+/);
  if (cols.length < 10) return null;
  const [addrHex, portHex] = (cols[1] || '').split(':');
  if (!addrHex || !portHex) return null;
  return {
    localAddress: isV6 ? hexToIPv6(addrHex) : hexToIPv4(addrHex),
    localPort: parseInt(portHex, 16),
    state: cols[3],
    inode: cols[9],
  };
}

/** Best-effort inode -> {pid, command} map, built by walking /proc/<pid>/fd/*
 * looking for "socket:[<inode>]" symlinks — the same source `ss -p` itself
 * ultimately reads, used here because this fallback path exists specifically
 * for hosts where `ss`/`netstat` (iproute2/net-tools) aren't installed at all.
 * Every failure (a process's fd directory not readable, a race where an fd
 * disappears mid-scan, etc.) is swallowed per-entry: this is strictly
 * best-effort attribution, not required for a socket to be reported. */
function buildInodeToProcessMap() {
  const map = new Map();
  let pids;
  try {
    pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p));
  } catch (_e) {
    return map;
  }
  for (const pid of pids) {
    let fdNames;
    try {
      fdNames = fs.readdirSync(`/proc/${pid}/fd`);
    } catch (_e) {
      continue; // not our process / already exited / no permission
    }
    let matched = false;
    for (const fd of fdNames) {
      let target;
      try {
        target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch (_e) {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(target);
      if (!m) continue;
      matched = true;
      if (!map.has(m[1])) {
        let command = null;
        try {
          command = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        } catch (_e) {
          // process gone between readdir and here; leave command null
        }
        map.set(m[1], { pid: Number(pid), command });
      }
    }
    if (matched) continue;
  }
  return map;
}

/** Pure-Node fallback for listeningSockets() when `ss` isn't available —
 * reads /proc/net/{tcp,tcp6,udp,udp6} directly. Every Linux host exposes
 * these regardless of whether iproute2/net-tools happen to be installed, so
 * this has no external-binary dependency at all. */
function listeningSocketsViaProcfs({ protocol = 'all' } = {}) {
  const results = [];
  const wantTcp = protocol === 'tcp' || protocol === 'all';
  const wantUdp = protocol === 'udp' || protocol === 'all';
  const sources = [
    ...(wantTcp ? [['tcp', '/proc/net/tcp', false], ['tcp', '/proc/net/tcp6', true]] : []),
    ...(wantUdp ? [['udp', '/proc/net/udp', false], ['udp', '/proc/net/udp6', true]] : []),
  ];

  let inodeMap = null; // built lazily, only if at least one socket is found
  for (const [proto, path, isV6] of sources) {
    let content;
    try {
      content = fs.readFileSync(path, 'utf8');
    } catch (_e) {
      continue; // e.g. no IPv6 support on this host — /proc/net/tcp6 absent
    }
    const lines = content.split('\n').slice(1).filter(Boolean);
    for (const line of lines) {
      const parsed = parseProcNetLine(line, isV6);
      if (!parsed) continue;
      if (proto === 'tcp' && parsed.state !== '0A') continue; // not LISTEN
      if (!inodeMap) inodeMap = buildInodeToProcessMap();
      const owner = inodeMap.get(parsed.inode);
      results.push({
        protocol: proto,
        localAddress: parsed.localAddress,
        localPort: parsed.localPort,
        process: owner ? owner.command : null,
        pid: owner ? owner.pid : null,
      });
    }
  }
  return results;
}

/** Listening sockets host-wide. Tries `ss` first (present on most Linux
 * hosts — iproute2 is a base package); falls back to parsing
 * /proc/net/{tcp,udp}{,6} directly on hosts where `ss`/`netstat` aren't
 * installed, rather than silently reporting zero sockets found. */
function listeningSockets({ protocol = 'all' } = {}) {
  const flags = [];
  if (protocol === 'tcp' || protocol === 'all') flags.push('-tlnp');
  if (protocol === 'udp' || protocol === 'all') flags.push('-ulnp');

  const results = [];
  let ssAvailable = true;
  for (const flag of flags) {
    let out;
    try {
      out = execFileSync('ss', ['-H', flag], { encoding: 'utf8' });
    } catch (_e) {
      ssAvailable = false;
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
  if (!ssAvailable && results.length === 0) return listeningSocketsViaProcfs({ protocol });
  return results;
}

module.exports = {
  paneExists, getPaneInfo, capturePane, captureFull, captureHead, captureTail,
  captureViewport, sendLiteral, sendEnter, sendNamedKeys, sendHexKeys,
  processTree, listeningSockets,
  isInCopyMode, enterCopyMode, exitCopyModeIfActive, scrollCopyMode, forgetPane,
};
