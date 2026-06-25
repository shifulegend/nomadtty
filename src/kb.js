(function () {
  /* ── Modifier state ── */
  var M = { c: false, s: false, a: false };
  var zoom = 1, fnOpen = false;

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

  /* ── Physical keyboard intercept for active modifiers ── */
  document.addEventListener('keydown', function (ev) {
    if (!M.c && !M.s && !M.a) return;
    var k = ev.key;
    if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;
    ev.preventDefault();
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
  function updateLayout() {
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

    '.kr{display:flex;gap:2px;overflow-x:auto;',
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

  /* Run layout after DOM settles and again after xterm renders */
  setTimeout(updateLayout, 100);
  setTimeout(updateLayout, 600);
  setTimeout(function () { updateLayout(); watchTerminalContainer(); }, 1500);
  window.addEventListener('resize', updateLayout);

  /* ── Touch scroll: finger swipe → xterm.js wheel events ──
     xterm.js has no built-in touch scroll (issue #5377). The canvas captures
     all touch events but ignores vertical swipes. We intercept touchmove on
     .xterm and dispatch a synthetic WheelEvent on .xterm-viewport, which is
     the element xterm.js's own wheel handler already listens to. Works on
     iOS Safari, Chrome Android, and iPad. */
  function initTouchScroll() {
    var xterm = document.querySelector('.xterm');
    var vp    = document.querySelector('.xterm-viewport');
    if (!xterm || !vp) { setTimeout(initTouchScroll, 400); return; }

    var lastY = 0;

    xterm.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      lastY = e.touches[0].clientY;
    }, { passive: true });

    xterm.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();             /* suppress iOS page-bounce */
      var y     = e.touches[0].clientY;
      var delta = (lastY - y) * 3;   /* px delta; ×3 for comfortable sensitivity */
      lastY = y;
      /* Dispatch on .xterm (outer element) so xterm.js mouse-reporting mode
         picks it up and forwards to tmux as scroll sequences. Bubbles:true
         means a dispatch on vp also reaches this listener, but targeting
         xterm directly is more reliable across xterm.js versions. */
      xterm.dispatchEvent(new WheelEvent('wheel', {
        deltaY:    delta,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles:   true,
        cancelable: true,
      }));
    }, { passive: false });           /* passive:false required to call preventDefault */

    xterm.addEventListener('touchend', function () {
      lastY = 0;
    }, { passive: true });
  }
  setTimeout(initTouchScroll, 800);
})();
