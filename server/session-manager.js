#!/usr/bin/env node
/* NomadTTY — Session Manager backend
 * Zero external dependencies (Node core only): http, net, child_process,
 * crypto, fs, path, url.
 *
 * Responsibilities:
 *  - Maintain an in-memory registry of open terminal sessions, keyed by
 *    a unique terminal_id. Each entry maps to a dedicated ttyd process
 *    (bound to 127.0.0.1 on its own port) wrapping a persistent tmux
 *    session of the same name.
 *  - Serve the Session Manager UI at "/" (async JSON API, no blocking).
 *  - Reverse-proxy HTTP + WebSocket traffic for "/term/<id>/*" straight
 *    through to that session's ttyd instance (ttyd is started with
 *    --base-path so its own asset/ws URLs already match the proxy path;
 *    no path rewriting needed).
 *  - Inject the mobile toolbar (kb.js) into the ttyd HTML document the
 *    same way nginx's sub_filter used to, since nginx now forwards
 *    everything to this process.
 *  - On session close: SIGTERM the ttyd process (SIGKILL fallback) AND
 *    kill the underlying tmux session explicitly, so no zombie shell
 *    processes or orphaned tmux servers remain.
 */

'use strict';

const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.SESSION_MANAGER_PORT || '4000', 10);
const TTYD_BASE_PORT = parseInt(process.env.TTYD_BASE_PORT || '47900', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const KB_JS_PATH = path.join(__dirname, '..', 'src', 'kb.js');

/* ── Registry ──
 * Map<terminal_id, {
 *   id, label, port, tmuxName, proc, createdAt, lastJoinedAt, status
 * }>
 * This registry is the single source of truth for "which sessions are
 * open." It intentionally lives in memory, not on disk: tmux itself is
 * the durable state (scrollback, running processes); this map is just
 * bookkeeping for routing + lifecycle.
 */
const sessions = new Map();
const usedPorts = new Set();

function allocatePort() {
  let p = TTYD_BASE_PORT;
  while (usedPorts.has(p)) p++;
  usedPorts.add(p);
  return p;
}

function genId() {
  return crypto.randomBytes(6).toString('hex');
}

/* ── Spawn a new ttyd+tmux session ──
 * tmux session name === terminal_id, so `tmux ls` / kill-session are
 * unambiguous. --base-path scopes ttyd's internal asset + WS URLs to
 * /term/<id>/, so the reverse proxy below needs zero path rewriting. */
function spawnSession(label) {
  const id = genId();
  const port = allocatePort();
  const basePath = '/term/' + id + '/';

  const proc = spawn('ttyd', [
    '--port', String(port),
    '--interface', '127.0.0.1',
    '--writable',
    '--base-path', basePath,
    'tmux', 'new-session', '-A', '-s', id,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const entry = {
    id, label: label || ('Session ' + id.slice(0, 4)),
    port, tmuxName: id, proc,
    createdAt: Date.now(), lastJoinedAt: null,
    status: 'starting',
  };
  sessions.set(id, entry);

  proc.on('spawn', () => { entry.status = 'running'; });
  proc.on('exit', () => {
    entry.status = 'exited';
    usedPorts.delete(port);
  });
  proc.stderr.on('data', () => {}); // swallow; ttyd is verbose on stderr

  return entry;
}

/* ── Cleanly terminate a session: no zombies, no leaked tmux servers ──
 * Called only from the explicit "Close" action in the UI/API. Never
 * called on Back-button navigation or WebSocket disconnects. */
function closeSession(id) {
  const entry = sessions.get(id);
  if (!entry) return false;

  /* 1. Kill the tmux session itself first -- this ends the shell/PTY
     regardless of what happens to the ttyd wrapper process. */
  try {
    execFileSync('tmux', ['kill-session', '-t', entry.tmuxName], { stdio: 'ignore' });
  } catch (e) { /* session may already be gone; not fatal */ }

  /* 2. SIGTERM the ttyd process, escalate to SIGKILL if it doesn't
     exit within 3s. Prevents zombie processes / leaked file descriptors. */
  if (entry.proc && entry.proc.exitCode === null) {
    entry.proc.kill('SIGTERM');
    const proc = entry.proc;
    setTimeout(() => {
      if (proc.exitCode === null) {
        try { proc.kill('SIGKILL'); } catch (e) {}
      }
    }, 3000);
  }

  usedPorts.delete(entry.port);
  sessions.delete(id);
  return true;
}

function listSessions() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    createdAt: s.createdAt,
    lastJoinedAt: s.lastJoinedAt,
  }));
}

/* ── Static file serving (Session Manager UI) ── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ── HTML injection (kb.js toolbar) equivalent to old nginx sub_filter ──
 * Only applied to text/html responses proxied from a session's ttyd. */
function injectToolbar(html) {
  const inject =
    '<meta name="viewport" content="width=device-width,initial-scale=1,' +
    'maximum-scale=1,user-scalable=no,interactive-widget=resizes-content">' +
    '<script>!function(){var O=window.WebSocket;function H(u,p){' +
    'var w=p?new O(u,p):new O(u);if(u&&u.indexOf("/ws")>=0)window._S=w;' +
    'return w}H.prototype=O.prototype;H.CONNECTING=0;H.OPEN=1;H.CLOSING=2;' +
    'H.CLOSED=3;window.WebSocket=H}();</script>' +
    '<script src="/kb.js" defer></script>';
  return html.replace('<head>', '<head>' + inject);
}

