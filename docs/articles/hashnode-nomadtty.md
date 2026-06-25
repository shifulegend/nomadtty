---
# HASHNODE PUBLISHING METADATA
# Title:       Self-Host a Mobile Web Terminal with ttyd, nginx, and tmux
# Subtitle:    A free Termius alternative that runs in any browser, with ESC, Ctrl, Tab, and F-keys built in
# Cover image: https://raw.githubusercontent.com/shifulegend/nomadtty/main/docs/images/cover.svg
# Tags:        self-hosted, devops, linux, docker, nginx
# Slug:        self-host-mobile-web-terminal-ttyd-nginx-tmux
# Canonical:   (leave blank — Hashnode will be the canonical)
# Enable TOC:  yes
#
# HOW TO PUBLISH:
#   1. Go to https://hashnode.com/new
#   2. Paste the article body below (everything after the --- line)
#   3. Set title, subtitle, tags, cover image from metadata above
#   4. Enable Table of Contents in article settings
#   5. Publish
#
# NOTE: Hashnode API requires a Pro plan (as of May 2026).
#       Manual publishing via https://hashnode.com/new is always free.
---

Every developer who has tried to use a real terminal from their phone has hit the same wall: **the mobile keyboard is missing half the keys you need**.

ESC is gone. Ctrl is gone. Tab is buried in a symbol menu. Arrow keys don't exist. F1–F12 are a fantasy.

