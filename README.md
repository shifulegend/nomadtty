# NomadTTY

**A mobile-friendly web terminal you can access from anywhere.**

NomadTTY wraps [ttyd](https://github.com/tsl0922/ttyd) with a purpose-built mobile keyboard toolbar — giving you ESC, TAB, arrow keys, modifier keys (Ctrl/Shift/Alt), F1–F12, and more, all from a phone or tablet browser. Sessions are persistent via [tmux](https://github.com/tmux/tmux), so closing your browser never kills your work.

---

## Features

- **Mobile-first toolbar** — tap CTRL, SHFT, or ALT to activate sticky modifiers, then type on your phone keyboard to send `Ctrl+C`, `Alt+B`, etc.
- **Full navigation keys** — ESC, TAB, Shift+TAB, ↑↓←→, HOME, END, PGUP, PGDN, INS, DEL
- **F1–F12** via Fn toggle row
- **Modifier combinations** — CTRL+SHFT, CTRL+ALT, ALT+SHFT and all three together
- **Pinch-to-zoom safe** — `touch-action: pan-y` prevents accidental iOS zoom
- **Mobile keyboard aware** — `visualViewport` listener resizes the terminal when the on-screen keyboard appears/disappears
- **Responsive font** — 14 px desktop → 13 px tablet → 12 px phone
- **Persistent sessions** — tmux keeps your session alive across disconnects
- **Zero JavaScript dependencies** — pure vanilla JS, ~9 KB, injected via nginx `sub_filter`

---

## Quick Install (Debian / Ubuntu)

```bash
curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | sudo bash
```

With a custom domain:

```bash
NOMADTTY_HOST=terminal.example.com sudo -E bash -c \
  'curl -fsSL https://raw.githubusercontent.com/shifulegend/nomadtty/main/install.sh | bash'
```

---

## Docker

### Run pre-built image (amd64 / arm64)

```bash
docker run -d -p 80:80 --name nomadtty ghcr.io/shifulegend/nomadtty:latest
```

Then open `http://localhost` in your browser.

### Build locally

```bash
git clone https://github.com/shifulegend/nomadtty.git
cd nomadtty
docker compose up -d
```

### Multi-arch build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/shifulegend/nomadtty:latest \
  --push .
```

---

## Manual Install

### 1 — Install dependencies

```bash
sudo apt-get install -y ttyd tmux nginx
```

### 2 — Deploy the toolbar

```bash
sudo mkdir -p /var/www/nomadtty
sudo cp src/kb.js /var/www/nomadtty/kb.js
```

### 3 — Configure nginx

```bash
sudo cp nginx/ttyd.conf /etc/nginx/sites-available/nomadtty
# Edit server_name to match your domain:
sudo nano /etc/nginx/sites-available/nomadtty
sudo ln -sf /etc/nginx/sites-available/nomadtty /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4 — Start ttyd as a service

```bash
sudo cp systemd/ttyd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ttyd
```

---

## Keyboard Toolbar Reference

| Key | What it sends |
|-----|--------------|
| **CTRL** | Sticky modifier — tap then press a letter for Ctrl+letter |
| **SHFT** | Sticky shift modifier |
| **ALT** | Sticky alt modifier — sends ESC prefix |
| **ESC** | `\x1b` |
| **TAB** | `\t` |
| **⇑TAB** | Shift+Tab `\x1b[Z` |
| **↑↓←→** | Arrow keys (with modifier support: Ctrl+↑, Shift+↑, etc.) |
| **HOME / END** | `\x1b[H` / `\x1b[F` |
| **PGUP / PGDN** | `\x1b[5~` / `\x1b[6~` |
| **INS / DEL** | `\x1b[2~` / `\x1b[3~` |
| **Fn** | Toggle F1–F12 row |
| **F1–F12** | Standard xterm sequences |
| **A− / A+** | Zoom terminal text in/out |

---

## Architecture

```
Phone / Tablet (Tailscale)
       │
       ▼
   nginx :80
   ├── GET /kb.js  →  /var/www/nomadtty/kb.js  (toolbar JS, no-cache)
   ├── GET /ws     →  ttyd :47821  (WebSocket, pass-through)
   └── GET /       →  ttyd :47821  (HTML + sub_filter injects viewport meta
                                    + WebSocket hook + <script src="/kb.js" defer>)
                                        │
                                        ▼
                               ttyd spawns: tmux new-session -A -s main
                                        │
                                        ▼
                                  persistent bash session
```

---

## Tailscale Setup

To expose NomadTTY only on your Tailscale network (no public internet):

```bash
# Add a DNS record pointing terminal.yourdomain.com to your Tailscale IP
# in your Tailscale DNS settings or via dnsmasq.

# Or use Tailscale Serve for automatic HTTPS:
tailscale serve --bg http://localhost:80
```

---

## License

NomadTTY itself is MIT licensed. See [LICENSE](LICENSE).

Third-party components (ttyd, xterm.js, tmux, nginx) are credited in [NOTICE](NOTICE).
