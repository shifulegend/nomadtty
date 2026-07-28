# DESIGN.md

<!-- Design system reference for NomadTTY UI additions -->
<!-- Scope: branding/navigation elements layered on top of the terminal view -->
<!-- last updated: 2026-07-29 -->

## Purpose

NomadTTY's primary surface is a **terminal emulator canvas** (xterm.js, rendered via ttyd), not a conventional web app. Any branding or navigation element added to the UI must respect this constraint first. This document defines which modern web-app design patterns are safe to borrow, and which actively conflict with a terminal-first, mobile-first product.

## Color Palette

- **Base**: near-black background (`#111`, `#0b0b0c`) matching the default terminal theme so overlays don't create a jarring contrast flash when toggled.
- **Accent**: single blue accent (`#0077ff` / `#0052cc`) reused from the existing toolbar's active/pressed states (`#kb button.on`, `#kb button:active`). Do not introduce a second accent hue — terminal users associate color changes with shell output, not chrome.
- **Text**: muted gray (`#ccc`) for default UI text, white (`#fff`) only for active/pressed state or headings, to avoid a bright, "app-like" surface competing with terminal text brightness.
- **Avoid**: gradients, drop shadows beyond a subtle `box-shadow` for elevation, and saturated brand colors (purples, greens) that could be confused with ANSI color codes rendered inside the terminal itself.

## Typography

- **Monospace only** (`font: 11–16px/1 monospace`). Any UI chrome using a proportional/sans-serif font breaks the visual continuity with the terminal content and looks like a foreign overlay.
- **Small, utilitarian sizing**: 11–13px for buttons/labels, 16–18px max for headings in modal-style overlays (e.g., Session Manager). Terminal users expect density, not marketing-site scale typography.
- **Avoid**: variable font weights, letter-spacing tricks, or display fonts. These read as "SaaS landing page," not "terminal tool."

## Touch-Target Sizing (Mobile-First)

- Minimum touch target: **34–38px** square/circle, consistent with existing toolbar buttons (`min-width:38px`, `padding:7px 4px`). This meets the practical mobile minimum (Apple HIG recommends 44pt; Android Material recommends 48dp) while staying compact enough not to eat into limited terminal real estate on small screens.
- Circular buttons (e.g., Back button) should have equal width/height and be positioned with `env(safe-area-inset-*)` padding to clear iOS notches/home indicators.
- **Avoid**: touch targets smaller than ~34px (below common mobile accessibility thresholds) and avoid large full-width buttons/banners that consume vertical space from the terminal grid.

## Layout & Positioning Patterns

### Apply
- **`position: fixed` overlays** with their own `z-index` stacking layer, kept fully outside the flow of `#terminal-container` and `#kb`. This is how the existing toolbar and the new Back button both work — they float above the canvas without participating in its box model.
- **`display:none` / `display:flex` toggling** to show/hide overlay UI (Session Manager) instead of adding/removing DOM nodes, which avoids layout thrashing and avoids re-triggering `ResizeObserver` on `#terminal-container`.
- Explicit `top`/`right`/`left` fixed coordinates plus `env(safe-area-inset-*)`, matching the pattern already used by `#kb`.

### Avoid
- **Flexbox/grid siblings that share layout flow** with the terminal container. Any new nav element inserted into the same flex/grid context as `#terminal-container` will force a reflow of the terminal grid, which is exactly what Rule 3 in `AGENTS.md` forbids.
- **Percentage-based or `auto` sizing** for nav chrome. Fixed pixel dimensions on overlay elements guarantee they don't consume any of the terminal's calculated `width`/`height` in `updateLayout()`.
- **CSS transitions/animations on `width`/`height`/`top`/`left` of anything measured by `updateLayout()`.** Animating opacity/transform on the *overlay itself* is fine; animating anything that changes `#terminal-container`'s box is not — it will fire spurious `resize` events via the `ResizeObserver` already watching that element.
- **Hamburger menus / bottom nav bars that reserve permanent screen space.** Terminal real estate is the product; navigation chrome must be either a small persistent overlay (current Back button) or a full-screen modal state (Session Manager), never a permanent strip that shrinks the grid.

## Interaction Patterns

- Reuse `touch-action:manipulation` and `-webkit-tap-highlight-color:transparent` on all new interactive elements, exactly as the existing toolbar buttons do, to avoid iOS's default 300ms tap delay and gray tap flash.
- New overlay UI must never call `window.dispatchEvent(new Event('resize'))` unless it is intentionally re-fitting the terminal (as `updateLayout()` does). Unrelated navigation actions (opening/closing Session Manager) must not trigger this event.

## Summary Table

| Pattern | Modern web-app default | NomadTTY rule |
|---|---|---|
| Font | Sans-serif, variable weight | Monospace only |
| Color | Multi-hue brand palette | Single accent blue + terminal-matched neutrals |
| Nav | Bottom bar / hamburger (reserves space) | Fixed-position overlay (reserves 0% grid space) |
| Show/hide | Mount/unmount DOM | Toggle `display` on persistent nodes |
| Touch targets | 44–48px per platform HIG | 34–38px, consistent with existing toolbar |
| Resize handling | Implicit via CSS layout | Explicit, `updateLayout()`-only, never from nav actions |
