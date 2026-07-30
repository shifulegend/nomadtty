(function () {
  "use strict";

  /* ── DESIGN.md: async-only, never block the UI thread ──
     All registry reads/writes go through fetch(); no synchronous XHR,
     no blocking loops. Polling is interval-based and cheap (JSON list). */

  var listEl = document.getElementById('session-list');
  var statusEl = document.getElementById('list-status');
  var emptyEl = document.getElementById('empty-state');
  var newBtn = document.getElementById('new-session-btn');

  function fmtTime(ts) {
    if (!ts) return 'never joined';
    var d = new Date(ts);
    return d.toLocaleTimeString();
  }

  function render(sessions) {
    listEl.innerHTML = '';
    if (!sessions.length) {
      emptyEl.style.display = 'block';
      statusEl.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    statusEl.style.display = 'none';

    sessions.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'session-row';
      row.innerHTML =
        '<div class="session-info">' +
          '<div class="session-label">' + s.label + '</div>' +
          '<div class="session-meta">' + s.status + ' &middot; last joined: ' + fmtTime(s.lastJoinedAt) + '</div>' +
        '</div>' +
        '<div class="session-actions">' +
          '<button class="sm-btn join" data-id="' + s.id + '" title="Reattach to this session — its shell and scrollback are exactly as you left them.">Join</button>' +
          '<button class="sm-btn close" data-id="' + s.id + '" title="Permanently ends this session. This cannot be undone.">Close</button>' +
        '</div>';
      listEl.appendChild(row);
    });
  }

  function fetchSessions() {
    /* fetch() is inherently async/non-blocking; no code here can stall
       the main thread even if the network is slow. */
    fetch('/api/sessions')
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.sessions || []); })
      .catch(function () { statusEl.textContent = 'Failed to load sessions.'; });
  }

  function joinSession(id) {
    /* Navigating to /term/<id>/ re-mounts (or freshly mounts) the
       terminal view for that specific session. Because the tmux
       session backing this id was never killed, the shell's scroll
       history / buffer is exactly as it was when the user left. */
    window.location.href = '/term/' + id + '/';
  }

  function closeSession(id) {
    fetch('/api/sessions/' + id, { method: 'DELETE' })
      .then(function () { fetchSessions(); });
  }

  function createSession() {
    newBtn.disabled = true;
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        window.location.href = '/term/' + data.id + '/';
      })
      .finally(function () { newBtn.disabled = false; });
  }

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.sm-btn');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (btn.classList.contains('join')) joinSession(id);
    else if (btn.classList.contains('close')) closeSession(id);
  });

  newBtn.addEventListener('click', createSession);

  fetchSessions();
  /* Lightweight polling refresh -- purely for status/label freshness,
     never blocks rendering or input. */
  setInterval(fetchSessions, 5000);
})();