/* ── Reverse proxy: HTTP ── */
function proxyHttp(req, res, port, onDone) {
  const upstream = http.request({
    host: '127.0.0.1', port,
    path: req.url, method: req.method,
    headers: Object.assign({}, req.headers, { 'accept-encoding': '' }),
  }, (upRes) => {
    const contentType = upRes.headers['content-type'] || '';
    if (contentType.indexOf('text/html') !== -1) {
      const chunks = [];
      upRes.on('data', (c) => chunks.push(c));
      upRes.on('end', () => {
        const body = injectToolbar(Buffer.concat(chunks).toString('utf8'));
        const headers = Object.assign({}, upRes.headers);
        headers['content-length'] = Buffer.byteLength(body);
        res.writeHead(upRes.statusCode, headers);
        res.end(body);
        if (onDone) onDone();
      });
    } else {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
      upRes.on('end', () => { if (onDone) onDone(); });
    }
  });
  upstream.on('error', () => { res.writeHead(502); res.end('Upstream error'); });
  req.pipe(upstream);
}

/* ── Reverse proxy: WebSocket upgrade (raw socket pipe, no rewriting) ──
 * This is the core of "Join = reconnect WebSocket." A brand-new browser
 * WebSocket handshake arrives at "/term/<id>/ws"; we pipe it straight
 * through to the *same* ttyd process that has been running the whole
 * time. ttyd re-attaches to its wrapped tmux session, which still has
 * the shell's full scrollback buffer, so the reconnect is indistinguishable
 * from having never left, aside from a brief reconnect flash. */
function proxyUpgrade(req, socket, head, port) {
  const upstreamSocket = net.connect(port, '127.0.0.1', () => {
    let rawHeader = req.method + ' ' + req.url + ' HTTP/1.1\r\n';
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      rawHeader += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
    }
    rawHeader += '\r\n';
    upstreamSocket.write(rawHeader);
    if (head && head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });
  upstreamSocket.on('error', () => socket.destroy());
  socket.on('error', () => upstreamSocket.destroy());
}

/* ── JSON body helper ── */
function readJsonBody(req, cb) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch (e) { cb(null, {}); }
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/* ── Request router ── */
const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const p = parsed.pathname;

  /* Async, non-blocking session list -- registry is in-memory, so this
     resolves immediately without touching disk or spawning anything.
     Client-side this is always called via fetch(), never sync XHR. */
  if (p === '/api/sessions' && req.method === 'GET') {
    return sendJson(res, 200, { sessions: listSessions() });
  }

  if (p === '/api/sessions' && req.method === 'POST') {
    return readJsonBody(req, (_, body) => {
      const entry = spawnSession(body && body.label);
      sendJson(res, 201, { id: entry.id, label: entry.label });
    });
  }

  const closeMatch = p.match(/^\/api\/sessions\/([a-f0-9]+)$/);
  if (closeMatch && req.method === 'DELETE') {
    const ok = closeSession(closeMatch[1]);
    return sendJson(res, ok ? 200 : 404, { ok });
  }

  if (p === '/kb.js') return serveStatic(res, KB_JS_PATH);
  if (p === '/' || p === '/index.html') return serveStatic(res, path.join(PUBLIC_DIR, 'session-manager.html'));
  if (p === '/session-manager.js') return serveStatic(res, path.join(PUBLIC_DIR, 'session-manager.js'));

  const termMatch = p.match(/^\/term\/([a-f0-9]+)(\/.*)?$/);
  if (termMatch) {
    const id = termMatch[1];
    const entry = sessions.get(id);
    if (!entry) { res.writeHead(404); return res.end('Session not found'); }
    entry.lastJoinedAt = Date.now();
    return proxyHttp(req, res, entry.port);
  }

  res.writeHead(404);
  res.end('Not found');
});

/* WebSocket upgrades for /term/<id>/ws (and any other upgrade requests
   ttyd's base-path issues under /term/<id>/*) */
server.on('upgrade', (req, socket, head) => {
  const parsed = new URL(req.url, 'http://localhost');
  const termMatch = parsed.pathname.match(/^\/term\/([a-f0-9]+)(\/.*)?$/);
  if (!termMatch) { socket.destroy(); return; }
  const entry = sessions.get(termMatch[1]);
  if (!entry) { socket.destroy(); return; }
  entry.lastJoinedAt = Date.now();
  proxyUpgrade(req, socket, head, entry.port);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('NomadTTY session-manager listening on 127.0.0.1:' + PORT);
});

/* Ensure orphaned tmux servers / ttyd children don't survive a manager
   process crash or restart -- but NOT on a normal client navigating
   away from a terminal view, since that never reaches this process. */
process.on('SIGTERM', () => { for (const id of sessions.keys()) closeSession(id); process.exit(0); });
process.on('SIGINT', () => { for (const id of sessions.keys()) closeSession(id); process.exit(0); });
