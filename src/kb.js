(function () {
  /* ── Modifier state ── */
  var M = { c: false, s: false, a: false };
  var zoom = 1, fnOpen = false;

  /* ── History scroll state ── */
  var SESSION_ID = (location.pathname.match(/^\/term\/([a-f0-9]+)\//) || [])[1];
  var histMode = false;

  /* ── Send bytes to PTY ── */
  function send(d) {
    var s = window._S;
    if (s && s.readyState === 1) s.send('0' + d);
  }

  /* ── Modifier code for xterm CSI sequences ── */
  function modCode() {
    if (M.c && M.s && M.a) return 8;
    if (M.c && M.s)         return 6;
    if (M.c && M.a)         return 7;
    if (M.s && M.a)         return 4;
    if (M.c)                return 5;
    if (M.s)                return 2;
    if (M.a)                return 3;
    return 1;
  }

  function setMod(k, v) {
    M[k] = v;
    var ids = { c: 'kb-c', s: 'kb-s', a: 'kb-a' };
    var el = document.getElementById(ids[k]);
    if (el) el.classList.toggle('on', M[k]);
  }
  function resetMods() { setMod('c',false); setMod('s',false); setMod('a',false); }

  /* ── Navigation key sequences ── */
  var NAV = {
    ESC:  '\x1b',
    TAB:  '\t',
    STAB: '\x1b[Z',
    HOME: '\x1b[H',
    END:  '\x1b[F',
    PGUP: '\x1b[5~',
    PGDN: '\x1b[6~',
    DEL:  '\x1b[3~',
    INS:  '\x1b[2~',
  };

  /* ── F-key sequences ── */
  var FK = [
    '\x1bOP','\x1bOQ','\x1bOR','\x1bOS',
    '\x1b[15~','\x1b[17~','\x1b[18~','\x1b[19~',
    '\x1b[20~','\x1b[21~','\x1b[23~','\x1b[24~'
  ];
  var FK_CODES = [11,12,13,14,15,17,18,19,20,21,23,24];

  /* ── Global button handlers ── */
  window.KN = function (k, e) {
    e.preventDefault();
    send(NAV[k]);
  };

  window.KA = function (d, e) {
    e.preventDefault();
    var mod = modCode();
    send(mod === 1 ? '\x1b[' + d : '\x1b[1;' + mod + d);
    resetMods();
  };

  window.KF = function (i, e) {
    e.preventDefault();
    var mod = modCode();
    if (mod === 1) {
      send(FK[i - 1]);
    } else {
      send('\x1b[' + FK_CODES[i-1] + ';' + mod + '~');
    }
    resetMods();
  };

  window.KM = function (k, e) {
    e.preventDefault();
    setMod(k, !M[k]);
  };

  window.KP = function (e) {
    e.preventDefault();
    /* HTTPS: use clipboard API directly */
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) { send(text); });
      return;
    }
    /* HTTP fallback: show a visible textarea so iOS native paste menu works */
    var ov = document.createElement('textarea');
    ov.style.cssText = 'position:fixed;top:50%;left:50%;' +
      'transform:translate(-50%,-50%);width:220px;height:70px;z-index:999999;' +
      'font-size:16px;background:#1e1e1e;color:#ccc;' +
      'border:2px solid #0077ff;border-radius:8px;padding:8px;' +
      '-webkit-user-select:auto;user-select:auto;';
    ov.placeholder = 'Long-press here → Paste';
    document.body.appendChild(ov);
    ov.focus();
    ov.addEventListener('paste', function (ev) {
      var text = (ev.clipboardData || window.clipboardData).getData('text');
      if (text) send(text);
      document.body.removeChild(ov);
    });
    /* close overlay if user taps away without pasting */
    ov.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.body.contains(ov)) document.body.removeChild(ov);
      }, 300);
    });
  };

  window.TFN = function (e) {
    e.preventDefault();
    fnOpen = !fnOpen;
    var r = document.getElementById('fn-row');
    if (r) r.style.display = fnOpen ? 'flex' : 'none';
    var b = document.getElementById('kb-fn');
    if (b) b.classList.toggle('on', fnOpen);
    setTimeout(updateLayout, 30);
  };

  window.KZ = function (d, e) {
    e.preventDefault();
    zoom = Math.max(0.5, Math.min(2.5, zoom + d * 0.15));
    var xterm = document.querySelector('.xterm');
    if (xterm) xterm.style.zoom = zoom;
  };

  /* ── History scroll (drives tmux copy-mode server-side; see the block
     near initTouchScroll below for the full rationale) ── */
  function postScroll(body) {
    if (!SESSION_ID) return;
    fetch('/api/sessions/' + SESSION_ID + '/copy-scroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {}); // fire-and-forget, same as session creation elsewhere
  }

  window.KH = function (e) {
    e.preventDefault();
    histMode = !histMode;
    var b = document.getElementById('kb-hist');
    if (b) b.classList.toggle('on', histMode);
    postScroll({ action: histMode ? 'enter' : 'exit' });
  };

  /* ── Physical keyboard intercept for active modifiers ── */
  /* Capture-phase + stopPropagation: this must run and fully claim the
     event BEFORE xterm.js's own bubble-phase keydown handler on its hidden
     textarea sees it. preventDefault() alone only suppresses the browser's
     default action (text insertion) -- it does NOT stop other listeners
     from running, so without stopPropagation() xterm.js's own handler still
     fires on the same event and independently forwards the raw, unmodified
     key to the PTY, producing a double-send (e.g. CTRL+c would send both
     the intercepted 0x03 byte AND a literal "c"). See docs/ai/mistakes.md
     for the discovery of this. */
  document.addEventListener('keydown', function (ev) {
    if (!M.c && !M.s && !M.a) return;
    var k = ev.key;
    if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (k.length === 1) {
      if (M.a) {
        send('\x1b' + (M.s ? k.toUpperCase() : k));
      } else if (M.c) {
        var code = k.toUpperCase().charCodeAt(0) - 64;
        if (code > 0 && code < 32) send(String.fromCharCode(code));
        else send(k);
      } else if (M.s) {
        send(k.toUpperCase());
      }
      resetMods();
    }
  }, true);

  /* ── Layout: keep terminal container below toolbar and above keyboard ── */
  /* Re-entrancy guard: updateLayout() dispatches a 'resize' event (below)
     so ttyd's own fitAddon recalculates cols/rows, but updateLayout is
     ALSO registered as a 'resize' listener itself (see window.addEventListener
     near the bottom of this file). Without this guard, dispatching 'resize'
     synchronously re-invokes updateLayout from within itself, which
     dispatches 'resize' again, forever -- an unbounded synchronous
     recursion that throws "Maximum call stack size exceeded" and can
     leave the terminal's layout pass incomplete (blank/broken rendering).
     This has been present since the very first commit; nothing previously
     exercised it against a real browser to surface it. The guard makes
     the re-entrant call from our own dispatch a no-op while still letting
     the dispatched event reach every OTHER 'resize' listener (ttyd's own
     fitAddon included) exactly once. */
  var inUpdateLayout = false;
  function updateLayout() {
    if (inUpdateLayout) return;
    inUpdateLayout = true;
    try {
      var kb = document.getElementById('kb');
      var tc = document.getElementById('terminal-container');
      if (!kb) return;
      var toolbarH = kb.getBoundingClientRect().height;
      /* Use visualViewport.height (shrinks on iOS when keyboard opens) rather
         than window.innerHeight (doesn't shrink on iOS). Setting an explicit
         height — not bottom — is the only reliable approach on iOS Safari:
         position:fixed + bottom:X is broken when the keyboard is open. */
      var vvh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      var termH = Math.max(100, vvh - toolbarH);
      if (tc) {
        /* Replace cssText entirely (not +=) to avoid duplicate declarations
           accumulating across calls, which confuses Safari's style engine. */
        tc.style.cssText = 'position:fixed!important;top:' + toolbarH + 'px!important;' +
          'left:0!important;right:0!important;bottom:auto!important;' +
          'width:100%!important;height:' + termH + 'px!important;margin:0!important;';
      }
      /* fire resize so ttyd's fitAddon recalculates cols/rows */
      window.dispatchEvent(new Event('resize'));
    } finally {
      inUpdateLayout = false;
    }
  }

  /* ── visualViewport: refit when mobile keyboard shows/hides ── */
  if (window.visualViewport) {
    var vvTimer;
    function onVVChange() {
      /* Debounce: visualViewport.resize fires on every tiny keyboard
         adjustment during typing. Only refit after it settles (150 ms)
         so we don't fire fitAddon or dispatch resize mid-keystroke. */
      clearTimeout(vvTimer);
      vvTimer = setTimeout(updateLayout, 150);
    }
    window.visualViewport.addEventListener('resize', onVVChange);
  }

  /* ── ResizeObserver on terminal container for belt-and-suspenders ── */
  function watchTerminalContainer() {
    var tc = document.getElementById('terminal-container');
    if (!tc) return;
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () {
        window.dispatchEvent(new Event('resize'));
      }).observe(tc);
    }
  }

  /* ── Build toolbar HTML ── */
  function btn(label, handler, id) {
    var a = id ? ' id="' + id + '"' : '';
    return '<button' + a + ' onclick="' + handler + '" ontouchend="' + handler + '">' + label + '</button>';
  }

  var row1 = [
    btn('CTRL',      "KM('c',event)", 'kb-c'),
    btn('SHFT',      "KM('s',event)", 'kb-s'),
    btn('ALT',       "KM('a',event)", 'kb-a'),
    '<span class="sep"></span>',
    btn('ESC',       "KN('ESC',event)"),
    btn('TAB',       "KN('TAB',event)"),
    btn('&uArr;TAB', "KN('STAB',event)"),
    '<span class="sep"></span>',
    btn('&uarr;',    "KA('A',event)"),
    btn('&darr;',    "KA('B',event)"),
    btn('&larr;',    "KA('D',event)"),
    btn('&rarr;',    "KA('C',event)"),
    '<span class="sep"></span>',
    btn('HOME',      "KN('HOME',event)"),
    btn('END',       "KN('END',event)"),
    btn('PGUP',      "KN('PGUP',event)"),
    btn('PGDN',      "KN('PGDN',event)"),
    btn('INS',       "KN('INS',event)"),
    btn('DEL',       "KN('DEL',event)"),
    '<span class="sep"></span>',
    btn('Hist',      "KH(event)", 'kb-hist'),
    btn('Paste',     "KP(event)"),
    '<span class="sep"></span>',
    btn('Fn',        "TFN(event)", 'kb-fn'),
    btn('A&minus;',  "KZ(-1,event)"),
    btn('A+',        "KZ(1,event)"),
  ].join('');

  var fnrow = '';
  for (var i = 1; i <= 12; i++) fnrow += btn('F'+i, 'KF('+i+',event)');

  /* ── Styles ── */
  var css = [
    /* global resets for mobile */
    'html,body{height:100%;margin:0;overflow:hidden;',
      'overscroll-behavior:none;',        /* prevent bounce on iOS/Android */
      'touch-action:pan-y;}',             /* block double-tap zoom on iOS */

    /* toolbar */
    '#kb{position:fixed;top:0;left:0;right:0;z-index:99999;',
      'background:#111;border-bottom:1px solid #222;',
      'display:flex;flex-direction:column;gap:2px;',
      'padding:3px;padding-top:calc(3px + env(safe-area-inset-top));',
      'box-shadow:0 2px 6px rgba(0,0,0,.7);}',

    /* padding-right reserves space so scrolling this row all the way to its
       end doesn't leave the last button(s) sitting directly under the
       fixed #back-btn circle (top-right corner, 34px wide + 8px offset) --
       without it, swiping to the end of row1 puts "A+" completely behind
       the Back button, making it untappable. See docs/ai/mistakes.md. */
    '.kr{display:flex;gap:2px;overflow-x:auto;padding-right:48px;',
      '-webkit-overflow-scrolling:touch;scrollbar-width:none;}',
    '.kr::-webkit-scrollbar{display:none;}',

    '.sep{display:inline-block;width:1px;flex:0 0 1px;',
      'background:#2a2a2a;margin:3px 2px;align-self:stretch;}',

    /* buttons — base size, enlarged on phone */
    '#kb button{',
      'background:#1e1e1e;color:#ccc;border:1px solid #333;',
      'border-radius:5px;padding:7px 4px;',
      'font:11px/1 monospace;min-width:38px;flex:0 0 auto;',
      '-webkit-user-select:none;user-select:none;',
      'touch-action:manipulation;cursor:pointer;',
      '-webkit-tap-highlight-color:transparent;}',

    '#kb button:active{background:#005fcc;color:#fff;border-color:#0077ff;}',
    '#kb button.on{background:#0052cc;color:#fff;border-color:#0077ff;',
      'box-shadow:0 0 4px #0077ff88;}',

    /* terminal container — fixed below toolbar, fills rest */
    '#terminal-container{',
      'position:fixed!important;',
      'top:44px!important;',   /* overridden dynamically by updateLayout() */
      'left:0!important;right:0!important;bottom:0!important;',
      'width:auto!important;height:auto!important;margin:0!important;}',

    /* responsive font scaling */
    ':root{--tf:14;}',
    '@media(max-width:768px){:root{--tf:13;}}',
    '@media(max-width:480px){:root{--tf:12;}}',
    /* xterm.js picks fontSize from Terminal constructor, but we can
       scale the rendered canvas with CSS zoom for quick responsiveness */
    '@media(max-width:480px){.xterm{font-size:12px!important;}}',
    '@media(max-width:768px) and (min-width:481px){.xterm{font-size:13px!important;}}',

    /* prevent iOS callout (long-press popup) on terminal */
    '#terminal-container{-webkit-user-select:none;}',
    /* do NOT block the hidden textarea — it captures keyboard input */
    '#terminal-container .xterm-helper-textarea{pointer-events:auto!important;}',

    /* ── Scroll fixes ── */
    /* ttyd+tmux bug (#636): xterm-viewport loses overflow-y:scroll — force it back.
       Without this, desktop mouse wheel and touch scroll both silently fail.
       Hide the scrollbar visually (scrollbar-width:none + webkit) so it doesn't
       eat into terminal width, while keeping overflow-y:scroll so xterm.js can
       still use scrollTop to track position. */
    '.xterm-viewport{overflow-y:scroll!important;overscroll-behavior:none;',
      'scrollbar-width:none;}',
    '.xterm-viewport::-webkit-scrollbar{display:none;}',
    /* Canvas blocks touch; we handle touch ourselves below */
    '.xterm-screen{touch-action:none!important;}',

    /* ── Back button (Session Manager overlay) ──
       position:fixed + its own z-index layer, NOT part of #kb toolbar rows.
       Deliberately excluded from updateLayout()'s toolbarH math, so it
       consumes 0% of the terminal grid -- it only visually overlays the
       canvas. See DESIGN.md for full rationale. */
    '#back-btn{position:fixed;',
      'top:calc(8px + env(safe-area-inset-top));',
      'right:calc(8px + env(safe-area-inset-right));',
      'z-index:100000;width:34px;height:34px;border-radius:50%;',
      'background:rgba(17,17,17,.85);color:#ccc;border:1px solid #333;',
      'display:flex;align-items:center;justify-content:center;',
      'font:16px/1 monospace;-webkit-tap-highlight-color:transparent;',
      'touch-action:manipulation;pointer-events:auto;}',
    '#back-btn:active{background:#005fcc;color:#fff;border-color:#0077ff;}',

  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var kb = document.createElement('div');
  kb.id = 'kb';
  kb.innerHTML =
    '<div class="kr">' + row1 + '</div>' +
    '<div class="kr" id="fn-row" style="display:none">' + fnrow + '</div>';
  document.body.insertBefore(kb, document.body.firstChild);

  /* ── Suppress accidental button presses from scroll/drag gestures ──
     Each toolbar button fires its action directly from its own
     `ontouchend` attribute, not from the browser's synthesized 'click'
     (which natively tolerates a small amount of finger movement before
     suppressing itself) -- so without this guard, ANY touch gesture that
     starts or passes through a button and lifts while still over an
     element fires that element's action, even a full-width swipe used to
     scroll `.kr`'s horizontally-scrolling row. A capture-phase listener on
     `#kb` (an ancestor of every button) sees touchstart/touchmove/touchend
     before each button's own bubble-phase handler, so it can measure total
     finger movement and, if it exceeds a small tap-vs-drag threshold, call
     stopPropagation() (and preventDefault(), which also suppresses the
     compatibility click Chrome would otherwise still synthesize) to stop
     the event from ever reaching the button's own handler. A genuine
     stationary tap (movement under the threshold) is untouched. */
  var DRAG_THRESHOLD_PX = 10;
  var touchStartX = 0, touchStartY = 0, touchDragged = false;
  kb.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchDragged = false;
  }, { capture: true, passive: true });
  kb.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) touchDragged = true;
  }, { capture: true, passive: true });
  kb.addEventListener('touchend', function (e) {
    if (!touchDragged) return;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });

  /* ── Back button: return to server-rendered Session Manager ──
     With the backend Session Manager (server/session-manager.js) now
     owning session lifecycle, the Back button simply navigates the
     browser to "/" -- the Session Manager list page. This unloads the
     current page's WebSocket connection (browsers always close a page's
     sockets on navigation), but that is purely the *client* view.
     The backend ttyd process and its wrapped tmux session are never
     sent SIGTERM/SIGKILL by navigation -- only the Session Manager's
     explicit "Close" action does that (see server/session-manager.js
     closeSession()). tmux itself buffers scrollback server-side, so
     when the user re-Joins via /term/<id>/, a fresh WebSocket attaches
     to the *same* tmux session and its scroll buffer is intact --
     nothing about scrollback lives in the browser tab that was closed.
     This button is still position:fixed, 0% of the terminal grid, and
     never touches #terminal-container's box or fires a resize event. */
  var backBtn = document.createElement('button');
  backBtn.id = 'back-btn';
  backBtn.setAttribute('aria-label', 'Back to Session Manager');
  backBtn.innerHTML = '&larr;';
  document.body.appendChild(backBtn);

  function goToSessionManager(e) {
    if (e) e.preventDefault();
    window.location.href = '/';
  }

  backBtn.addEventListener('click', goToSessionManager);
  backBtn.addEventListener('touchend', goToSessionManager);


  /* Run layout after DOM settles and again after xterm renders */
  setTimeout(updateLayout, 100);
  setTimeout(updateLayout, 600);
  setTimeout(function () { updateLayout(); watchTerminalContainer(); }, 1500);
  window.addEventListener('resize', updateLayout);

  /* ── Touch scroll: drives tmux copy-mode server-side, NOT xterm.js's
     client-side scrollback -- see docs/ai/mistakes.md 2026-07-29-018.
     This used to dispatch a synthetic WheelEvent on .xterm per touchmove
     step, on the theory that xterm.js's own wheel handler would scroll its
     client-side scrollback buffer. That was wrong for THIS app: every
     session runs inside tmux (a hard architectural invariant, see
     CLAUDE.md), which manages history entirely server-side and never
     feeds xterm.js's own client buffer, so there was NEVER anything for a
     wheel event to scroll into -- every dispatch fell through to xterm.js's
     "nothing left to scroll" fallback, sending literal Up/Down-arrow key
     ESCAPE SEQUENCES into the PTY as real input, corrupting the screen of
     any foreground process not reading stdin.
     Fixed here by driving tmux's own copy-mode instead (postScroll(),
     above), exactly as the prior fix's own follow-up note prescribed: when
     "Hist" is toggled on (KH), a swipe here POSTs enter/scroll actions to
     server/session-manager.js, which runs `tmux copy-mode`/`send-keys -X`
     against the pane ttyd is already attached to -- ttyd's own live
     connection then redraws the real scrollback into the browser
     automatically, no client-side buffer or extra render path needed. No
     PTY input byte is ever sent by this gesture, in or out of Hist mode,
     so the original corruption bug is structurally impossible here.
     Direction: natural/content-follows-finger scrolling -- finger drags
     DOWN (content follows down) reveals OLDER history (tmux "scroll-up");
     finger drags UP reveals newer/live (tmux "scroll-down"). LINE_PX is
     an approximate row height in CSS px, only needs to be roughly right
     since it just paces how many tmux lines one swipe covers.
     touchmove's preventDefault() is unconditional (in or out of Hist
     mode) to keep suppressing iOS's page-bounce overscroll effect. */
  var LINE_PX = 18;
  function initTouchScroll() {
    var xterm = document.querySelector('.xterm');
    if (!xterm) { setTimeout(initTouchScroll, 400); return; }

    var lastY = 0, accY = 0;
    xterm.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      lastY = e.touches[0].clientY;
      accY = 0;
    }, { passive: true });

    xterm.addEventListener('touchmove', function (e) {
      console.log('DEBUG_TOUCHMOVE', 'touches=' + e.touches.length, 'histMode=' + histMode);
      if (e.touches.length !== 1) return;
      e.preventDefault();
      if (!histMode) return;
      var y = e.touches[0].clientY;
      accY += y - lastY;
      lastY = y;
      var lines = Math.trunc(accY / LINE_PX);
      console.log('DEBUG_TOUCHMOVE_CALC', 'y=' + y, 'accY=' + accY, 'lines=' + lines);
      if (lines === 0) return;
      postScroll({ action: 'scroll', direction: lines > 0 ? 'up' : 'down', lines: Math.abs(lines) });
      accY -= lines * LINE_PX;
    }, { passive: false });
  }
  setTimeout(initTouchScroll, 800);

  /* Guarantee every fresh page load/reconnect starts from a known-live
     pane, self-healing any copy-mode left engaged by a previous tab that
     was closed/backgrounded mid-scroll (histMode itself is just an
     in-memory JS var, so it can't reflect that on its own). Harmless
     no-op if the pane was already live. */
  postScroll({ action: 'exit' });
})();