The standard workaround is [Termius](https://termius.com/) — a polished mobile SSH client with a keyboard that actually includes those keys. It works. It's also $8–$14/month, proprietary, and SSH-only. If your workflow involves Tailscale, a web-based tool, or anything that isn't a raw SSH daemon, Termius isn't enough.

This post walks through **NomadTTY** — an open-source, self-hosted web terminal that runs in any browser and ships with a touch-friendly keyboard toolbar built in. No app. No subscription. One Docker command.

## What NomadTTY Is

NomadTTY wraps [ttyd](https://github.com/tsl0922/ttyd) — a tool that exposes a terminal session over WebSocket — with:

1. **nginx** — as a reverse proxy that injects the keyboard toolbar before the page reaches your browser
2. **tmux** — for persistent sessions that survive browser closes, network drops, and phone screen locks
3. **`src/kb.js`** — a 9 KB vanilla JavaScript keyboard toolbar injected at the nginx layer

The result: open a browser tab on your phone, get a full Linux terminal with a custom touch keyboard, and close the tab whenever you want — your session stays alive.

### Key capabilities

| What | How |
|------|-----|
| ESC, TAB, arrow keys | Toolbar buttons that send raw PTY bytes |
| Ctrl+C, Ctrl+Z, etc. | Sticky CTRL modifier — tap CTRL, then type a letter |
| Alt+B, Alt+F (readline) | Sticky ALT modifier — sends ESC prefix |
| Shift+Tab, Ctrl+arrow | Modifier combinations supported |
| F1–F12 | Toggle Fn row in the toolbar |
| Zoom | A− / A+ buttons scale the terminal font |
| Persistent sessions | tmux keeps bash alive across reconnects |

## Architecture

```
Phone / Tablet (browser)
         │
         ▼
     nginx :80
     ├── GET /kb.js   →  /var/www/nomadtty/kb.js   (9 KB toolbar, no-cache)
     ├── GET /ws      →  ttyd :47821  (WebSocket passthrough, no sub_filter)
     └── GET /        →  ttyd :47821  (HTML response with sub_filter injection)
                              │
                      sub_filter replaces <head> with:
                        1. viewport meta tag
                        2. WebSocket hook script (270 bytes inline)
                        3. <script src="/kb.js" defer></script>
                              │
                              ▼
                        ttyd → tmux new-session -A -s main
                              │
                              ▼
                        persistent bash session
```

The key architectural decision is **nginx's `sub_filter` as the injection mechanism**. When a browser requests the terminal page, nginx intercepts the response from ttyd and replaces the `<head>` tag with an expanded version that includes the toolbar. By the time the browser sees the HTML, the keyboard JavaScript is already wired in.

This means:
- No modifications to ttyd's source code
- No forking ttyd
- The toolbar is a completely separate concern from the terminal itself
- Updates to the toolbar don't require recompiling anything

## The WebSocket Hook

The toolbar needs to send keystrokes to the terminal. ttyd communicates over WebSocket at `/ws`. The challenge: the toolbar JavaScript loads *after* ttyd's own JavaScript, which means the WebSocket might already be established.

NomadTTY solves this by injecting a small hook *before* ttyd's scripts run:

```javascript
// Injected inline via nginx sub_filter — runs before ttyd's bundle
(function(){
  var _WS = window.WebSocket;
  window.WebSocket = function(url, p) {
    var ws = new _WS(url, p);
    if (url.indexOf('/ws') !== -1) window._S = ws;
    return ws;
  };
  window.WebSocket.prototype = _WS.prototype;
})();
```

This hooks `window.WebSocket` and captures the `/ws` connection as `window._S` at the moment ttyd creates it. The keyboard toolbar then calls:

```javascript
window._S.send('0' + bytes);
```

The `'0'` prefix is ttyd's protocol for PTY input. The same byte format ttyd's own frontend uses — no reverse engineering needed.

## Prerequisites

- Linux server (Debian/Ubuntu recommended) — cloud VM, VPS, Raspberry Pi, homelab server all work
- Docker, OR: nginx + ttyd + tmux installed via apt
- A way to reach the server from your phone: Tailscale (recommended), public IP, or local network

## Quick Start with Docker

```bash
docker run -d \
  -p 80:80 \
  --name nomadtty \
  ghcr.io/shifulegend/nomadtty:latest
```

Open `http://<your-server-ip>` in your phone browser. Done.

For `arm64` (Raspberry Pi, Apple Silicon):

```bash
docker run -d -p 80:80 --name nomadtty \
  --platform linux/arm64 \
  ghcr.io/shifulegend/nomadtty:latest
```

### Docker Compose

```yaml
version: "3.9"
services:
  nomadtty:
    image: ghcr.io/shifulegend/nomadtty:latest
    ports:
      - "80:80"
    environment:
      - NOMADTTY_HOST=terminal.example.com  # optional: your domain
      - TTYD_PORT=47821                     # optional: internal ttyd port
    restart: unless-stopped
```

## Install on Bare Metal (Debian/Ubuntu)

```bash
# One-command installer
curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | sudo bash

# With a custom domain
NOMADTTY_HOST=terminal.example.com sudo -E bash -c \
  'curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | bash'
```

### What the installer does

1. Installs `ttyd`, `tmux`, `nginx` via apt if not present
2. Copies `src/kb.js` to `/var/www/nomadtty/kb.js`
3. Writes the nginx vhost to `/etc/nginx/sites-available/nomadtty`
4. Enables the site and reloads nginx
5. Copies the systemd service file and enables ttyd

After install, `ttyd` runs as a systemd service (`systemctl status ttyd`) on port 47821 (localhost only). nginx handles everything public-facing.

## Manual Install (Step by Step)

### Step 1 — Install dependencies

```bash
sudo apt-get update
sudo apt-get install -y ttyd tmux nginx
```

### Step 2 — Deploy the toolbar

```bash
sudo mkdir -p /var/www/nomadtty
sudo cp src/kb.js /var/www/nomadtty/kb.js
```

### Step 3 — Configure nginx

Copy `nginx/ttyd.conf` to `/etc/nginx/sites-available/nomadtty`, then edit `server_name`:

```nginx
server {
    listen 80;
    server_name terminal.example.com;  # ← your domain or IP

    # Serve the keyboard toolbar
    location = /kb.js {
        root /var/www/nomadtty;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # WebSocket — no sub_filter here (incompatible with WS upgrade headers)
    location /ws {
        proxy_pass http://127.0.0.1:47821;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Terminal HTML — inject toolbar via sub_filter
    location / {
        proxy_pass http://127.0.0.1:47821;
        proxy_set_header Accept-Encoding "";  # prevent gzip breaking sub_filter
        sub_filter_once on;
        sub_filter '<head>'
          '<head><meta name="viewport" content="width=device-width,initial-scale=1,interactive-widget=resizes-content"><script>(function(){var W=window.WebSocket;window.WebSocket=function(u,p){var ws=new W(u,p);if(u.indexOf("/ws")!==-1)window._S=ws;return ws};window.WebSocket.prototype=W.prototype})();</script><script src="/kb.js" defer></script>';
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/nomadtty /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Step 4 — Start ttyd as a service

```bash
sudo cp systemd/ttyd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ttyd
```

Verify it's running:

```bash
systemctl status ttyd
ss -tlnp | grep ttyd   # should show 127.0.0.1:47821
```

## Tailscale Integration

If you use [Tailscale](https://tailscale.com/) (highly recommended for keeping NomadTTY off the public internet):

```bash
# Set server_name to your Tailscale hostname or IP
NOMADTTY_HOST=$(tailscale ip -4) sudo -E bash -c \
  'curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | bash'
```

Your NomadTTY terminal will be reachable only by devices on your Tailscale network — no public exposure, no firewall rules needed.

## The Keyboard Toolbar in Detail

The toolbar is two rows:

**Row 1 (always visible):** ESC · CTRL · SHFT · ALT · TAB · ⇑TAB · ↑ · ↓ · ← · → · Fn · A− · A+

**Row 2 (Fn toggle):** F1 · F2 · F3 · F4 · F5 · F6 · F7 · F8 · F9 · F10 · F11 · F12

### Sticky modifiers

CTRL, SHFT, and ALT are sticky — they stay active (highlighted blue) until you type a key. Examples:

- `CTRL` → `c` on your phone keyboard → sends `Ctrl+C` (`\x03`)
- `CTRL` → `z` → `Ctrl+Z` (`\x1a`)
- `ALT` → `b` → `Alt+B` (readline backward-word, ESC prefix)
- `CTRL` + `SHFT` → `6` → `Ctrl+Shift+6` (tmux synchronized panes toggle)

### Modifier combinations

All three modifiers can combine. Tap CTRL then SHFT then type — the toolbar accumulates sticky modifiers until you type a character.

### PTY byte table

| Button | Sends | Use case |
|--------|-------|----------|
| ESC | `\x1b` | Exit vim insert mode, dismiss prompts |
| TAB | `\t` | Path completion, menu navigation |
| ⇑TAB | `\x1b[Z` | Reverse tab completion |
| ↑/↓ | `\x1b[A` / `\x1b[B` | History navigation |
| ←/→ | `\x1b[D` / `\x1b[C` | Cursor movement |
| HOME | `\x1b[H` | Jump to line start |
| END | `\x1b[F` | Jump to line end |
| PGUP | `\x1b[5~` | Scroll up in tmux/less |
| PGDN | `\x1b[6~` | Scroll down |
| DEL | `\x1b[3~` | Forward delete |

## What NomadTTY Is Not

Before you set this up, know the limitations:

**NomadTTY is not an SSH client.** It doesn't do tunneling, SOCKS proxying, or port forwarding. It's a web interface to a terminal process on the machine running ttyd. If you need multi-hop access through a bastion, you still need SSH for that hop — then run NomadTTY on the destination.

**One server per instance.** There's no multi-server UI. Each NomadTTY install points to one server's terminal. If you have three servers, run three NomadTTY instances (or use tmux windows to SSH from within the terminal).

**Authentication is your responsibility.** NomadTTY doesn't ship with its own auth layer. Options:
- Tailscale (no exposed ports, strong auth)
- nginx basic auth
- Your own VPN
- Cloudflare Access

**No offline mode.** It's a web app. It needs a network connection.

## Compared to the Alternatives

| Tool | Price | Auth | SSH? | Browser-native? | Touch keyboard? |
|------|-------|------|------|-----------------|-----------------|
| **NomadTTY** | Free (self-host) | You handle it | No (web terminal) | Yes | Yes (built in) |
| Termius | $8–$14/mo | In-app | Yes | No (app) | Yes |
| Blink Shell | $20 one-time | In-app | Yes | No (app) | Limited |
| ttyd (bare) | Free | No | No | Yes | No |
| wetty | Free | No | Optional | Yes | No |
| JuiceSSH | Free/paid | In-app | Yes | No (app) | Limited |

NomadTTY fills a gap: **browser-native + touch keyboard + self-hosted + free**. No other tool in this space hits all four.

## Security Considerations

1. **Don't expose port 80 to the public internet without authentication.** Anyone who reaches the URL gets a shell. Use Tailscale, a VPN, or nginx basic auth.
2. **Run ttyd as a non-root user.** The included systemd service uses `User=ubuntu` (configurable). Change it to match your deploy user.
3. **The `--writable` flag in ttyd is required.** Without it, the terminal is display-only and keystrokes are dropped.
4. **`sub_filter` only applies to the HTML response**, not to WebSocket frames. WebSocket traffic is proxied unchanged.

## The Stack in Numbers

- **`src/kb.js`**: 9 KB, 260 lines, vanilla JS IIFE, zero npm dependencies
- **nginx config**: 40 lines
- **systemd service**: 15 lines
- **install.sh**: 120 lines, passes `shellcheck`
- **Dockerfile**: Ubuntu 24.04 base, multi-arch (amd64 + arm64)
- **Sub_filter injection string**: 270 bytes (nginx limit is ~4 KB)

## Get It

→ **[github.com/shifulegend/nomadtty](https://github.com/shifulegend/nomadtty)**

```bash
# Docker (30 seconds to running)
docker run -d -p 80:80 --name nomadtty ghcr.io/shifulegend/nomadtty:latest

# Bare metal (Debian/Ubuntu)
curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | sudo bash
```

MIT licensed. Contributions welcome — see [CONTRIBUTING.md](https://github.com/shifulegend/nomadtty/blob/main/CONTRIBUTING.md).

---

If you set this up, I'd be curious what your use case is — running Claude Code remotely, monitoring deployments, or something else entirely. And if you hit a limitation (multi-server support, auth, something else), drop it in the comments. The roadmap is shaped by what people actually need.
